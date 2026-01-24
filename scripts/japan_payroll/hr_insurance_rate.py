# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.exceptions import UserError


class HrInsuranceRate(models.Model):
    """Japanese Social Insurance Rates by Prefecture"""
    _name = 'hr.insurance.rate'
    _description = 'Insurance Rate'
    _order = 'prefecture_id, effective_date desc'

    name = fields.Char(string='Name', required=True)
    prefecture_id = fields.Many2one(
        'hr.insurance.prefecture',
        string='Prefecture',
        required=True,
        ondelete='cascade'
    )
    fiscal_year = fields.Char(string='Fiscal Year', required=True)
    effective_date = fields.Date(string='Effective Date', required=True)
    expiry_date = fields.Date(string='Expiry Date')

    # Health Insurance Rates (%)
    health_rate = fields.Float(
        string='Health Insurance Rate (%)',
        digits=(5, 3),
        help='Total health insurance rate (employee + employer)'
    )
    health_rate_with_care = fields.Float(
        string='Health Rate with Care (%)',
        digits=(5, 3),
        help='Health insurance rate including care insurance'
    )
    care_rate_diff = fields.Float(
        string='Care Rate Difference (%)',
        digits=(5, 3),
        compute='_compute_care_rate_diff',
        store=True,
        help='Care insurance rate = health_rate_with_care - health_rate'
    )

    # Pension Rate (%)
    pension_rate = fields.Float(
        string='Pension Rate (%)',
        digits=(5, 3),
        help='Total pension rate (employee + employer)'
    )

    # Employment Insurance Rate (%)
    employment_rate = fields.Float(
        string='Employment Insurance Rate (%)',
        digits=(5, 3),
        help='Employee portion of employment insurance rate'
    )

    note = fields.Text(string='Notes')
    active = fields.Boolean(string='Active', default=True)

    @api.depends('health_rate', 'health_rate_with_care')
    def _compute_care_rate_diff(self):
        for record in self:
            record.care_rate_diff = (record.health_rate_with_care or 0) - (record.health_rate or 0)

    def name_get(self):
        result = []
        for record in self:
            name = f"{record.prefecture_id.name} - {record.fiscal_year}"
            result.append((record.id, name))
        return result

    @api.model
    def get_current_rate(self, prefecture_id, as_of_date=None):
        """Get the current insurance rate for a prefecture"""
        if not as_of_date:
            as_of_date = fields.Date.today()

        rate = self.search([
            ('prefecture_id', '=', prefecture_id),
            ('effective_date', '<=', as_of_date),
            '|',
            ('expiry_date', '=', False),
            ('expiry_date', '>=', as_of_date),
            ('active', '=', True)
        ], order='effective_date desc', limit=1)
        return rate
