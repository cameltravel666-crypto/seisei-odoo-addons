# -*- coding: utf-8 -*-

from odoo import models, fields, api


class HrPayslip(models.Model):
    """Payslip extension for Japanese payroll"""
    _inherit = 'hr.payslip'

    # Insurance Settings (editable)
    insurance_prefecture_id = fields.Many2one(
        'hr.insurance.prefecture',
        string='Insurance Prefecture / 保険支部',
        help='Insurance prefecture for this payslip',
    )
    insurance_rate_id = fields.Many2one(
        'hr.insurance.rate',
        string='Insurance Rate / 保険料率',
        compute='_compute_insurance_rate',
        store=True,
    )

    # Standard Monthly Remuneration
    insurance_grade_id = fields.Many2one(
        'hr.insurance.grade',
        string='Insurance Grade / 保険等級',
    )
    standard_monthly_amount = fields.Integer(
        string='Standard Monthly / 標準報酬月額',
        help='Standard monthly remuneration for insurance calculation',
    )

    # Editable Insurance Amounts
    health_insurance_amount = fields.Integer(
        string='Health Insurance / 健康保険料',
        help='Employee portion of health insurance',
    )
    care_insurance_amount = fields.Integer(
        string='Care Insurance / 介護保険料',
        help='Employee portion of care insurance (40-65 years old)',
    )
    pension_amount = fields.Integer(
        string='Pension / 厚生年金',
        help='Employee portion of pension',
    )
    employment_insurance_amount = fields.Integer(
        string='Employment Insurance / 雇用保険料',
        help='Employee portion of employment insurance',
    )

    # Manual Edit Mode
    insurance_manual_edit = fields.Boolean(
        string='Manual Edit / 手動編集',
        default=False,
        help='If checked, insurance amounts will not be auto-recalculated',
    )

    # Computed totals
    total_social_insurance = fields.Integer(
        string='Total Social Insurance / 社会保険合計',
        compute='_compute_total_social_insurance',
        store=True,
    )

    # Tax related
    is_care_insurance_applicable = fields.Boolean(
        string='Care Insurance Applicable',
        compute='_compute_is_care_insurance_applicable',
    )

    @api.depends('employee_id')
    def _compute_is_care_insurance_applicable(self):
        for payslip in self:
            if payslip.employee_id:
                payslip.is_care_insurance_applicable = payslip.employee_id.is_care_insurance_applicable
            else:
                payslip.is_care_insurance_applicable = False

    @api.depends('insurance_prefecture_id', 'date_from')
    def _compute_insurance_rate(self):
        for payslip in self:
            if payslip.insurance_prefecture_id and payslip.date_from:
                payslip.insurance_rate_id = payslip.insurance_prefecture_id.get_current_rate(payslip.date_from)
            else:
                payslip.insurance_rate_id = False

    @api.depends('health_insurance_amount', 'care_insurance_amount', 'pension_amount', 'employment_insurance_amount')
    def _compute_total_social_insurance(self):
        for payslip in self:
            payslip.total_social_insurance = (
                (payslip.health_insurance_amount or 0) +
                (payslip.care_insurance_amount or 0) +
                (payslip.pension_amount or 0) +
                (payslip.employment_insurance_amount or 0)
            )

    @api.onchange('employee_id')
    def _onchange_employee_insurance(self):
        """Set insurance prefecture from employee when employee changes"""
        if self.employee_id:
            self.insurance_prefecture_id = self.employee_id.effective_insurance_prefecture_id
            if not self.insurance_manual_edit:
                self._calculate_insurance_amounts()

    @api.onchange('insurance_prefecture_id')
    def _onchange_insurance_prefecture(self):
        """Recalculate insurance when prefecture changes"""
        if not self.insurance_manual_edit:
            self._calculate_insurance_amounts()

    @api.onchange('standard_monthly_amount')
    def _onchange_standard_monthly(self):
        """Recalculate insurance when standard monthly changes"""
        if not self.insurance_manual_edit:
            self._calculate_insurance_amounts()

    def _calculate_insurance_amounts(self):
        """Calculate insurance amounts based on settings"""
        self.ensure_one()

        if not self.insurance_prefecture_id or not self.date_from:
            return

        # Get rate
        rate = self.insurance_rate_id
        if not rate:
            return

        # Get or calculate standard monthly
        if not self.standard_monthly_amount:
            wage = self._get_contract_wage()
            grade = self.env['hr.insurance.grade'].get_grade_for_wage(wage)
            if grade:
                self.insurance_grade_id = grade
                self.standard_monthly_amount = grade.standard_monthly

        standard = self.standard_monthly_amount or 0

        # Calculate health insurance (employee portion = half)
        self.health_insurance_amount = round(standard * rate.health_rate / 2)

        # Calculate care insurance (only for 40-65)
        if self.is_care_insurance_applicable:
            self.care_insurance_amount = round(standard * rate.care_rate_diff / 2)
        else:
            self.care_insurance_amount = 0

        # Calculate pension (only if grade has pension)
        if self.insurance_grade_id and self.insurance_grade_id.has_pension:
            self.pension_amount = round(standard * rate.pension_rate / 2)
        else:
            self.pension_amount = 0

        # Calculate employment insurance (based on gross, not standard monthly)
        gross = self._get_gross_income()
        self.employment_insurance_amount = round(gross * rate.employment_rate)

    def _get_contract_wage(self):
        """Get wage from contract"""
        self.ensure_one()
        if self.contract_id:
            return self.contract_id.wage
        return 0

    def _get_gross_income(self):
        """Get gross income for employment insurance calculation"""
        self.ensure_one()
        # Try to get from computed lines
        gross_line = self.line_ids.filtered(lambda l: l.code == 'GROSS')
        if gross_line:
            return gross_line[0].total

        # Fallback to contract wage
        return self._get_contract_wage()

    def action_recalculate_insurance(self):
        """Recalculate insurance amounts"""
        for payslip in self:
            payslip.insurance_manual_edit = False
            payslip._calculate_insurance_amounts()
        return True

    def action_reset_to_auto(self):
        """Reset to automatic calculation mode"""
        for payslip in self:
            payslip.insurance_manual_edit = False
            payslip._calculate_insurance_amounts()
        return True

    # Override compute_sheet to include insurance calculation
    def compute_sheet(self):
        """Override to calculate insurance amounts before computing"""
        for payslip in self:
            if not payslip.insurance_manual_edit:
                payslip._calculate_insurance_amounts()
        return super().compute_sheet()

    # Helper methods for salary rules
    def _get_standard_monthly_remuneration(self, wage=None):
        """Get standard monthly remuneration for salary rules"""
        self.ensure_one()
        if self.standard_monthly_amount:
            return self.standard_monthly_amount
        if wage:
            grade = self.env['hr.insurance.grade'].get_grade_for_wage(wage)
            return grade.standard_monthly if grade else wage
        return self._get_contract_wage()

    def _lookup_withholding_tax(self, taxable_base, dependants=0):
        """Lookup withholding tax from table"""
        self.ensure_one()
        column_b = self.employee_id.tax_column == 'b' if self.employee_id else False
        return self.env['hr.withholding.tax'].get_tax_amount(taxable_base, dependants, column_b)

    def _get_health_insurance_amount(self):
        """Get health insurance amount for salary rules"""
        self.ensure_one()
        return self.health_insurance_amount or 0

    def _get_care_insurance_amount(self):
        """Get care insurance amount for salary rules"""
        self.ensure_one()
        return self.care_insurance_amount or 0

    def _get_pension_amount(self):
        """Get pension amount for salary rules"""
        self.ensure_one()
        return self.pension_amount or 0

    def _get_employment_insurance_amount(self):
        """Get employment insurance amount for salary rules"""
        self.ensure_one()
        return self.employment_insurance_amount or 0
