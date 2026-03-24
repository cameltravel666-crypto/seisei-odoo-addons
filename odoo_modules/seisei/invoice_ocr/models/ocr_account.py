from odoo import models, fields


class OcrAccount(models.Model):
    _name = 'ocr.account'
    _description = 'OCR Account (科目マスタ)'
    _order = 'account_type, sequence, name'
    _rec_name = 'display_name'

    name = fields.Char('Account Name', required=True)
    code = fields.Char('Code', required=True, index=True)
    account_type = fields.Selection([
        ('debit', 'Debit (借方)'),
        ('credit', 'Credit (貸方)'),
    ], string='Type', required=True, index=True)
    yayoi_name = fields.Char('Yayoi Export Name',
                             help='Account name used in Yayoi CSV export')
    sequence = fields.Integer('Sequence', default=10)
    active = fields.Boolean('Active', default=True)

    display_name = fields.Char(
        'Display Name', compute='_compute_display_name', store=True,
    )

    _sql_constraints = [
        ('code_type_uniq', 'unique(code, account_type)',
         'Account code must be unique per type.'),
    ]

    @staticmethod
    def _compute_display_name_single(rec):
        return rec.name or ''

    def _compute_display_name(self):
        for rec in self:
            rec.display_name = rec.name or ''

    def name_get(self):
        return [(rec.id, rec.name or '') for rec in self]
