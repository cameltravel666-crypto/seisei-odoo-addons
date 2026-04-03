import re

from odoo import models, fields, api


class OcrVendorRule(models.Model):
    _name = 'ocr.vendor.rule'
    _description = 'Vendor OCR Rule'
    _order = 'priority, id'
    _rec_name = 'vendor_pattern'

    client_id = fields.Many2one('ocr.client', 'Client', required=True, ondelete='cascade')
    vendor_pattern = fields.Char(
        'Vendor Pattern', required=True,
        help='Match if seller name contains this text (regex supported). e.g. 川奈畜産、ガソリン|GS',
    )
    active = fields.Boolean('Active', default=True)
    priority = fields.Integer('Priority', default=10, help='Lower number = higher priority')

    # --- Tax rules ---
    force_tax_rate = fields.Selection([
        ('8', '8% (Reduced/Food)'),
        ('10', '10% (Standard)'),
    ], string='Force Tax Rate', help='Override OCR-detected tax rate (empty = no override)')

    # --- Date rules ---
    date_era = fields.Selection([
        ('auto', 'Auto-detect'),
        ('reiwa', 'Reiwa (2019~)'),
        ('heisei', 'Heisei (1989~2019)'),
    ], string='Date Era', default='auto',
        help='Specify era for handwritten receipts to avoid misdetection')

    # --- Amount rules ---
    amount_field_is = fields.Selection([
        ('auto', 'Auto-detect'),
        ('gross', 'Gross (tax-included)'),
        ('net', 'Net (tax-excluded)'),
    ], string='Amount Type', default='auto',
        help='Whether the main amount on this vendor\'s receipt is tax-inclusive or exclusive')

    # --- Prompt hints ---
    ocr_hints = fields.Text(
        'OCR Hints',
        help='Additional hints appended to the OCR prompt for this vendor.',
    )

    note = fields.Text('Notes')

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
