# -*- coding: utf-8 -*-
import os
from odoo import api, fields, models, _


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # Read-only display of current S3 configuration (from environment)
    s3_status = fields.Char(
        string='S3 Status',
        compute='_compute_s3_status',
        readonly=True,
    )
    s3_bucket_display = fields.Char(
        string='Bucket',
        compute='_compute_s3_status',
        readonly=True,
    )
    s3_region_display = fields.Char(
        string='Region',
        compute='_compute_s3_status',
        readonly=True,
    )
    s3_prefix_display = fields.Char(
        string='Prefix',
        compute='_compute_s3_status',
        readonly=True,
    )
    s3_config_source = fields.Char(
        string='Configuration Source',
        compute='_compute_s3_status',
        readonly=True,
    )

    @api.depends_context('lang')
    def _compute_s3_status(self):
        """Compute S3 status from environment variables."""
        for record in self:
            config = self.env['ir.attachment']._get_s3_config()

            if config['enabled'] and config['bucket']:
                record.s3_status = _('Enabled')
            elif config['bucket']:
                record.s3_status = _('Configured but disabled')
            else:
                record.s3_status = _('Not configured')

            record.s3_bucket_display = config['bucket'] or _('(not set)')
            record.s3_region_display = config['region'] or 'ap-northeast-1'
            record.s3_prefix_display = config['prefix'] or 'odoo-attachments'

            # Determine config source
            if os.environ.get('SEISEI_S3_BUCKET'):
                record.s3_config_source = _('Environment Variables (system-wide)')
            else:
                record.s3_config_source = _('System Parameters')

    def action_s3_test_connection(self):
        """Test S3 connection button action."""
        self.ensure_one()

        result = self.env['ir.attachment']._s3_test_connection()

        if result['success']:
            message_type = 'success'
            title = _('Connection Successful')
        else:
            message_type = 'danger'
            title = _('Connection Failed')

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': title,
                'message': result['message'],
                'type': message_type,
                'sticky': False,
            }
        }

    def action_open_s3_migration_wizard(self):
        """Open S3 migration wizard."""
        return {
            'name': _('Migrate Attachments to S3'),
            'type': 'ir.actions.act_window',
            'res_model': 's3.migration.wizard',
            'view_mode': 'form',
            'target': 'new',
        }
