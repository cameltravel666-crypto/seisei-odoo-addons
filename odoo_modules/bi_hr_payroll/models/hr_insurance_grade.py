# -*- coding: utf-8 -*-

from odoo import models, fields, api


class HrInsuranceGrade(models.Model):
    """Standard Monthly Remuneration Grade Table"""
    _name = 'hr.insurance.grade'
    _description = 'Standard Monthly Remuneration Grade'
    _order = 'grade'

    grade = fields.Integer(
        string='Grade',
        required=True,
    )
    grade_display = fields.Char(
        string='Grade Display',
        help='e.g., 4(1) for grade 4 with pension grade 1',
    )
    standard_monthly = fields.Integer(
        string='Standard Monthly',
        required=True,
    )
    wage_min = fields.Integer(
        string='Wage Min',
        required=True,
    )
    wage_max = fields.Integer(
        string='Wage Max',
        required=True,
        help='Use 99999999 for no upper limit',
    )
    has_pension = fields.Boolean(
        string='Has Pension',
        default=True,
        help='Grades 1-3 do not have pension coverage',
    )
    pension_grade = fields.Integer(
        string='Pension Grade',
        help='Pension grade number (1-32)',
    )
    active = fields.Boolean(
        string='Active',
        default=True,
    )

    _sql_constraints = [
        ('grade_uniq', 'unique(grade)', 'Grade must be unique!'),
    ]

    @api.model
    def get_grade_for_wage(self, wage):
        """Get the insurance grade for a given wage amount"""
        grade = self.search([
            ('wage_min', '<=', wage),
            ('wage_max', '>', wage),
            ('active', '=', True),
        ], limit=1)

        if not grade:
            # If wage is above all grades, return highest grade
            grade = self.search([
                ('active', '=', True),
            ], order='grade desc', limit=1)

        return grade

    @api.model
    def get_standard_monthly_for_wage(self, wage):
        """Get the standard monthly remuneration for a given wage"""
        grade = self.get_grade_for_wage(wage)
        return grade.standard_monthly if grade else wage

    def _compute_display_name(self):
        for record in self:
            if record.grade_display:
                record.display_name = f"{record.grade_display}: ¥{record.standard_monthly:,}"
            else:
                record.display_name = f"第{record.grade}等級: ¥{record.standard_monthly:,}"
