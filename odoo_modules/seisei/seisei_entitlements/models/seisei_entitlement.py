# -*- coding: utf-8 -*-
# seisei.entitlement model - Stores active features for this tenant

from odoo import api, fields, models
import logging

_logger = logging.getLogger(__name__)


class SeiseiEntitlement(models.Model):
    _name = 'seisei.entitlement'
    _description = 'Seisei Entitlement'
    _order = 'feature_key'

    feature_key = fields.Char(
        string='Feature Key',
        required=True,
        index=True,
        help='Unique identifier of the feature (e.g., module_inventory)',
    )
    feature_name = fields.Char(
        string='Feature Name',
        help='Human-readable name of the feature',
    )
    active = fields.Boolean(
        string='Active',
        default=True,
        help='Whether this feature is currently active',
    )
    granted_at = fields.Datetime(
        string='Granted At',
        default=fields.Datetime.now,
        help='When this feature was granted',
    )
    last_updated = fields.Datetime(
        string='Last Updated',
        default=fields.Datetime.now,
        help='When this entitlement was last updated',
    )
    source = fields.Char(
        string='Source',
        help='Source system that granted this entitlement',
    )
    tenant_code = fields.Char(
        string='Tenant Code',
        help='Tenant code from billing system',
    )

    _sql_constraints = [
        ('feature_key_uniq', 'unique(feature_key)', 'Feature key must be unique!'),
    ]

    @api.model
    def is_feature_enabled(self, feature_key):
        """Check if a specific feature is enabled.

        Args:
            feature_key: The feature key to check

        Returns:
            bool: True if the feature is enabled, False otherwise
        """
        entitlement = self.search([
            ('feature_key', '=', feature_key),
            ('active', '=', True),
        ], limit=1)
        return bool(entitlement)

    @api.model
    def get_enabled_features(self):
        """Get list of all enabled feature keys.

        Returns:
            list: List of enabled feature keys
        """
        entitlements = self.search([('active', '=', True)])
        return entitlements.mapped('feature_key')

    @api.model
    def apply_entitlements(self, tenant_code, features, source=None):
        """Apply entitlements from billing system.

        This method:
        1. Activates features in the list
        2. Deactivates features not in the list
        3. Creates new entitlements for new features

        Args:
            tenant_code: The tenant code
            features: List of feature keys to activate
            source: Source identifier (e.g., 'odoo19_billing')

        Returns:
            dict: Summary of changes made
        """
        features = set(features or [])
        now = fields.Datetime.now()

        # Get existing entitlements
        existing = self.with_context(active_test=False).search([])
        existing_keys = set(existing.mapped('feature_key'))

        activated = []
        deactivated = []
        created = []

        # Activate existing features that should be active
        for ent in existing:
            if ent.feature_key in features:
                if not ent.active:
                    ent.write({
                        'active': True,
                        'last_updated': now,
                        'source': source,
                        'tenant_code': tenant_code,
                    })
                    activated.append(ent.feature_key)
                else:
                    # Update last_updated even if already active
                    ent.write({
                        'last_updated': now,
                        'source': source,
                        'tenant_code': tenant_code,
                    })
            else:
                # Deactivate features not in the list
                if ent.active:
                    ent.write({
                        'active': False,
                        'last_updated': now,
                    })
                    deactivated.append(ent.feature_key)

        # Create new entitlements for features not yet in database
        new_features = features - existing_keys
        for feature_key in new_features:
            self.create({
                'feature_key': feature_key,
                'active': True,
                'granted_at': now,
                'last_updated': now,
                'source': source,
                'tenant_code': tenant_code,
            })
            created.append(feature_key)

        _logger.info(
            f"Applied entitlements for tenant {tenant_code}: "
            f"activated={activated}, deactivated={deactivated}, created={created}"
        )

        return {
            'activated': activated,
            'deactivated': deactivated,
            'created': created,
            'total_active': len(self.search([('active', '=', True)])),
        }
