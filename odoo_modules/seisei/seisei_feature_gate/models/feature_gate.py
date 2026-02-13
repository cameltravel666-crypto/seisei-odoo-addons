# -*- coding: utf-8 -*-

import logging
import time
from datetime import datetime

from odoo import api, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

# Module-level cache: {feature_key: (result_bool, expire_timestamp)}
_cache = {}
_CACHE_TTL = 60  # seconds


class FeatureGate(models.AbstractModel):
    _name = 'seisei.feature.gate'
    _description = 'Seisei Feature Gate'

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @api.model
    def check_access(self, feature_key):
        """Check whether the current tenant may use *feature_key*.

        Resolution order:
        1. Trial period active → allow
        2. Entitlement enabled  → allow
        3. Otherwise            → raise UserError
        """
        if self.is_in_trial():
            return True

        if self._is_entitled(feature_key):
            return True

        raise UserError(
            'この機能にはサブスクリプションが必要です。\n'
            'This feature requires an active subscription.\n\n'
            f'Feature: {feature_key}\n'
            '管理者に連絡するか、サブスクリプションをアップグレードしてください。'
        )

    # ------------------------------------------------------------------
    # Trial helpers
    # ------------------------------------------------------------------

    @api.model
    def is_in_trial(self):
        """Return True if the tenant is still within its trial window."""
        ICP = self.env['ir.config_parameter'].sudo()
        install_date_str = ICP.get_param('seisei_feature_gate.install_date')
        if not install_date_str:
            # No install date recorded — treat as trial (defensive).
            return True

        trial_days = int(ICP.get_param('seisei_feature_gate.trial_days', '30'))

        try:
            install_dt = datetime.fromisoformat(install_date_str)
        except (ValueError, TypeError):
            _logger.warning(
                'Invalid seisei_feature_gate.install_date: %s — treating as trial',
                install_date_str,
            )
            return True

        elapsed = (datetime.now() - install_dt.replace(tzinfo=None)).days
        return elapsed < trial_days

    # ------------------------------------------------------------------
    # Entitlement check (cached)
    # ------------------------------------------------------------------

    @api.model
    def _is_entitled(self, feature_key):
        """Check entitlement with a 60-second module-level cache."""
        now = time.time()
        cached = _cache.get(feature_key)
        if cached and cached[1] > now:
            return cached[0]

        result = self.env['seisei.entitlement'].sudo().is_feature_enabled(feature_key)
        _cache[feature_key] = (result, now + _CACHE_TTL)
        return result

    @api.model
    def clear_cache(self):
        """Clear the entitlement cache (e.g. after receiving new entitlements)."""
        _cache.clear()


class SeiseiEntitlementGate(models.Model):
    _inherit = 'seisei.entitlement'

    @api.model
    def apply_entitlements(self, tenant_code, features, source=None):
        """Override to clear gate cache when entitlements change."""
        result = super().apply_entitlements(tenant_code, features, source=source)
        self.env['seisei.feature.gate'].clear_cache()
        return result
