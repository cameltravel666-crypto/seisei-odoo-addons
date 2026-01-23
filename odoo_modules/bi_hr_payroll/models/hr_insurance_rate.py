# -*- coding: utf-8 -*-

from odoo import models, fields, api
from datetime import timedelta


class HrInsuranceRate(models.Model):
    """Insurance Rate Table"""
    _name = 'hr.insurance.rate'
    _description = 'Insurance Rate'
    _order = 'prefecture_id, effective_date desc'

    name = fields.Char(
        string='Name',
        compute='_compute_name',
        store=True,
    )
    prefecture_id = fields.Many2one(
        'hr.insurance.prefecture',
        string='Prefecture',
        required=True,
        ondelete='cascade',
    )
    fiscal_year = fields.Char(
        string='Fiscal Year',
        required=True,
        help='e.g., R7, 2025',
    )
    effective_date = fields.Date(
        string='Effective Date',
        required=True,
    )
    expiry_date = fields.Date(
        string='Expiry Date',
        help='Leave empty for currently active rate',
    )
    health_rate = fields.Float(
        string='Health Insurance Rate',
        digits=(6, 5),
        required=True,
        help='Full rate (e.g., 0.0991 for 9.91%)',
    )
    health_rate_with_care = fields.Float(
        string='Health + Care Rate',
        digits=(6, 5),
        required=True,
        help='Full rate including care insurance (e.g., 0.1150 for 11.50%)',
    )
    care_rate_diff = fields.Float(
        string='Care Insurance Diff',
        digits=(6, 5),
        compute='_compute_care_rate_diff',
        store=True,
    )
    pension_rate = fields.Float(
        string='Pension Rate',
        digits=(6, 5),
        default=0.183,
        help='Fixed at 18.3% since Sep 2017',
    )
    employment_rate = fields.Float(
        string='Employment Insurance Rate',
        digits=(6, 5),
        default=0.006,
        help='Employee portion (0.6%)',
    )
    active = fields.Boolean(
        string='Active',
        default=True,
    )
    note = fields.Text(
        string='Note',
    )

    # Display fields (percentage format)
    health_rate_display = fields.Float(
        string='Health Rate %',
        compute='_compute_rate_display',
    )
    health_rate_with_care_display = fields.Float(
        string='Health+Care Rate %',
        compute='_compute_rate_display',
    )

    @api.depends('prefecture_id', 'fiscal_year')
    def _compute_name(self):
        for record in self:
            if record.prefecture_id and record.fiscal_year:
                record.name = f"{record.prefecture_id.name} {record.fiscal_year}"
            else:
                record.name = "New Rate"

    @api.depends('health_rate_with_care', 'health_rate')
    def _compute_care_rate_diff(self):
        for record in self:
            record.care_rate_diff = record.health_rate_with_care - record.health_rate

    @api.depends('health_rate', 'health_rate_with_care')
    def _compute_rate_display(self):
        for record in self:
            record.health_rate_display = record.health_rate * 100
            record.health_rate_with_care_display = record.health_rate_with_care * 100

    def get_employee_health_rate(self, with_care=False):
        """Get employee portion (half) of health insurance rate"""
        self.ensure_one()
        if with_care:
            return self.health_rate_with_care / 2
        return self.health_rate / 2

    def get_employee_pension_rate(self):
        """Get employee portion (half) of pension rate"""
        self.ensure_one()
        return self.pension_rate / 2

    def get_employee_care_rate(self):
        """Get employee portion (half) of care insurance diff"""
        self.ensure_one()
        return self.care_rate_diff / 2

    @api.model
    def check_rate_update_reminder(self):
        """Cron job: Check if rate update is needed"""
        today = fields.Date.today()

        # Remind in February
        if today.month == 2 and today.day == 1:
            next_year_start = today.replace(month=3, day=1)
            existing = self.search([
                ('effective_date', '=', next_year_start)
            ], limit=1)

            if not existing:
                # Send reminder to HR managers
                self._send_rate_update_reminder()

    def _send_rate_update_reminder(self):
        """Send rate update reminder notification"""
        # Get HR managers
        hr_group = self.env.ref('hr.group_hr_manager', raise_if_not_found=False)
        if hr_group:
            for user in hr_group.users:
                self.env['mail.activity'].create({
                    'activity_type_id': self.env.ref('mail.mail_activity_data_todo').id,
                    'summary': 'Insurance Rate Update Reminder',
                    'note': 'Please import the new fiscal year insurance rates.',
                    'user_id': user.id,
                    'res_model_id': self.env['ir.model']._get('hr.insurance.rate').id,
                    'res_id': self.search([], limit=1).id or 1,
                })
