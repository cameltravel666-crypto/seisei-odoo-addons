from odoo import models, fields

from .ocr_document_line import DEBIT_ACCOUNTS, CREDIT_ACCOUNTS


class OcrAccountRule(models.Model):
    _name = 'ocr.account.rule'
    _description = '科目学习规则'
    _order = 'hit_count desc, last_used desc'
    _rec_name = 'match_value'

    client_id = fields.Many2one('ocr.client', '客户', required=True, ondelete='cascade')
    match_type = fields.Selection([
        ('item', '品名精确匹配'),
        ('seller', '店铺匹配'),
    ], string='匹配类型', required=True)
    match_value = fields.Char('匹配值', required=True, index=True)
    debit_account = fields.Selection(DEBIT_ACCOUNTS, '借方科目')
    credit_account = fields.Selection(CREDIT_ACCOUNTS, '贷方科目')
    hit_count = fields.Integer('命中次数', default=1)
    last_used = fields.Datetime('最后使用', default=fields.Datetime.now)
    active = fields.Boolean('有效', default=True)
