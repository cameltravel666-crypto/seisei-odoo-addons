import base64
import zipfile
import io
from odoo import models, fields, api
from odoo.exceptions import UserError


class OcrBatchImport(models.TransientModel):
    _name = 'ocr.batch.import'
    _description = '批量导入票据'

    upload_mode = fields.Selection([
        ('multi', '批量选择文件'),
        ('zip', 'ZIP压缩包'),
        ('single', '逐个上传'),
    ], string='上传方式', default='multi')

    multi_files = fields.Many2many(
        'ir.attachment',
        'ocr_batch_import_ir_attachment_rel',
        'wizard_id', 'attachment_id',
        string='选择文件',
        help='支持 JPG/PNG/PDF 等格式，可一次选择多个文件',
    )

    zip_file = fields.Binary('ZIP 压缩包')
    zip_filename = fields.Char('ZIP 文件名')

    file_ids = fields.One2many('ocr.batch.import.line', 'wizard_id', '文件列表')
    auto_recognize = fields.Boolean('导入后自动识别', default=True)
    client_id = fields.Many2one('ocr.client', '客户')
    
    def _prepare_doc_vals(self, name, image_data, filename):
        """Build common vals dict for creating ocr.document."""
        vals = {
            'name': name,
            'image': image_data,
            'image_filename': filename,
        }
        if self.client_id:
            vals['client_id'] = self.client_id.id
        return vals

    def action_import(self):
        """执行批量导入"""
        OcrDocument = self.env['ocr.document']
        created_ids = []
        allowed_ext = {'jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'pdf'}

        # 批量选择文件模式
        if self.upload_mode == 'multi' and self.multi_files:
            for att in self.multi_files:
                fname = att.name or 'file'
                ext = fname.lower().rsplit('.', 1)[-1] if '.' in fname else ''
                if ext not in allowed_ext:
                    continue
                doc = OcrDocument.create(
                    self._prepare_doc_vals(fname, att.datas, fname)
                )
                created_ids.append(doc.id)
            # Clean up temporary attachments
            self.multi_files.unlink()

        # ZIP 模式
        elif self.upload_mode == 'zip' and self.zip_file:
            zip_data = base64.b64decode(self.zip_file)

            with zipfile.ZipFile(io.BytesIO(zip_data), 'r') as zf:
                for filename in zf.namelist():
                    if filename.endswith('/') or filename.startswith('__') or filename.startswith('.'):
                        continue

                    ext = filename.lower().rsplit('.', 1)[-1] if '.' in filename else ''
                    if ext not in allowed_ext:
                        continue

                    file_data = zf.read(filename)
                    short_name = filename.split('/')[-1]
                    doc = OcrDocument.create(
                        self._prepare_doc_vals(short_name, base64.b64encode(file_data), short_name)
                    )
                    created_ids.append(doc.id)

        # 单文件模式
        elif self.file_ids:
            for line in self.file_ids:
                doc = OcrDocument.create(
                    self._prepare_doc_vals(line.filename or '批量导入票据', line.file_data, line.filename)
                )
                created_ids.append(doc.id)

        if not created_ids:
            raise UserError('没有找到可导入的文件！请确认上传了 JPG/PNG/PDF 等格式的文件。')

        # Send import-complete notification
        self.env['bus.bus']._sendone(
            self.env.user.partner_id,
            'simple_notification',
            {
                'title': '批量导入',
                'message': f'已导入 {len(created_ids)} 张票据' + ('，开始自动识别...' if self.auto_recognize else ''),
                'type': 'success',
                'sticky': False,
            },
        )
        self.env.cr.commit()

        # 自动识别 (will send per-document progress notifications)
        if self.auto_recognize:
            docs = OcrDocument.browse(created_ids)
            docs.action_recognize()

        return {
            'type': 'ir.actions.act_window',
            'name': f'已导入 {len(created_ids)} 张票据',
            'res_model': 'ocr.document',
            'view_mode': 'list,form',
            'domain': [('id', 'in', created_ids)],
            'target': 'current',
        }


class OcrBatchImportLine(models.TransientModel):
    _name = 'ocr.batch.import.line'
    _description = '批量导入文件行'

    wizard_id = fields.Many2one('ocr.batch.import', '向导')
    file_data = fields.Binary('文件', required=True)
    filename = fields.Char('文件名')
