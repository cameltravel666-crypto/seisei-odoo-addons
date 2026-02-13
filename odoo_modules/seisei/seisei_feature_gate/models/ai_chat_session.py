# -*- coding: utf-8 -*-

from odoo import models


class AiChatSessionGate(models.Model):
    _inherit = 'ai.chat.session'

    def send_user_message(self, content):
        self.env['seisei.feature.gate'].check_access('module_ai')
        return super().send_user_message(content)
