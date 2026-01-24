# -*- coding: utf-8 -*-
from odoo import api, fields, models


class HrInsuranceGrade(models.Model):
    """Japanese Social Insurance Grades (等級)"""
    _name = 'hr.insurance.grade'
    _description = 'Insurance Grade'
    _order = 'grade'

    grade = fields.Integer(string='Grade', required=True)
    grade_display = fields.Char(string='Grade Display', compute='_compute_grade_display', store=True)
    standard_monthly = fields.Integer(string='Standard Monthly (標準報酬月額)', required=True)
    wage_min = fields.Integer(string='Wage Min (報酬月額下限)')
    wage_max = fields.Integer(string='Wage Max (報酬月額上限)')
    pension_grade = fields.Integer(string='Pension Grade (厚生年金等級)')
    has_pension = fields.Boolean(string='Has Pension', default=True)
    active = fields.Boolean(string='Active', default=True)

    _sql_constraints = [
        ('grade_unique', 'unique(grade)', 'Grade must be unique!'),
    ]

    @api.depends('grade')
    def _compute_grade_display(self):
        for record in self:
            record.grade_display = str(record.grade) if record.grade else ''

    def name_get(self):
        result = []
        for record in self:
            name = f"Grade {record.grade}: ¥{record.standard_monthly:,}"
            result.append((record.id, name))
        return result

    @api.model
    def get_grade_by_wage(self, wage):
        """Get the insurance grade for a given wage amount"""
        grade = self.search([
            ('wage_min', '<=', wage),
            ('wage_max', '>=', wage),
            ('active', '=', True)
        ], limit=1)
        if not grade:
            # Return highest grade if wage exceeds all grades
            grade = self.search([('active', '=', True)], order='grade desc', limit=1)
        return grade
