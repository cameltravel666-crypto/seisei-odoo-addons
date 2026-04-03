import base64
import logging
import zipfile
import io

from odoo import models, fields, api
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'}


class OcrBatchImport(models.TransientModel):
    _name = 'ocr.batch.import'
    _description = 'Batch Import'

    upload_mode = fields.Selection([
        ('multi', 'Multi-file'),
        ('zip', 'ZIP Archive'),
        ('single', 'One by One'),
    ], string='Upload Mode', default='multi')

    multi_files = fields.Many2many(
        'ir.attachment',
        'ocr_batch_import_ir_attachment_rel',
        'wizard_id', 'attachment_id',
        string='Select Files',
        help='Supports JPG/PNG/PDF. Select multiple files at once.',
    )

    zip_file = fields.Binary('ZIP Archive')
    zip_filename = fields.Char('ZIP Filename')

    file_ids = fields.One2many('ocr.batch.import.line', 'wizard_id', 'File List')
    auto_recognize = fields.Boolean('Auto-recognize after import', default=True)
    client_id = fields.Many2one('ocr.client', 'Client')

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
        allowed_ext = IMAGE_EXTENSIONS | {'pdf'}

        # 批量选择文件模式 — read all data first, then unlink
        if self.upload_mode == 'multi' and self.multi_files:
            file_list = []
            for att in self.multi_files:
                fname = att.name or 'file'
                ext = fname.lower().rsplit('.', 1)[-1] if '.' in fname else ''
                if ext not in allowed_ext:
                    continue
                # Read data immediately (before unlink)
                file_list.append((fname, att.datas))
            # Clean up temporary attachments first
            self.multi_files.unlink()

            for fname, data in file_list:
                if not data:
                    _logger.warning('Batch import: empty data for %s, skipping', fname)
                    continue
                doc = OcrDocument.create(
                    self._prepare_doc_vals(fname, data, fname)
                )
                created_ids.append(doc.id)

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
                    self._prepare_doc_vals(line.filename or 'Imported Document', line.file_data, line.filename)
                )
                created_ids.append(doc.id)

        if not created_ids:
            raise UserError('No importable files found! Please upload JPG/PNG/PDF files.')

        msg = f'{len(created_ids)} documents imported'
        if self.auto_recognize:
            msg += ', queued for background recognition'

        self.env['bus.bus']._sendone(
            self.env.user.partner_id,
            'simple_notification',
            {'title': 'Batch Import', 'message': msg, 'type': 'success', 'sticky': False},
        )

        # Mark for queue processing (auto_recognize just means "enter queue")
        # The cron job _cron_recognize_queue picks them up automatically
        # state=draft is the queue — cron processes them in FIFO order

        return {
            'type': 'ir.actions.act_window',
            'name': msg,
            'res_model': 'ocr.document',
            'view_mode': 'list,form',
            'domain': [('id', 'in', created_ids)],
            'target': 'current',
        }


class OcrBatchImportLine(models.TransientModel):
    _name = 'ocr.batch.import.line'
    _description = 'Batch Import Line'

    wizard_id = fields.Many2one('ocr.batch.import', 'Wizard')
    file_data = fields.Binary('File', required=True)
    filename = fields.Char('Filename')
