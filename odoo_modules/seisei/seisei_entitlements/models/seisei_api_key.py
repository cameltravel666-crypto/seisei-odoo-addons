# -*- coding: utf-8 -*-
# seisei.api.key model - API key management for authentication

from odoo import api, fields, models
import secrets
import hashlib
import logging

_logger = logging.getLogger(__name__)


class SeiseiApiKey(models.Model):
    _name = 'seisei.api.key'
    _description = 'Seisei API Key'
    _order = 'name'

    name = fields.Char(
        string='Name',
        required=True,
        help='Descriptive name for this API key',
    )
    key_hash = fields.Char(
        string='Key Hash',
        readonly=True,
        help='Hashed API key (original key is not stored)',
    )
    key_prefix = fields.Char(
        string='Key Prefix',
        readonly=True,
        help='First 8 characters of the key for identification',
    )
    active = fields.Boolean(
        string='Active',
        default=True,
    )
    last_used = fields.Datetime(
        string='Last Used',
        readonly=True,
    )
    created_by = fields.Many2one(
        'res.users',
        string='Created By',
        default=lambda self: self.env.user,
        readonly=True,
    )
    notes = fields.Text(
        string='Notes',
    )

    @api.model
    def generate_key(self, name, notes=None):
        """Generate a new API key.

        Args:
            name: Descriptive name for the key
            notes: Optional notes

        Returns:
            tuple: (record, plain_key) - The created record and the plain text key
                   (plain key is only returned once and not stored)
        """
        # Generate a secure random key
        plain_key = secrets.token_urlsafe(32)
        key_hash = hashlib.sha256(plain_key.encode()).hexdigest()
        key_prefix = plain_key[:8]

        record = self.create({
            'name': name,
            'key_hash': key_hash,
            'key_prefix': key_prefix,
            'notes': notes,
        })

        _logger.info(f"Generated new API key: {name} (prefix: {key_prefix})")

        return record, plain_key

    @api.model
    def validate_key(self, plain_key):
        """Validate an API key.

        Args:
            plain_key: The plain text API key to validate

        Returns:
            record or False: The API key record if valid, False otherwise
        """
        if not plain_key:
            return False

        key_hash = hashlib.sha256(plain_key.encode()).hexdigest()
        key_record = self.search([
            ('key_hash', '=', key_hash),
            ('active', '=', True),
        ], limit=1)

        if key_record:
            # Update last used timestamp
            key_record.write({'last_used': fields.Datetime.now()})
            return key_record

        return False

    def action_regenerate_key(self):
        """Regenerate the API key (creates a new key for this record)."""
        self.ensure_one()

        plain_key = secrets.token_urlsafe(32)
        key_hash = hashlib.sha256(plain_key.encode()).hexdigest()
        key_prefix = plain_key[:8]

        self.write({
            'key_hash': key_hash,
            'key_prefix': key_prefix,
        })

        _logger.info(f"Regenerated API key: {self.name} (new prefix: {key_prefix})")

        # Return the new key in a notification
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'New API Key Generated',
                'message': f'Your new API key is: {plain_key}\n\nPlease copy it now. It will not be shown again.',
                'type': 'warning',
                'sticky': True,
            }
        }
