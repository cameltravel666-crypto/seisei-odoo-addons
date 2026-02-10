from odoo import models, fields, api


class SeiseiBankStatementOcrLine(models.Model):
    _name = 'seisei.bank.statement.ocr.line'
    _description = 'Bank Statement OCR Transaction Line'
    _order = 'date, sequence'

    ocr_id = fields.Many2one('seisei.bank.statement.ocr', required=True, ondelete='cascade')
    sequence = fields.Integer('順番', default=10)
    date = fields.Date('日付', required=True)
    description = fields.Char('摘要', required=True)
    withdrawal = fields.Float('出金', digits=(16, 0))
    deposit = fields.Float('入金', digits=(16, 0))
    balance = fields.Float('残高', digits=(16, 0))
    reference = fields.Char('整理番号')
    partner_id = fields.Many2one('res.partner', 'パートナー')
    partner_name = fields.Char('取引先名（OCR）')

    amount = fields.Float(
        '金額', compute='_compute_amount', store=True, digits=(16, 0),
    )
    balance_warning = fields.Boolean(
        '残高不整合', compute='_compute_balance_warning', store=True,
    )

    @api.depends('deposit', 'withdrawal')
    def _compute_amount(self):
        for line in self:
            line.amount = line.deposit - line.withdrawal

    @api.depends('balance', 'deposit', 'withdrawal', 'sequence')
    def _compute_balance_warning(self):
        for line in self:
            if not line.balance:
                line.balance_warning = False
                continue
            prev_lines = line.ocr_id.line_ids.filtered(
                lambda l: l.sequence < line.sequence
            ).sorted('sequence')
            if prev_lines:
                prev = prev_lines[-1]
                if prev.balance:
                    expected = prev.balance + line.deposit - line.withdrawal
                    line.balance_warning = abs(expected - line.balance) > 0.5
                else:
                    line.balance_warning = False
            else:
                line.balance_warning = False
