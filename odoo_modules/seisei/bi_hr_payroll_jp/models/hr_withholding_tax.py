# -*- coding: utf-8 -*-

from odoo import models, fields, api


class HrWithholdingTax(models.Model):
    """源泉徴収税額表（月額表）"""
    _name = 'hr.withholding.tax'
    _description = 'Withholding Tax Table / 源泉徴収税額表'
    _order = 'wage_min'

    wage_min = fields.Integer(
        string='Wage Min / 給与下限',
        required=True,
    )
    wage_max = fields.Integer(
        string='Wage Max / 給与上限',
        required=True,
    )
    # Tax amounts for dependents 0-7 (Column A / 甲欄)
    tax_dep_0 = fields.Integer(string='Tax (0 dependents) / 扶養0人')
    tax_dep_1 = fields.Integer(string='Tax (1 dependent) / 扶養1人')
    tax_dep_2 = fields.Integer(string='Tax (2 dependents) / 扶養2人')
    tax_dep_3 = fields.Integer(string='Tax (3 dependents) / 扶養3人')
    tax_dep_4 = fields.Integer(string='Tax (4 dependents) / 扶養4人')
    tax_dep_5 = fields.Integer(string='Tax (5 dependents) / 扶養5人')
    tax_dep_6 = fields.Integer(string='Tax (6 dependents) / 扶養6人')
    tax_dep_7 = fields.Integer(string='Tax (7 dependents) / 扶養7人')
    # Column B / 乙欄 (for secondary jobs)
    tax_column_b = fields.Integer(string='Tax Column B / 乙欄')
    active = fields.Boolean(
        string='Active / 有効',
        default=True,
    )

    @api.model
    def get_tax_amount(self, taxable_income, dependants=0, column_b=False):
        """
        Get withholding tax amount for given income and dependants

        Args:
            taxable_income: Salary after social insurance deduction
            dependants: Number of dependants (0-7)
            column_b: Use Column B rate (for secondary jobs)

        Returns:
            Tax amount in yen
        """
        record = self.search([
            ('wage_min', '<=', taxable_income),
            ('wage_max', '>', taxable_income),
            ('active', '=', True),
        ], limit=1)

        if not record:
            # Income below minimum threshold
            if taxable_income < 88000:
                return 0
            # Income above maximum in table - use formula
            return self._calculate_high_income_tax(taxable_income, dependants, column_b)

        if column_b:
            return record.tax_column_b

        # Cap dependants at 7
        dependants = min(dependants, 7)

        tax_fields = [
            'tax_dep_0', 'tax_dep_1', 'tax_dep_2', 'tax_dep_3',
            'tax_dep_4', 'tax_dep_5', 'tax_dep_6', 'tax_dep_7'
        ]

        return getattr(record, tax_fields[dependants]) or 0

    @api.model
    def _calculate_high_income_tax(self, taxable_income, dependants=0, column_b=False):
        """Calculate tax for income above table range"""
        # Simplified calculation for high income
        # In practice, should extend the table or use tax authority formula
        if column_b:
            return int(taxable_income * 0.3063)  # Approximate B column rate

        # Approximate A column calculation
        base_rate = 0.05 + (taxable_income - 500000) / 10000000 * 0.05
        base_rate = min(base_rate, 0.10)  # Cap at 10%
        tax = taxable_income * base_rate
        # Reduction per dependent
        tax -= dependants * 1580
        return max(0, int(tax))

    def name_get(self):
        result = []
        for record in self:
            name = f"¥{record.wage_min:,} - ¥{record.wage_max:,}"
            result.append((record.id, name))
        return result
