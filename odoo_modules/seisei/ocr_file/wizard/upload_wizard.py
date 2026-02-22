# -*- coding: utf-8 -*-

import base64
import logging
from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class OcrFileUploadLine(models.TransientModel):
    """Transient model for individual file in batch upload"""
    _name = 'ocr.file.upload.line'
    _description = 'AI File Upload Line'

    wizard_id = fields.Many2one('ocr.file.upload.wizard', string='Wizard', required=True, ondelete='cascade')
    file_data = fields.Binary(string='File', required=True, attachment=False)
    filename = fields.Char(string='Filename')


class OcrFileUploadWizard(models.TransientModel):
    """Wizard for batch uploading multiple source files"""
    _name = 'ocr.file.upload.wizard'
    _description = 'AI File Upload Wizard'

    task_id = fields.Many2one('ocr.file.task', string='Task', required=True)
    file_ids = fields.One2many('ocr.file.upload.line', 'wizard_id', string='Files')

    def action_upload(self):
        """Create source file records from uploaded files"""
        self.ensure_one()

        if not self.file_ids:
            return {'type': 'ir.actions.act_window_close'}

        OcrSource = self.env['ocr.file.source']
        count = 0

        for line in self.file_ids:
            if line.file_data:
                OcrSource.create({
                    'task_id': self.task_id.id,
                    'source_file': line.file_data,
                    'source_filename': line.filename,
                    'state': 'pending',
                    'sequence': 10 + count,
                })
                count += 1

        _logger.info(f"[OCR File] Added {count} files to task {self.task_id.id}")

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Files Added',
                'message': f'{count} file(s) added successfully.',
                'type': 'success',
                'sticky': False,
                'next': {'type': 'ir.actions.act_window_close'},
            }
        }
