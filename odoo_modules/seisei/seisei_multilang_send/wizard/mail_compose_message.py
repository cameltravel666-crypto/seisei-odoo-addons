# -*- coding: utf-8 -*-
from odoo import api, fields, models


class MailComposeMessage(models.TransientModel):
    _inherit = 'mail.compose.message'

    force_lang = fields.Many2one(
        'res.lang',
        string='Document Language',
        help='Select the language for this document. '
             'The email and PDF will be rendered in this language.',
    )
    show_force_lang = fields.Boolean(
        default=False,
        help='Technical field to control visibility of language selector',
    )

    @api.model
    def default_get(self, fields_list):
        """Set default force_lang from context."""
        res = super().default_get(fields_list)

        if 'force_lang' in fields_list:
            default_lang_code = self._context.get('default_force_lang')
            if default_lang_code:
                lang = self.env['res.lang'].search([
                    ('code', '=', default_lang_code),
                    ('active', '=', True),
                ], limit=1)
                if lang:
                    res['force_lang'] = lang.id

        if 'show_force_lang' in fields_list:
            res['show_force_lang'] = self._context.get('show_force_lang', False)

        return res

    @api.onchange('force_lang')
    def _onchange_force_lang(self):
        """Re-render template when language changes."""
        if self.force_lang and self.template_id:
            try:
                lang_code = self.force_lang.code
                # Get the record to render
                res_ids = self.res_ids
                if not res_ids:
                    return
                res_id = res_ids[0] if isinstance(res_ids, list) else res_ids

                # Render template with forced language context
                template = self.template_id.with_context(lang=lang_code)

                # Render subject - use compute_lang=False to avoid double evaluation
                if template.subject:
                    rendered = template._render_field(
                        'subject', [res_id], compute_lang=False
                    )
                    if res_id in rendered:
                        self.subject = rendered[res_id]

                # Render body
                if template.body_html:
                    rendered = template._render_field(
                        'body_html', [res_id],
                        post_process=True, compute_lang=False
                    )
                    if res_id in rendered:
                        self.body = rendered[res_id]
            except Exception:
                # If template rendering fails, just keep current values
                pass

    def _action_send_mail(self, auto_commit=False):
        """Override to inject selected language into context."""
        if self.force_lang:
            self = self.with_context(lang=self.force_lang.code)
        return super()._action_send_mail(auto_commit=auto_commit)

    def action_send_mail(self):
        """Override send action to use selected language for rendering."""
        if self.force_lang:
            # Inject lang into context for template rendering and report generation
            self = self.with_context(lang=self.force_lang.code)
        return super().action_send_mail()
