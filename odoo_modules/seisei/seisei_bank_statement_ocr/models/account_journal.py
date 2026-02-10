from odoo import models


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    def action_ocr_bank_statement_upload(self):
        """Open the OCR bank statement upload wizard from dashboard."""
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'seisei.bank.statement.ocr.upload',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_journal_id': self.id,
            },
        }
