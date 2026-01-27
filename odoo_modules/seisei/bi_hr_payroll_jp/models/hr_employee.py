# -*- coding: utf-8 -*-

from odoo import models, fields, api
from dateutil.relativedelta import relativedelta


class HrEmployee(models.Model):
    """Employee extension for Japanese payroll"""
    _inherit = 'hr.employee'

    # Personal Information
    my_number = fields.Char(
        string='My Number / マイナンバー',
        size=12,
        help='Individual Number (12 digits)',
        groups='hr.group_hr_user',
    )
    nationality = fields.Char(
        string='Nationality / 国籍',
    )

    # Insurance Settings
    insurance_prefecture_id = fields.Many2one(
        'hr.insurance.prefecture',
        string='Insurance Prefecture / 健康保険支部',
        help='Leave empty to use company default',
    )
    effective_insurance_prefecture_id = fields.Many2one(
        'hr.insurance.prefecture',
        string='Effective Insurance Prefecture',
        compute='_compute_effective_insurance_prefecture',
    )

    # Tax Settings
    resident_tax_amount = fields.Float(
        string='Resident Tax / 住民税',
        help='Monthly resident tax amount (updated every June)',
    )
    dependants_count = fields.Integer(
        string='Dependants / 扶養人数',
        default=0,
        help='Number of dependants for tax calculation',
    )
    tax_column = fields.Selection([
        ('a', 'Column A / 甲欄 (Primary job)'),
        ('b', 'Column B / 乙欄 (Secondary job)'),
    ], string='Tax Column / 税額欄', default='a')

    # Insurance Grade (can be manually set or auto-calculated)
    health_insurance_grade_id = fields.Many2one(
        'hr.insurance.grade',
        string='Health Insurance Grade / 健康保険等級',
        help='Leave empty for automatic calculation from wage',
    )
    pension_grade_id = fields.Many2one(
        'hr.insurance.grade',
        string='Pension Grade / 厚生年金等級',
        help='Leave empty for automatic calculation from wage',
    )

    # Dependant information
    dependant_ids = fields.One2many(
        'hr.employee.dependant',
        'employee_id',
        string='Dependants / 扶養親族',
    )

    # Computed fields
    age = fields.Integer(
        string='Age / 年齢',
        compute='_compute_age',
    )
    is_care_insurance_applicable = fields.Boolean(
        string='Care Insurance Applicable / 介護保険対象',
        compute='_compute_is_care_insurance_applicable',
        help='True if employee is between 40 and 65 years old',
    )

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


class HrEmployeeDependant(models.Model):
    """Employee Dependant Information / 扶養親族情報"""
    _name = 'hr.employee.dependant'
    _description = 'Employee Dependant / 扶養親族'

    employee_id = fields.Many2one(
        'hr.employee',
        string='Employee / 従業員',
        required=True,
        ondelete='cascade',
    )
    name = fields.Char(
        string='Name / 名前',
        required=True,
    )
    relationship = fields.Selection([
        ('spouse', 'Spouse / 配偶者'),
        ('child', 'Child / 子'),
        ('parent', 'Parent / 親'),
        ('grandparent', 'Grandparent / 祖父母'),
        ('sibling', 'Sibling / 兄弟姉妹'),
        ('other', 'Other / その他'),
    ], string='Relationship / 関係', required=True)
    birth_date = fields.Date(
        string='Birth Date / 生年月日',
    )
    gender = fields.Selection([
        ('male', 'Male / 男性'),
        ('female', 'Female / 女性'),
    ], string='Gender / 性別')
    address = fields.Char(
        string='Address / 住所',
    )
    annual_income = fields.Float(
        string='Annual Income / 年間所得',
        help='Used to determine dependant eligibility (must be under ¥1,030,000)',
    )
    is_eligible = fields.Boolean(
        string='Eligible / 扶養対象',
        compute='_compute_is_eligible',
        store=True,
    )
    my_number = fields.Char(
        string='My Number / マイナンバー',
        size=12,
        groups='hr.group_hr_user',
    )

    @api.depends('annual_income')
    def _compute_is_eligible(self):
        for dependant in self:
            # Dependant income must be under ¥1,030,000
            dependant.is_eligible = dependant.annual_income < 1030000
