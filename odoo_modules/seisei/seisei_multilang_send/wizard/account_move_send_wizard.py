# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.tools.misc import get_lang


class AccountMoveSendWizard(models.TransientModel):
    _inherit = 'account.move.send.wizard'

    force_lang_id = fields.Many2one(
        'res.lang',
        string='Document Language',
        compute='_compute_force_lang_id',
        store=True,
        readonly=False,
        help='Select the language for this document. '
             'The email and PDF will be rendered in this language.',
    )

    @api.depends('move_id.partner_id')
    def _compute_force_lang_id(self):
        """Default language from partner or user."""
        for wizard in self:
            lang_code = (
                wizard.move_id.partner_id.lang
                or self.env.user.lang
                or get_lang(self.env).code
            )
            lang = self.env['res.lang'].search([
                ('code', '=', lang_code),
                ('active', '=', True),
            ], limit=1)
            wizard.force_lang_id = lang

    @api.depends('force_lang_id')
    def _compute_mail_lang(self):
        """Override to use force_lang_id if set."""
        for wizard in self:
            if wizard.force_lang_id:
                wizard.mail_lang = wizard.force_lang_id.code
            elif wizard.mail_template_id:
                wizard.mail_lang = self._get_default_mail_lang(
                    wizard.move_id, wizard.mail_template_id
                )
            else:
                wizard.mail_lang = get_lang(self.env).code

    @api.onchange('force_lang_id')
    def _onchange_force_lang_id(self):
        """Re-compute email subject and body when language changes."""
        if self.force_lang_id and self.mail_template_id:
            lang_code = self.force_lang_id.code
            self.mail_subject = self._get_default_mail_subject(
                self.move_id, self.mail_template_id, lang_code
            )
            self.mail_body = self._get_default_mail_body(
                self.move_id, self.mail_template_id, lang_code
            )

    def action_send_and_print(self, **kwargs):
        """Override to inject selected language into context for PDF rendering."""
        if self.force_lang_id:
            self = self.with_context(lang=self.force_lang_id.code)
        return super().action_send_and_print(**kwargs)
