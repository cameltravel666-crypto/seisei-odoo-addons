import base64
import zipfile
import io
from odoo import models, fields, api
from odoo.exceptions import UserError


class OcrBatchImport(models.TransientModel):
    _name = 'ocr.batch.import'
    _description = '批量导入票据'

    upload_mode = fields.Selection([
        ('single', '单文件上传'),
        ('zip', 'ZIP压缩包'),
    ], string='上传方式', default='zip')
    
    zip_file = fields.Binary('ZIP 压缩包')
    zip_filename = fields.Char('ZIP 文件名')
    
    file_ids = fields.One2many('ocr.batch.import.line', 'wizard_id', '文件列表')
    auto_recognize = fields.Boolean('导入后自动识别', default=True)
    
    def action_import(self):
        """执行批量导入"""
        OcrDocument = self.env['ocr.document']
        created_ids = []
        
        # ZIP 模式
        if self.upload_mode == 'zip' and self.zip_file:
            zip_data = base64.b64decode(self.zip_file)
            
            with zipfile.ZipFile(io.BytesIO(zip_data), 'r') as zf:
                for filename in zf.namelist():
                    # 跳过目录和隐藏文件
                    if filename.endswith('/') or filename.startswith('__') or filename.startswith('.'):
                        continue
                    
                    # 只处理图片文件
                    ext = filename.lower().split('.')[-1]
                    if ext not in ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'pdf']:
                        continue
                    
                    file_data = zf.read(filename)
                    doc = OcrDocument.create({
                        'name': filename.split('/')[-1],
                        'image': base64.b64encode(file_data),
                        'image_filename': filename.split('/')[-1],
                    })
                    created_ids.append(doc.id)
        
        # 单文件模式
        elif self.file_ids:
            for line in self.file_ids:
                doc = OcrDocument.create({
                    'name': line.filename or '批量导入票据',
                    'image': line.file_data,
                    'image_filename': line.filename,
                })
                created_ids.append(doc.id)
        
        if not created_ids:
            raise UserError('没有找到可导入的文件！')
        
        # 自动识别
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
