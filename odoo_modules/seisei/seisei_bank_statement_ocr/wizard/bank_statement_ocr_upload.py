import logging

from odoo import models, fields, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class BankStatementOcrUpload(models.TransientModel):
    _name = 'seisei.bank.statement.ocr.upload'
    _description = 'AI Bank Statement Upload Wizard'

    journal_id = fields.Many2one(
        'account.journal',
        'Bank Account',
        required=True,
        domain=[('type', '=', 'bank')],
    )
    attachment_ids = fields.Many2many(
        'ir.attachment',
        string='Files',
    )

    def action_upload_and_ocr(self):
        """Create ONE OCR record with all uploaded files and trigger OCR."""
        self.ensure_one()
        if not self.attachment_ids:
            raise UserError(_('Please select files.'))

        record = self.env['seisei.bank.statement.ocr'].create({
            'journal_id': self.journal_id.id,
            'attachment_ids': [(6, 0, self.attachment_ids.ids)],
        })

        try:
            record.action_process_ocr()
        except Exception as e:
            _logger.exception(f'[BankStmtOCR] Upload OCR failed for {record.id}: {e}')
            record.ocr_error_message = str(e)
            record.state = 'failed'

        return {
            'type': 'ir.actions.act_window',
            'res_model': 'seisei.bank.statement.ocr',
            'res_id': record.id,
            'view_mode': 'form',
            'target': 'current',
        }
