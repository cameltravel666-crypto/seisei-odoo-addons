# -*- coding: utf-8 -*-
from odoo import models


class AccountMove(models.Model):
    _inherit = 'account.move'

    def action_open_netting_wizard(self):
        """Open the AR/AP netting wizard for this invoice's partner."""
        self.ensure_one()
        if not self.partner_id:
            return

        return {
            'name': 'AR/AP Netting',
            'type': 'ir.actions.act_window',
            'res_model': 'ar.ap.netting.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_partner_id': self.partner_id.id,
                'default_company_id': self.company_id.id,
            },
        }
