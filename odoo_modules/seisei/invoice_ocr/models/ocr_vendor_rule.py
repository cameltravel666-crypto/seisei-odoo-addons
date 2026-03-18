import re

from odoo import models, fields, api


class OcrVendorRule(models.Model):
    _name = 'ocr.vendor.rule'
    _description = '供应商识别规则'
    _order = 'priority, id'
    _rec_name = 'vendor_pattern'

    client_id = fields.Many2one('ocr.client', '客户', required=True, ondelete='cascade')
    vendor_pattern = fields.Char(
        '供应商匹配', required=True,
        help='店铺名称包含此文字即匹配（支持正则）。例: 川奈畜産、ガソリン|GS',
    )
    active = fields.Boolean('有效', default=True)
    priority = fields.Integer('优先级', default=10, help='数字越小优先级越高')

    # --- Tax rules ---
    force_tax_rate = fields.Selection([
        ('8', '8%（軽減税率・食品类）'),
        ('10', '10%（标准税率）'),
    ], string='强制税率', help='覆盖 OCR 识别的税率（空=不干预）')

    # --- Date rules ---
    date_era = fields.Selection([
        ('auto', '自动判断'),
        ('reiwa', '令和（2019~）'),
        ('heisei', '平成（1989~2019）'),
    ], string='日期年号', default='auto',
        help='手写票据常见年号，避免 Gemini 误判')

    # --- Amount rules ---
    amount_field_is = fields.Selection([
        ('auto', '自动判断'),
        ('gross', 'OCR金额=税込（默认）'),
        ('net', 'OCR金额=税抜（需加税）'),
    ], string='金额含义', default='auto',
        help='该供应商票据上主金额是含税还是不含税')

    # --- Prompt hints ---
    ocr_hints = fields.Text(
        '识别提示',
        help='追加到 OCR prompt 的提示文字。例: "此店纳品书合計金額为税抜，税込在最下方"',
    )

    note = fields.Text('备注')

    @api.model
    def match_vendor(self, client_id, seller_name):
        """Find the first matching vendor rule for given client + seller name.

        Returns: recordset (single rule) or empty recordset.
        """
        if not seller_name or not client_id:
            return self.browse()

        rules = self.search([
            ('client_id', '=', client_id),
            ('active', '=', True),
        ])
        for rule in rules:
            try:
                if re.search(rule.vendor_pattern, seller_name, re.IGNORECASE):
                    return rule
            except re.error:
                # Fallback to simple contains if regex is invalid
                if rule.vendor_pattern in seller_name:
                    return rule
        return self.browse()
