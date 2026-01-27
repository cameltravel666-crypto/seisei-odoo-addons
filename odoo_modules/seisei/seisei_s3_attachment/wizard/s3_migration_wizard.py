# -*- coding: utf-8 -*-
import base64
import logging
import os

from odoo import api, fields, models, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class S3MigrationWizard(models.TransientModel):
    _name = 's3.migration.wizard'
    _description = 'S3 Attachment Migration Wizard'

    state = fields.Selection([
        ('preview', 'Preview'),
        ('migrating', 'Migrating'),
        ('done', 'Done'),
    ], default='preview', readonly=True)

    # Preview stats
    total_filestore_count = fields.Integer(
        string='Filestore Attachments',
        compute='_compute_stats',
    )
    total_filestore_size = fields.Float(
        string='Filestore Size (MB)',
        compute='_compute_stats',
    )
    total_s3_count = fields.Integer(
        string='S3 Attachments',
        compute='_compute_stats',
    )
    total_url_count = fields.Integer(
        string='URL Attachments',
        compute='_compute_stats',
    )

    # Migration options
    batch_size = fields.Integer(
        string='Batch Size',
        default=100,
        help='Number of attachments to migrate per batch',
    )
    migrate_from_date = fields.Date(
        string='From Date',
        help='Only migrate attachments created after this date',
    )

    # Progress
    migrated_count = fields.Integer(string='Migrated', readonly=True)
    failed_count = fields.Integer(string='Failed', readonly=True)
    progress_message = fields.Text(string='Progress', readonly=True)

    @api.depends('state')
    def _compute_stats(self):
        """Compute attachment statistics."""
        for wizard in self:
            Attachment = self.env['ir.attachment'].sudo()

            # Filestore attachments (not S3, not URL)
            filestore_domain = [
                ('type', '=', 'binary'),
                ('store_fname', '!=', False),
                '!', ('store_fname', '=like', 's3://%'),
            ]
            filestore_attachments = Attachment.search(filestore_domain)
            wizard.total_filestore_count = len(filestore_attachments)

            # Calculate size
            total_size = sum(att.file_size or 0 for att in filestore_attachments)
            wizard.total_filestore_size = total_size / (1024 * 1024)  # Convert to MB

            # S3 attachments
            s3_domain = [
                ('type', '=', 'binary'),
                ('store_fname', '=like', 's3://%'),
            ]
            wizard.total_s3_count = Attachment.search_count(s3_domain)

            # URL attachments
            url_domain = [('type', '=', 'url')]
            wizard.total_url_count = Attachment.search_count(url_domain)

    def action_preview(self):
        """Refresh preview stats."""
        self.ensure_one()
        self.state = 'preview'
        return self._reopen_wizard()

    def action_migrate(self):
        """Start migration to S3."""
        self.ensure_one()

        # Verify S3 is configured
        config = self.env['ir.attachment']._get_s3_config()
        if not config['enabled']:
            raise UserError(_('S3 storage is not enabled. Please enable it in Settings first.'))
        if not config['bucket']:
            raise UserError(_('S3 bucket is not configured. Please configure it in Settings first.'))

        # Test connection
        result = self.env['ir.attachment']._s3_test_connection()
        if not result['success']:
            raise UserError(_('S3 connection failed: %s') % result['message'])

        self.state = 'migrating'
        self.migrated_count = 0
        self.failed_count = 0
        self.progress_message = ''

        return self._do_migrate()

    def _do_migrate(self):
        """Perform the actual migration."""
        self.ensure_one()

        Attachment = self.env['ir.attachment'].sudo()

        # Build domain for filestore attachments
        domain = [
            ('type', '=', 'binary'),
            ('store_fname', '!=', False),
            '!', ('store_fname', '=like', 's3://%'),
        ]
        if self.migrate_from_date:
            domain.append(('create_date', '>=', self.migrate_from_date))

        # Get batch of attachments
        attachments = Attachment.search(domain, limit=self.batch_size, order='id asc')

        if not attachments:
            self.state = 'done'
            self.progress_message = _(
                'Migration complete!\n'
                'Migrated: %(migrated)d\n'
                'Failed: %(failed)d'
            ) % {'migrated': self.migrated_count, 'failed': self.failed_count}
            return self._reopen_wizard()

        migrated = 0
        failed = 0
        messages = []

        for attachment in attachments:
            try:
                # Read current data
                data = attachment.datas
                if not data:
                    _logger.warning("Attachment %s has no data, skipping", attachment.id)
                    failed += 1
                    continue

                # Get checksum
                checksum = attachment.checksum
                if not checksum:
                    import hashlib
                    bin_data = base64.b64decode(data)
                    checksum = hashlib.sha1(bin_data).hexdigest()

                # Compute S3 key and upload
                IrAttachment = self.env['ir.attachment']
                s3_key = IrAttachment._compute_s3_key(checksum)
                bin_data = base64.b64decode(data)

                if IrAttachment._s3_write(bin_data, s3_key):
                    # Update attachment record
                    old_fname = attachment.store_fname
                    attachment.write({
                        'store_fname': f's3://{s3_key}',
                    })
                    migrated += 1
                    _logger.info(
                        "Migrated attachment %s: %s -> s3://%s",
                        attachment.id, old_fname, s3_key
                    )
                else:
                    failed += 1
                    messages.append(f"Failed to upload attachment {attachment.id}")

            except Exception as e:
                failed += 1
                messages.append(f"Error migrating attachment {attachment.id}: {e}")
                _logger.exception("Error migrating attachment %s", attachment.id)

        self.migrated_count += migrated
        self.failed_count += failed
        self.progress_message = _(
            'Batch complete: %(migrated)d migrated, %(failed)d failed\n'
            'Total progress: %(total_migrated)d migrated, %(total_failed)d failed\n'
            '%(messages)s'
        ) % {
            'migrated': migrated,
            'failed': failed,
            'total_migrated': self.migrated_count,
            'total_failed': self.failed_count,
            'messages': '\n'.join(messages) if messages else '',
        }

        # Check if more to migrate
        remaining = Attachment.search_count(domain)
        if remaining > 0:
            self.progress_message += _('\n\nRemaining: %d attachments') % remaining
            return self._reopen_wizard()
        else:
            self.state = 'done'
            self.progress_message = _(
                'Migration complete!\n'
                'Total migrated: %(migrated)d\n'
                'Total failed: %(failed)d'
            ) % {'migrated': self.migrated_count, 'failed': self.failed_count}
            return self._reopen_wizard()

    def action_continue_migration(self):
        """Continue migration with next batch."""
        return self._do_migrate()

    def _reopen_wizard(self):
        """Reopen wizard to show updated state."""
        return {
            'name': _('S3 Migration'),
            'type': 'ir.actions.act_window',
            'res_model': 's3.migration.wizard',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }

    def action_rollback_info(self):
        """Show rollback information."""
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Rollback Information'),
                'message': _(
                    'To rollback S3 storage:\n'
                    '1. Disable S3 in Settings\n'
                    '2. New attachments will be stored in filestore\n'
                    '3. Existing S3 attachments remain accessible\n'
                    '4. Use migration wizard to move S3 files back to filestore (not yet implemented)'
                ),
                'type': 'info',
                'sticky': True,
            }
        }
