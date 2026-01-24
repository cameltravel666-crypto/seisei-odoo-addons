# -*- coding: utf-8 -*-
from odoo import api, fields, models
from datetime import date


class HrEmployeeJapan(models.Model):
    """Japan-specific fields for HR Employee"""
    _inherit = 'hr.employee'

    # Personal Information - Japan
    my_number = fields.Char(
        string='My Number',
        size=12,
        groups='hr.group_hr_user',
        help='Japanese Individual Number (マイナンバー)'
    )
    nationality = fields.Char(string='Nationality')

    # Salary Information
    base_wage = fields.Float(
        string='Base Wage',
        groups='hr.group_hr_user',
        help='Base monthly wage for insurance calculations'
    )

    # Social Insurance Settings
    insurance_prefecture_id = fields.Many2one(
        'hr.insurance.prefecture',
        string='Insurance Prefecture',
        groups='hr.group_hr_user',
        help='Prefecture for calculating social insurance rates'
    )
    health_insurance_grade_id = fields.Many2one(
        'hr.insurance.grade',
        string='Health Insurance Grade',
        groups='hr.group_hr_user',
        help='Current health insurance grade (健康保険等級)'
    )
    pension_grade_id = fields.Many2one(
        'hr.insurance.grade',
        string='Pension Grade',
        groups='hr.group_hr_user',
        help='Current pension grade (厚生年金等級)'
    )

    # Tax Information
    tax_column = fields.Selection([
        ('a', 'Column A (甲欄)'),
        ('b', 'Column B (乙欄)'),
    ], string='Tax Column', default='a', groups='hr.group_hr_user',
        help='Column A: Main employer with tax exemption declaration\n'
             'Column B: Secondary employer or no tax exemption declaration'
    )
    dependants_count = fields.Integer(
        string='Dependants Count',
        groups='hr.group_hr_user',
        help='Number of tax dependants for withholding tax calculation'
    )
    resident_tax_amount = fields.Float(
        string='Resident Tax Amount',
        groups='hr.group_hr_user',
        help='Monthly resident tax (住民税) amount'
    )

    # Computed Fields
    age = fields.Integer(
        string='Age',
        compute='_compute_age',
        store=False
    )
    is_care_insurance_applicable = fields.Boolean(
        string='Care Insurance Applicable',
        compute='_compute_is_care_insurance_applicable',
        store=False,
        help='Care insurance applies to employees aged 40-64'
    )

    @api.depends('birthday')
    def _compute_age(self):
        today = date.today()
        for employee in self:
            if employee.birthday:
                born = employee.birthday
                age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
                employee.age = age
            else:
                employee.age = 0

    @api.depends('birthday')
    def _compute_is_care_insurance_applicable(self):
        """Care insurance (介護保険) applies to ages 40-64"""
        for employee in self:
            employee.is_care_insurance_applicable = 40 <= (employee.age or 0) < 65

    def action_update_insurance_grades(self):
        """Update insurance grades based on base wage"""
        InsuranceGrade = self.env['hr.insurance.grade']
        for employee in self:
            if employee.base_wage:
                grade = InsuranceGrade.get_grade_by_wage(employee.base_wage)
                if grade:
                    employee.health_insurance_grade_id = grade.id
                    if grade.has_pension:
                        pension_grade = InsuranceGrade.search([
                            ('pension_grade', '=', grade.pension_grade),
                            ('active', '=', True)
                        ], limit=1)
                        employee.pension_grade_id = pension_grade.id if pension_grade else grade.id
        return True
