import base64
import logging

from odoo import models, fields, api
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class BankStatementOcrUploadLine(models.TransientModel):
    _name = 'seisei.bank.statement.ocr.upload.line'
    _description = 'Bank Statement OCR Upload File Line'

    wizard_id = fields.Many2one('seisei.bank.statement.ocr.upload', required=True, ondelete='cascade')
    file_data = fields.Binary('ファイル', required=True)
    filename = fields.Char('ファイル名')


class BankStatementOcrUpload(models.TransientModel):
    _name = 'seisei.bank.statement.ocr.upload'
    _description = 'Bank Statement OCR Upload Wizard'

    journal_id = fields.Many2one('account.journal', '銀行口座', required=True,
                                  domain=[('type', '=', 'bank')])
    upload_mode = fields.Selection([
        ('single', '1件ずつ'),
        ('batch', '一括アップロード'),
    ], default='single', string='アップロード方式')

    # Single upload
    upload_file = fields.Binary('ファイル')
    upload_filename = fields.Char('ファイル名')

    # Batch upload
    file_ids = fields.One2many('seisei.bank.statement.ocr.upload.line', 'wizard_id', 'ファイル一覧')

    def action_upload_and_ocr(self):
        """Create OCR record(s), attach file(s), and trigger OCR."""
        self.ensure_one()
        OcrRecord = self.env['seisei.bank.statement.ocr']
        created_ids = []

        if self.upload_mode == 'single':
            if not self.upload_file:
                raise UserError('ファイルを選択してください。')
            record = self._create_ocr_record(self.upload_file, self.upload_filename)
            created_ids.append(record.id)
        else:
            if not self.file_ids:
                raise UserError('ファイルを追加してください。')
            for line in self.file_ids:
                record = self._create_ocr_record(line.file_data, line.filename)
                created_ids.append(record.id)

        # Trigger OCR on all created records
        records = OcrRecord.browse(created_ids)
        for record in records:
            try:
                record.action_process_ocr()
            except Exception as e:
                _logger.exception(f'[BankStmtOCR] Upload OCR failed for {record.id}: {e}')
                record.ocr_error_message = str(e)
                record.state = 'failed'

        # Navigate to the created records
        if len(created_ids) == 1:
            return {
                'type': 'ir.actions.act_window',
                'res_model': 'seisei.bank.statement.ocr',
                'res_id': created_ids[0],
                'view_mode': 'form',
                'target': 'current',
            }
        else:
            return {
                'type': 'ir.actions.act_window',
                'res_model': 'seisei.bank.statement.ocr',
                'view_mode': 'list,form',
                'domain': [('id', 'in', created_ids)],
                'target': 'current',
            }

    def _create_ocr_record(self, file_data, filename):
        """Create an OCR record with the file as attachment."""
        attachment = self.env['ir.attachment'].create({
            'name': filename or 'bank_statement_scan',
            'datas': file_data,
            'res_model': 'seisei.bank.statement.ocr',
            'type': 'binary',
        })
        record = self.env['seisei.bank.statement.ocr'].create({
            'journal_id': self.journal_id.id,
            'attachment_ids': [(6, 0, [attachment.id])],
        })
        return record
