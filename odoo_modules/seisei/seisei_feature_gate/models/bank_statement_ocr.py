# -*- coding: utf-8 -*-

from odoo import models


class BankStatementOcrGate(models.Model):
    _inherit = 'seisei.bank.statement.ocr'

    def action_process_ocr(self):
        self.env['seisei.feature.gate'].check_access('module_ocr')
        return super().action_process_ocr()
