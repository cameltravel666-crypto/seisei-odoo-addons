# -*- coding: utf-8 -*-
# Part of BrowseInfo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from dateutil.relativedelta import relativedelta


class HrEmployee(models.Model):
    _inherit = 'hr.employee'
    _description = 'Employee'

    # Original bi_hr_payroll fields
    slip_ids = fields.One2many('hr.payslip', 'employee_id', string='Payslips', readonly=True)
    payslip_count = fields.Integer(compute='_compute_payslip_count', string='Payslip Count', groups="bi_hr_payroll.group_hr_payroll_user")
    address_home_id = fields.Many2one('res.partner', 'Address',groups="hr.group_hr_user",
        domain="['|', ('company_id', '=', False), ('company_id', '=', company_id)]")

    # Japan Payroll - Personal Information
    my_number = fields.Char(
        string='My Number',
        size=12,
        help='Individual Number (12 digits)',
        groups='hr.group_hr_user',
    )
    nationality = fields.Char(
        string='Nationality',
    )

    # Japan Payroll - Insurance Settings
    base_wage = fields.Float(
        string='Base Wage',
        help='Monthly base wage for insurance grade calculation',
    )
    insurance_prefecture_id = fields.Many2one(
        'hr.insurance.prefecture',
        string='Insurance Prefecture',
        help='Leave empty to use company default',
    )
    effective_insurance_prefecture_id = fields.Many2one(
        'hr.insurance.prefecture',
        string='Effective Insurance Prefecture',
        compute='_compute_effective_insurance_prefecture',
    )

    # Japan Payroll - Tax Settings
    resident_tax_amount = fields.Float(
        string='Resident Tax',
        help='Monthly resident tax amount (updated every June)',
    )
    dependants_count = fields.Integer(
        string='Dependants Count',
        default=0,
        help='Number of dependants for tax calculation',
    )
    tax_column = fields.Selection([
        ('a', 'Column A (Primary job)'),
        ('b', 'Column B (Secondary job)'),
    ], string='Tax Column', default='a')

    # Japan Payroll - Insurance Grade (can be manually set or auto-calculated)
    health_insurance_grade_id = fields.Many2one(
        'hr.insurance.grade',
        string='Health Insurance Grade',
        help='Leave empty for automatic calculation from wage',
    )
    pension_grade_id = fields.Many2one(
        'hr.insurance.grade',
        string='Pension Grade',
        help='Leave empty for automatic calculation from wage',
    )

    # Japan Payroll - Dependant information
    dependant_ids = fields.One2many(
        'hr.employee.dependant',
        'employee_id',
        string='Dependants',
    )

    # Japan Payroll - Computed fields
    age = fields.Integer(
        string='Age',
        compute='_compute_age',
    )
    is_care_insurance_applicable = fields.Boolean(
        string='Care Insurance Applicable',
        compute='_compute_is_care_insurance_applicable',
        help='True if employee is between 40 and 65 years old',
    )

    def _compute_payslip_count(self):
        for employee in self:
            employee.payslip_count = len(employee.slip_ids)

    @api.depends('birthday')
    def _compute_age(self):
        today = fields.Date.today()
        for employee in self:
            if employee.birthday:
                employee.age = relativedelta(today, employee.birthday).years
            else:
                employee.age = 0

    @api.depends('age')
    def _compute_is_care_insurance_applicable(self):
        for employee in self:
            employee.is_care_insurance_applicable = 40 <= employee.age < 65

    @api.depends('insurance_prefecture_id', 'company_id.default_insurance_prefecture_id')
    def _compute_effective_insurance_prefecture(self):
        for employee in self:
            if employee.insurance_prefecture_id:
                employee.effective_insurance_prefecture_id = employee.insurance_prefecture_id
            elif employee.company_id and employee.company_id.default_insurance_prefecture_id:
                employee.effective_insurance_prefecture_id = employee.company_id.default_insurance_prefecture_id
            else:
                employee.effective_insurance_prefecture_id = False

    def get_insurance_rate(self, target_date=None):
        """Get applicable insurance rate for this employee"""
        self.ensure_one()
        prefecture = self.effective_insurance_prefecture_id
        if not prefecture:
            return False
        return prefecture.get_current_rate(target_date)

    def get_insurance_grade(self, wage=None):
        """Get insurance grade for this employee"""
        self.ensure_one()
        if self.health_insurance_grade_id:
            return self.health_insurance_grade_id

        if wage is None:
            # Try to get wage from contract
            contract = self.env['hr.contract'].search([
                ('employee_id', '=', self.id),
                ('state', '=', 'open'),
            ], limit=1)
            wage = contract.wage if contract else 0

        return self.env['hr.insurance.grade'].get_grade_for_wage(wage)

    @api.onchange('base_wage')
    def _onchange_base_wage(self):
        """Auto-calculate insurance grades when base wage changes"""
        if self.base_wage:
            # Get health insurance grade
            health_grade = self.env['hr.insurance.grade'].get_grade_for_wage(self.base_wage)
            if health_grade:
                self.health_insurance_grade_id = health_grade.id

            # Get pension grade (find grade with matching pension_grade)
            if health_grade and health_grade.has_pension:
                # Pension uses the same grade table but starts from grade 1
                pension_grade = self.env['hr.insurance.grade'].search([
                    ('pension_grade', '=', health_grade.pension_grade),
                    ('has_pension', '=', True),
                    ('active', '=', True),
                ], limit=1)
                if pension_grade:
                    self.pension_grade_id = pension_grade.id
                else:
                    self.pension_grade_id = health_grade.id
            elif health_grade:
                # Grades 1-3 don't have pension, find the lowest pension grade
                lowest_pension = self.env['hr.insurance.grade'].search([
                    ('has_pension', '=', True),
                    ('active', '=', True),
                ], order='grade asc', limit=1)
                self.pension_grade_id = lowest_pension.id if lowest_pension else False
        else:
            self.health_insurance_grade_id = False
            self.pension_grade_id = False


class HrEmployeeDependant(models.Model):
    """Employee Dependant Information"""
    _name = 'hr.employee.dependant'
    _description = 'Employee Dependant'

    employee_id = fields.Many2one(
        'hr.employee',
        string='Employee',
        required=True,
        ondelete='cascade',
    )
    name = fields.Char(
        string='Name',
        required=True,
    )
    relationship = fields.Selection([
        ('spouse', 'Spouse'),
        ('child', 'Child'),
        ('parent', 'Parent'),
        ('grandparent', 'Grandparent'),
        ('sibling', 'Sibling'),
        ('other', 'Other'),
    ], string='Relationship', required=True)
    birth_date = fields.Date(
        string='Birth Date',
    )
    gender = fields.Selection([
        ('male', 'Male'),
        ('female', 'Female'),
    ], string='Gender')
    address = fields.Char(
        string='Address',
    )
    annual_income = fields.Float(
        string='Annual Income',
        help='Used to determine dependant eligibility (must be under ¥1,030,000)',
    )
    is_eligible = fields.Boolean(
        string='Eligible',
        compute='_compute_is_eligible',
        store=True,
    )
    my_number = fields.Char(
        string='My Number',
        size=12,
        groups='hr.group_hr_user',
    )

    @api.depends('annual_income')
    def _compute_is_eligible(self):
        for dependant in self:
            # Dependant income must be under ¥1,030,000
            dependant.is_eligible = dependant.annual_income < 1030000
