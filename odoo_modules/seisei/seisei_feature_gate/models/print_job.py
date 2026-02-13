# -*- coding: utf-8 -*-

from odoo import models


class PrintJobGate(models.Model):
    _inherit = 'seisei.print.job'

    def run_job(self):
        self.env['seisei.feature.gate'].check_access('module_print')
        return super().run_job()
