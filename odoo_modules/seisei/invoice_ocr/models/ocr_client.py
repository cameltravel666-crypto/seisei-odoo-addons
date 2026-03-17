from odoo import models, fields

from .ocr_document_line import DEBIT_ACCOUNTS, CREDIT_ACCOUNTS


class OcrClient(models.Model):
    _name = 'ocr.client'
    _description = '票据客户'
    _order = 'name'

    name = fields.Char('客户名称', required=True)
    code = fields.Char('客户代码')
    active = fields.Boolean('有效', default=True)
    default_debit_account = fields.Selection(
        DEBIT_ACCOUNTS, '默认借方科目',
    )
    default_credit_account = fields.Selection(
        CREDIT_ACCOUNTS, '默认贷方科目',
    )
    note = fields.Text('备注')
    document_ids = fields.One2many('ocr.document', 'client_id', '关联票据')
    document_count = fields.Integer(
        '票据数', compute='_compute_document_count',
    )
    rule_ids = fields.One2many('ocr.account.rule', 'client_id', '学习规则')
    rule_count = fields.Integer('规则数', compute='_compute_document_count')

    def _compute_document_count(self):
        for rec in self:
            rec.document_count = len(rec.document_ids)
            rec.rule_count = len(rec.rule_ids)
