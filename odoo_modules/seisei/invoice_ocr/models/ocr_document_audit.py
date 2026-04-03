import logging

from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class OcrDocumentAudit(models.Model):
    """Audit flags and batch fix actions for OCR documents."""
    _inherit = 'ocr.document'

    audit_flags = fields.Char(
        'Audit Flags', compute='_compute_audit_flags', store=True,
        help='Comma-delimited issue codes for searchability',
    )
    audit_flag_count = fields.Integer(
        'Issue Count', compute='_compute_audit_flags', store=True,
    )

    @api.depends(
        'state', 'invoice_date', 'seller_name',
        'amount', 'subtotal', 'tax_amount',
        'line_ids', 'line_ids.gross_amount', 'line_ids.debit_account',
    )
    def _compute_audit_flags(self):
        zappi = self.env['ocr.account'].search(
            [('code', '=', 'zappi'), ('account_type', '=', 'debit')], limit=1,
        )
        for doc in self:
            flags = []
            # Only flag non-draft/non-error docs
            active = doc.state in ('done', 'reviewed', 'confirmed')

            if active and not doc.invoice_date:
                flags.append('missing_date')
            if active and not doc.seller_name:
                flags.append('missing_seller')
            if active and doc.amount == 0:
                flags.append('zero_amount')
            if active and not doc.line_ids:
                flags.append('no_lines')
            if active and doc.subtotal > 0 and doc.tax_amount > 0 and doc.amount > 0:
                expected = doc.subtotal + doc.tax_amount
                if abs(doc.amount - expected) > 2:
                    flags.append('tax_mismatch')
            if active and zappi and doc.line_ids:
                zappi_lines = doc.line_ids.filtered(
                    lambda l: l.debit_account.id == zappi.id
                )
                if zappi_lines and len(zappi_lines) == len(doc.line_ids):
                    flags.append('suspicious_account')

            doc.audit_flags = ',' + ','.join(flags) + ',' if flags else ''
            doc.audit_flag_count = len(flags)

    # ------------------------------------------------------------------
    # Batch fix actions (called from list view header buttons)
    # ------------------------------------------------------------------

    def action_batch_fix_empty_lines(self):
        """Re-trigger OCR recognition for docs with zero amount or no lines."""
        targets = self.filtered(
            lambda d: d.state == 'done' and (d.amount == 0 or not d.line_ids)
        )
        if not targets:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'message': 'No documents with empty lines/zero amount in selection.',
                    'type': 'warning',
                    'sticky': False,
                },
            }
        # Reset to draft, then re-recognize
        targets.write({'state': 'draft'})
        targets.action_recognize()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': f'{len(targets)} documents re-processed.',
                'type': 'success',
                'sticky': False,
            },
        }

    def action_batch_reclassify(self):
        """Re-run account classification on all lines of selected documents."""
        count = 0
        for doc in self.filtered(lambda d: d.state in ('done', 'reviewed')):
            for line in doc.line_ids:
                old = line.debit_account
                line.debit_account = line._guess_debit_account()
                if line.debit_account != old:
                    count += 1
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': f'{count} lines reclassified across {len(self)} documents.',
                'type': 'success',
                'sticky': False,
            },
        }
