# -*- coding: utf-8 -*-

from odoo import models


class AccountReportGate(models.Model):
    _inherit = 'account.report'

    def export_to_pdf(self, options):
        self.env['seisei.feature.gate'].check_access('module_finance')
        return super().export_to_pdf(options)

    def export_to_xlsx(self, options):
        self.env['seisei.feature.gate'].check_access('module_finance')
        return super().export_to_xlsx(options)
