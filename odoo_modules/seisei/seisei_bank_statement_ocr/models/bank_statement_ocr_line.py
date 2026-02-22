from odoo import models, fields, api


class SeiseiBankStatementOcrLine(models.Model):
    _name = 'seisei.bank.statement.ocr.line'
    _description = 'AI Bank Statement Transaction Line'
    _order = 'sequence, id'

    ocr_id = fields.Many2one('seisei.bank.statement.ocr', required=True, ondelete='cascade')
    sequence = fields.Integer('Seq', default=10)
    date = fields.Date('Date', required=True)
    description = fields.Char('Description', required=True)
    withdrawal = fields.Float('Withdrawal', digits=(16, 0))
    deposit = fields.Float('Deposit', digits=(16, 0))
    balance = fields.Float('Balance', digits=(16, 0))
    reference = fields.Char('Reference')
    partner_id = fields.Many2one('res.partner', 'Partner')
    partner_name = fields.Char('Counterparty (OCR)')

    amount = fields.Float(
        'Amount', compute='_compute_amount', store=True, digits=(16, 0),
    )
    balance_warning = fields.Boolean(
        'Balance Warning', compute='_compute_balance_warning', store=True,
    )

    @api.depends('deposit', 'withdrawal')
    def _compute_amount(self):
        for line in self:
            line.amount = line.deposit - line.withdrawal

    @api.depends('balance', 'deposit', 'withdrawal')
    def _compute_balance_warning(self):
        for line in self:
            if not line.balance:
                line.balance_warning = False
                continue

            siblings = line.ocr_id.line_ids.sorted('sequence')
            my_idx = next(
                (i for i, s in enumerate(siblings) if s.id == line.id), None,
            )

            # First line in the record — never warn
            if my_idx is None or my_idx == 0:
                line.balance_warning = False
                continue

            prev = siblings[my_idx - 1]
            if not prev.balance:
                # Previous line has no balance (not printed) — can't verify
                line.balance_warning = False
                continue

            expected = prev.balance + line.deposit - line.withdrawal
            line.balance_warning = abs(line.balance - expected) >= 1
