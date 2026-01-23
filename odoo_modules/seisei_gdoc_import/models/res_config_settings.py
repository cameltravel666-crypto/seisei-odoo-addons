# -*- coding: utf-8 -*-
import os
from odoo import api, fields, models, _


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # Read-only display of current configuration
    gdoc_status = fields.Char(
        string='Status',
        compute='_compute_gdoc_status',
        readonly=True,
    )
    gdoc_config_source = fields.Char(
        string='Configuration Source',
        compute='_compute_gdoc_status',
        readonly=True,
    )

    # Editable settings (when not using env vars)
    gdoc_enabled = fields.Boolean(
        string='Enable Google Doc Import',
        config_parameter='seisei.gdoc.enabled',
    )
    gdoc_service_account_json = fields.Text(
        string='Service Account JSON',
        config_parameter='seisei.gdoc.service_account_json',
        help='Paste the JSON content of your Google service account key file'
    )

    @api.depends_context('lang')
    def _compute_gdoc_status(self):
        for record in self:
            service = self.env['seisei.gdoc.service']
            config = service._get_config()

            if config['enabled'] and config['service_account_json']:
                record.gdoc_status = _('Enabled and Configured')
            elif config['service_account_json']:
                record.gdoc_status = _('Configured but Disabled')
            else:
                record.gdoc_status = _('Not Configured')

            if os.environ.get('SEISEI_GDOC_SERVICE_ACCOUNT_JSON'):
                record.gdoc_config_source = _('Environment Variables')
            else:
                record.gdoc_config_source = _('System Parameters')

    def action_gdoc_test_connection(self):
        """Test Google Docs API connection."""
        self.ensure_one()
        # Save settings first
        self.execute()

        service = self.env['seisei.gdoc.service']
        result = service.test_connection()

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Connection Test'),
                'message': result['message'],
                'type': 'success' if result['success'] else 'danger',
                'sticky': False,
            }
        }

    def action_open_gdoc_templates(self):
        """Open Google Doc templates list."""
        return {
            'name': _('Google Doc Templates'),
            'type': 'ir.actions.act_window',
            'res_model': 'seisei.gdoc.template',
            'view_mode': 'tree,form',
        }
