# -*- coding: utf-8 -*-
# API Controller for receiving entitlements from billing system

from odoo import http
from odoo.http import request
import json
import logging

_logger = logging.getLogger(__name__)


class SeiseiEntitlementAPI(http.Controller):
    """API Controller for Seisei Entitlements.

    Provides endpoints for:
    - Receiving entitlements from billing system
    - Checking feature status
    """

    def _validate_api_key(self):
        """Validate API key from request headers.

        Returns:
            tuple: (is_valid, api_key_record_or_error_message)
        """
        api_key = request.httprequest.headers.get('X-API-KEY')
        if not api_key:
            return False, 'Missing X-API-KEY header'

        ApiKey = request.env['seisei.api.key'].sudo()
        key_record = ApiKey.validate_key(api_key)

        if not key_record:
            return False, 'Invalid or inactive API key'

        return True, key_record

    def _get_client_ip(self):
        """Get client IP address from request."""
        # Check for forwarded IP (behind proxy)
        forwarded_for = request.httprequest.headers.get('X-Forwarded-For')
        if forwarded_for:
            return forwarded_for.split(',')[0].strip()
        return request.httprequest.remote_addr

    @http.route(
        '/seisei/entitlements/apply',
        type='json',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def apply_entitlements(self, tenant_code=None, features=None, source=None, timestamp=None, **kwargs):
        """Apply entitlements from billing system.

        Expected JSON payload:
        {
            "tenant_code": "TEN-00000001",
            "features": ["feature_1", "feature_2"],
            "source": "odoo19_billing",
            "timestamp": "2026-01-12T12:00:00Z"
        }

        Returns:
            dict: Result of the operation
        """
        # Validate API key
        is_valid, result = self._validate_api_key()
        if not is_valid:
            _logger.warning(f"API key validation failed: {result}")
            return {
                'success': False,
                'error': result,
            }

        api_key_record = result
        client_ip = self._get_client_ip()

        # Use method parameters directly (Odoo 18 style)
        if features is None:
            features = []

        _logger.info(
            f"Received entitlement request from {client_ip}: "
            f"tenant={tenant_code}, features={features}, source={source}"
        )

        # Create log entry
        EntitlementLog = request.env['seisei.entitlement.log'].sudo()
        log_vals = {
            'tenant_code': tenant_code,
            'source': source,
            'features_received': json.dumps(features),
            'request_ip': client_ip,
            'api_key_name': api_key_record.name,
        }

        try:
            # Apply entitlements
            Entitlement = request.env['seisei.entitlement'].sudo()
            result = Entitlement.apply_entitlements(
                tenant_code=tenant_code,
                features=features,
                source=source,
            )

            # Update log with results
            log_vals.update({
                'status': 'success',
                'features_activated': json.dumps(result.get('activated', [])),
                'features_deactivated': json.dumps(result.get('deactivated', [])),
                'features_created': json.dumps(result.get('created', [])),
                'total_active': result.get('total_active', 0),
            })
            EntitlementLog.create(log_vals)

            return {
                'success': True,
                'message': 'Entitlements applied successfully',
                'result': result,
            }

        except Exception as e:
            _logger.exception(f"Error applying entitlements: {e}")
            log_vals.update({
                'status': 'failed',
                'error_message': str(e),
            })
            EntitlementLog.create(log_vals)

            return {
                'success': False,
                'error': str(e),
            }

    @http.route(
        '/seisei/entitlements/check',
        type='json',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def check_feature(self, feature_key=None, **kwargs):
        """Check if a specific feature is enabled.

        Expected JSON payload:
        {
            "feature_key": "module_inventory"
        }

        Returns:
            dict: Feature status
        """
        # Validate API key
        is_valid, result = self._validate_api_key()
        if not is_valid:
            return {
                'success': False,
                'error': result,
            }

        if not feature_key:
            return {
                'success': False,
                'error': 'Missing feature_key',
            }

        Entitlement = request.env['seisei.entitlement'].sudo()
        is_enabled = Entitlement.is_feature_enabled(feature_key)

        return {
            'success': True,
            'feature_key': feature_key,
            'enabled': is_enabled,
        }

    @http.route(
        '/seisei/entitlements/list',
        type='json',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def list_features(self):
        """List all enabled features.

        Returns:
            dict: List of enabled features
        """
        # Validate API key
        is_valid, result = self._validate_api_key()
        if not is_valid:
            return {
                'success': False,
                'error': result,
            }

        Entitlement = request.env['seisei.entitlement'].sudo()
        features = Entitlement.get_enabled_features()

        return {
            'success': True,
            'features': features,
            'count': len(features),
        }

    @http.route(
        '/seisei/entitlements/health',
        type='http',
        auth='none',
        methods=['GET'],
        csrf=False,
    )
    def health_check(self):
        """Simple health check endpoint (no auth required)."""
        return request.make_response(
            json.dumps({
                'status': 'ok',
                'service': 'seisei_entitlements',
            }),
            headers=[('Content-Type', 'application/json')],
        )
