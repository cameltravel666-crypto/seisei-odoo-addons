# -*- coding: utf-8 -*-

from odoo import models


class QrOrderGate(models.Model):
    _inherit = 'qr.order'

    def action_submit_order(self):
        self.env['seisei.feature.gate'].check_access('module_qr_ordering')
        return super().action_submit_order()
