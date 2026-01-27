from odoo import models, fields, api
from odoo.exceptions import UserError
import base64
import logging

_logger = logging.getLogger(__name__)


class OcrUploadWizard(models.TransientModel):
    _name = 'ocr.upload.wizard'
    _description = 'OCR Upload Wizard'

    move_id = fields.Many2one('account.move', string='Invoice/Bill', required=True)
    file_data = fields.Binary(string='Invoice/Receipt File', required=True, attachment=False)
    file_name = fields.Char(string='File Name')
    
    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        active_id = self.env.context.get('active_id')
        active_model = self.env.context.get('active_model')
        
        if active_model == 'account.move' and active_id:
            res['move_id'] = active_id
        return res
    
    def action_upload_and_ocr(self):
        """Upload file and process OCR"""
        self.ensure_one()
        
        if not self.file_data:
            raise UserError('Please select a file to upload!')
        
        if not self.file_name:
            raise UserError('File name is required!')
        
        move = self.move_id
        
        # Determine mime type from file name
        file_name_lower = self.file_name.lower()
        if file_name_lower.endswith('.pdf'):
            mimetype = 'application/pdf'
        elif file_name_lower.endswith(('.jpg', '.jpeg')):
            mimetype = 'image/jpeg'
        elif file_name_lower.endswith('.png'):
            mimetype = 'image/png'
        elif file_name_lower.endswith('.gif'):
            mimetype = 'image/gif'
        elif file_name_lower.endswith('.webp'):
            mimetype = 'image/webp'
        else:
            raise UserError('Unsupported file type! Please upload PDF or image file (JPG, PNG, GIF, WebP).')
        
        # Create attachment
        attachment = self.env['ir.attachment'].create({
            'name': self.file_name,
            'datas': self.file_data,
            'res_model': 'account.move',
            'res_id': move.id,
            'mimetype': mimetype,
        })
        
        _logger.info('[OCR Wizard] Created attachment %s for move %s', attachment.id, move.id)
        
        # Set as main attachment
        move.message_main_attachment_id = attachment.id
        
        # Now call the OCR processing
        return move.action_process_ocr()
