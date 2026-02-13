# -*- coding: utf-8 -*-

from odoo import models


class HrPayslipGate(models.Model):
    _inherit = 'hr.payslip'

    def compute_sheet(self):
        self.env['seisei.feature.gate'].check_access('module_payroll')
        return super().compute_sheet()
