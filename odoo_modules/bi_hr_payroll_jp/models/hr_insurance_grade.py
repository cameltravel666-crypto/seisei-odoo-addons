# -*- coding: utf-8 -*-

from odoo import models, fields, api


class HrInsuranceGrade(models.Model):
    """標準報酬月額等級表"""
    _name = 'hr.insurance.grade'
    _description = 'Standard Monthly Remuneration Grade / 標準報酬月額等級'
    _order = 'grade'
    _rec_name = 'display_name'

    name = fields.Char(
        string='Name',
        compute='_compute_name',
        store=True,
    )
    grade = fields.Integer(
        string='Grade / 等級',
        required=True,
    )
    grade_display = fields.Char(
        string='Grade Display / 等級表示',
        help='e.g., 4(1) for grade 4 with pension grade 1',
    )
    standard_monthly = fields.Integer(
        string='Standard Monthly / 標準報酬月額',
        required=True,
    )
    wage_min = fields.Integer(
        string='Wage Min / 報酬下限',
        required=True,
    )
    wage_max = fields.Integer(
        string='Wage Max / 報酬上限',
        required=True,
        help='Use 99999999 for no upper limit',
    )
    has_pension = fields.Boolean(
        string='Has Pension / 年金対象',
        default=True,
        help='Grades 1-3 do not have pension coverage',
    )
    pension_grade = fields.Integer(
        string='Pension Grade / 厚生年金等級',
        help='Pension grade number (1-32)',
    )
    active = fields.Boolean(
        string='Active / 有効',
        default=True,
    )

    _sql_constraints = [
        ('grade_uniq', 'unique(grade)', 'Grade must be unique!'),
    ]

    @api.depends('grade', 'standard_monthly', 'grade_display')
    def _compute_name(self):
        for record in self:
            if record.grade_display:
                record.name = f"{record.grade_display}: ¥{record.standard_monthly:,}"
            else:
                record.name = f"等級{record.grade}: ¥{record.standard_monthly:,}"

    @api.depends('grade', 'standard_monthly', 'grade_display')
    def _compute_display_name(self):
        for record in self:
            if record.grade_display:
                record.display_name = f"{record.grade_display}: ¥{record.standard_monthly:,}"
            else:
                record.display_name = f"等級{record.grade}: ¥{record.standard_monthly:,}"

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
