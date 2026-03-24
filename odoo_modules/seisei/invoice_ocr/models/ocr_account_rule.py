from odoo import models, fields


class OcrAccountRule(models.Model):
    _name = 'ocr.account.rule'
    _description = 'Account Learning Rule'
    _order = 'hit_count desc, last_used desc'
    _rec_name = 'match_value'

    client_id = fields.Many2one('ocr.client', 'Client', required=True, ondelete='cascade')
    match_type = fields.Selection([
        ('item', 'Item Exact Match'),
        ('seller', 'Seller Match'),
    ], string='Match Type', required=True)
    match_value = fields.Char('Match Value', required=True, index=True)
    debit_account = fields.Many2one(
        'ocr.account', 'Debit Account',
        domain=[('account_type', '=', 'debit'), ('active', '=', True)],
    )
    credit_account = fields.Many2one(
        'ocr.account', 'Credit Account',
        domain=[('account_type', '=', 'credit'), ('active', '=', True)],
    )
    hit_count = fields.Integer('Hit Count', default=1)
    last_used = fields.Datetime('Last Used', default=fields.Datetime.now)
    active = fields.Boolean('Active', default=True)
