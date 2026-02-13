# -*- coding: utf-8 -*-

from odoo import models


class AccountMoveGate(models.Model):
    _inherit = 'account.move'

    def action_send_to_ocr(self):
        self.env['seisei.feature.gate'].check_access('module_ocr')
        return super().action_send_to_ocr()

    def _process_single_ocr(self):
        self.env['seisei.feature.gate'].check_access('module_ocr')
        return super()._process_single_ocr()
