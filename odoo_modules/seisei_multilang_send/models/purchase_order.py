# -*- coding: utf-8 -*-
from odoo import models


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    def action_rfq_send(self):
        """Override to add force_lang to context for language selection in wizard."""
        res = super().action_rfq_send()

        if res.get('res_model') == 'mail.compose.message':
            ctx = dict(res.get('context', {}))
            # Set default language from partner or current user
            default_lang = self.partner_id.lang or self.env.user.lang or 'ja_JP'
            ctx['default_force_lang'] = default_lang
            ctx['show_force_lang'] = True
            res['context'] = ctx

        return res
