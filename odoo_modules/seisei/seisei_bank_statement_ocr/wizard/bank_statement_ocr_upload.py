import logging

from odoo import models, fields
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class BankStatementOcrUpload(models.TransientModel):
    _name = 'seisei.bank.statement.ocr.upload'
    _description = 'Bank Statement OCR Upload Wizard'

    journal_id = fields.Many2one(
        'account.journal',
        '銀行口座 / 银行账户 / Bank Account',
        required=True,
        domain=[('type', '=', 'bank')],
    )
    attachment_ids = fields.Many2many(
        'ir.attachment',
        string='ファイル / 文件 / Files',
    )

    def action_upload_and_ocr(self):
        """Create one OCR record per uploaded file and trigger OCR."""
        self.ensure_one()
        if not self.attachment_ids:
            raise UserError(
                'ファイルを選択してください。\n'
                '请选择文件。\n'
                'Please select files.'
            )

        OcrRecord = self.env['seisei.bank.statement.ocr']
        created_ids = []

        for attachment in self.attachment_ids:
            record = OcrRecord.create({
                'journal_id': self.journal_id.id,
                'attachment_ids': [(6, 0, [attachment.id])],
            })
            created_ids.append(record.id)

        # Trigger OCR on all created records
        for record in OcrRecord.browse(created_ids):
            try:
                record.action_process_ocr()
            except Exception as e:
                _logger.exception(f'[BankStmtOCR] Upload OCR failed for {record.id}: {e}')
                record.ocr_error_message = str(e)
                record.state = 'failed'

        if len(created_ids) == 1:
            return {
                'type': 'ir.actions.act_window',
                'res_model': 'seisei.bank.statement.ocr',
                'res_id': created_ids[0],
                'view_mode': 'form',
                'target': 'current',
            }
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'seisei.bank.statement.ocr',
            'view_mode': 'list,form',
            'domain': [('id', 'in', created_ids)],
            'target': 'current',
        }
