# -*- coding: utf-8 -*-
from odoo import api, fields, models


class HrWithholdingTax(models.Model):
    """Japanese Income Tax Withholding Table (源泉徴収税額表)"""
    _name = 'hr.withholding.tax'
    _description = 'Withholding Tax Table'
    _order = 'wage_min'

    wage_min = fields.Integer(string='Wage Min', required=True)
    wage_max = fields.Integer(string='Wage Max', required=True)

    # Column A (甲欄) - Tax amounts by number of dependents
    tax_dep_0 = fields.Integer(string='0 Dependents')
    tax_dep_1 = fields.Integer(string='1 Dependent')
    tax_dep_2 = fields.Integer(string='2 Dependents')
    tax_dep_3 = fields.Integer(string='3 Dependents')
    tax_dep_4 = fields.Integer(string='4 Dependents')
    tax_dep_5 = fields.Integer(string='5 Dependents')
    tax_dep_6 = fields.Integer(string='6 Dependents')
    tax_dep_7 = fields.Integer(string='7+ Dependents')

    # Column B (乙欄) - For employees without tax exemption declaration
    tax_column_b = fields.Integer(string='Column B Tax')

    active = fields.Boolean(string='Active', default=True)

    def name_get(self):
        result = []
        for record in self:
            name = f"¥{record.wage_min:,} - ¥{record.wage_max:,}"
            result.append((record.id, name))
        return result

    @api.model
    def get_withholding_tax(self, wage, dependants=0, column_b=False):
        """
        Calculate withholding tax amount for given wage and dependants.

        Args:
            wage: Monthly taxable wage
            dependants: Number of dependants (0-7+)
            column_b: If True, use column B (乙欄) tax rate

        Returns:
            int: Tax amount to withhold
        """
        # Find matching wage bracket
        tax_record = self.search([
            ('wage_min', '<=', wage),
            ('wage_max', '>=', wage),
            ('active', '=', True)
        ], limit=1)

        if not tax_record:
            return 0

        if column_b:
            return tax_record.tax_column_b or 0

        # Get tax based on number of dependants
        dependant_field = f'tax_dep_{min(dependants, 7)}'
        return getattr(tax_record, dependant_field, 0) or 0
