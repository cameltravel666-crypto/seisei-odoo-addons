# -*- coding: utf-8 -*-
from odoo import models


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    def action_quotation_send(self):
        """Override to add force_lang to context for language selection in wizard."""
        res = super().action_quotation_send()

        if res.get('res_model') == 'mail.compose.message':
            ctx = dict(res.get('context', {}))
            # Set default language from partner or current user
            default_lang = False
            if len(self) == 1:
                default_lang = self.partner_id.lang or self.env.user.lang or 'ja_JP'
            ctx['default_force_lang'] = default_lang
            ctx['show_force_lang'] = True
            res['context'] = ctx

        return res
