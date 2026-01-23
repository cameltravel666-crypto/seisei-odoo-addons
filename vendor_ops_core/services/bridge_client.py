# -*- coding: utf-8 -*-
# Bridge API Client for vendor_ops_core
# Version: 19.0.2.0.0 - merged from vendor_ops_intake_notion

import json
import logging
import requests
from urllib.parse import urlencode
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


def _safe_json(obj, limit=2000):
    """Safely serialize object to JSON string with limit."""
    try:
        result = json.dumps(obj, ensure_ascii=False, default=str)
        return result[:limit]
    except Exception as e:
        return f"<JSON error: {str(e)}>"


def _shape(obj):
    """Get shape description of an object for debugging."""
    if obj is None:
        return "None"
    if isinstance(obj, dict):
        return f"type=dict len={len(obj)} keys={sorted(list(obj.keys()))[:10]}"
    if isinstance(obj, list):
        return f"type=list len={len(obj)}"
    if isinstance(obj, str):
        return f"type=str len={len(obj)}"
    return f"type={type(obj).__name__}"


class BridgeClient:
    """Client for interacting with Vendor Bridge API."""

    def __init__(self, env):
        """Initialize Bridge client.

        Args:
            env: Odoo environment (odoo.api.Environment)
        """
        self.env = env
        self._load_config()

    def _load_config(self):
        """Load configuration from ir.config_parameter."""
        params = self.env['ir.config_parameter'].sudo()

        # Use vendor_ops.bridge_base_url (as per user requirement)
        self.base_url = params.get_param(
            'vendor_ops.bridge_base_url',
            default='http://127.0.0.1:23000'
        )
        self.timeout = int(params.get_param('vendor_ops.bridge_timeout_seconds', default='15'))

        if not self.base_url:
            raise UserError('vendor_ops.bridge_base_url not configured in System Parameters')

    def _bridge_request(self, method, path, json_data=None, timeout=None):
        """Make HTTP request to Bridge API.

        Args:
            method: HTTP method ('GET', 'POST', 'PUT', etc.)
            path: API endpoint path
            json_data: Request body (dict)
            timeout: Request timeout in seconds (default: self.timeout)

        Returns:
            dict: Response JSON data (normalized with ok/error fields)

        Raises:
            UserError: On API errors (4xx, 5xx, timeout, etc.)
        """
        url = f"{self.base_url.rstrip('/')}{path}"
        timeout = timeout or self.timeout

        headers = {
            'Content-Type': 'application/json',
        }

        try:
            _logger.info(f"Bridge Request: {method} {url}")
            if json_data:
                _logger.debug(f"Bridge Request Body: {_safe_json(json_data, 500)}")

            response = requests.request(
                method=method,
                url=url,
                json=json_data,
                headers=headers,
                timeout=timeout
            )

            # Log response
            response_preview = response.text[:1000] if response.text else '(empty)'
            _logger.info(f"Bridge Response: {response.status_code} - {response_preview[:200]}")

            # Parse JSON
            try:
                response_data = response.json() if response.text else {}
            except ValueError as e:
                raise UserError(f"Bridge API returned invalid JSON: {str(e)}. Response: {response_preview[:200]}")

            # Log full response shape for debugging
            _logger.debug(f"Bridge Response Shape: {_shape(response_data)}")

            # Check status code - return normalized response for caller to handle
            if response.status_code >= 400:
                error_msg = response_data.get('message') or response_data.get('error') or f'HTTP {response.status_code}'
                error_code = response_data.get('code') or response_data.get('error_code') or 'UNKNOWN_ERROR'
                trace_id = response_data.get('traceId') or response_data.get('trace_id') or response_data.get('request_id')

                # Return normalized error response instead of raising
                # This allows caller to handle errors with full context
                return {
                    'ok': False,
                    'error': error_msg,
                    'error_code': error_code,
                    'status': response.status_code,
                    'traceId': trace_id,
                    'error_shape': _shape(response_data),
                    'parsed_preview': _safe_json(response_data, 200),
                }

            # Add ok=True if not present
            if 'ok' not in response_data:
                response_data['ok'] = True

            return response_data

        except requests.exceptions.Timeout:
            return {
                'ok': False,
                'error': f"Bridge API timeout after {timeout}s",
                'error_code': 'TIMEOUT',
                'status': 0,
            }
        except requests.exceptions.ConnectionError as e:
            return {
                'ok': False,
                'error': f"Cannot connect to Bridge API at {self.base_url}: {str(e)[:200]}",
                'error_code': 'CONNECTION_ERROR',
                'status': 0,
            }
        except UserError:
            raise
        except Exception as e:
            _logger.exception("Unexpected error in Bridge API request")
            return {
                'ok': False,
                'error': f"Unexpected error: {str(e)[:200]}",
                'error_code': 'UNEXPECTED_ERROR',
                'status': 0,
            }

    # ========== Intake Batch API ==========

    def create_intake_batch(self, tenant_code, store_code, effective_month, note=None):
        """Create intake batch via Bridge API.

        Args:
            tenant_code: Tenant code (e.g., 'TEN-000007')
            store_code: Store code (e.g., 'S001')
            effective_month: Effective month in YYYY-MM format
            note: Optional note

        Returns:
            dict: Response with batch_id, client_record_url, notion_pack_url, etc.
        """
        body = {
            'tenant_code': tenant_code,
            'store_code': store_code,
            'effective_month': effective_month,
        }
        if note:
            body['note'] = note

        # Use longer timeout for batch creation (creates Notion pages/databases)
        response = self._bridge_request('POST', '/admin/intake/batches', json_data=body, timeout=60)

        # Log full response for mapping reference
        _logger.info(f"Bridge create_batch response: {_safe_json(response)}")

        return response

    def generate_pack(self, batch_id):
        """Generate Notion pack via Bridge API.

        Args:
            batch_id: Bridge batch ID (UUID)

        Returns:
            dict: Response with pack_url, table_ids
        """
        path = f'/admin/intake/batches/{batch_id}/generate-pack'

        # Use longer timeout for pack generation (creates Notion pages/databases)
        response = self._bridge_request('POST', path, timeout=60)

        _logger.info(f"Bridge generate_pack response: {_safe_json(response)}")

        return response

    def pull_from_notion(self, tenant_code, batch_id):
        """Pull data from Notion via Bridge API (single-entry legacy method).

        Calls Bridge POST /admin/intake/run?tenant_code=...&batch_id=...

        Args:
            tenant_code: Tenant code
            batch_id: Bridge batch ID (UUID)

        Returns:
            dict: Response with records
        """
        query_params = {
            'tenant_code': tenant_code,
            'batch_id': batch_id,
        }
        path = '/admin/intake/run?' + urlencode(query_params)

        response = self._bridge_request('POST', path, json_data=None)

        return response

    def pull_all(self, tenant_code, batch_id):
        """Pull all entry types from Notion via Bridge API.

        Comprehensive pull endpoint that imports all entry types at once.
        Uses POST /admin/intake/batches/:id/pull or fallback to /admin/intake/run

        Args:
            tenant_code: Tenant code
            batch_id: Bridge batch ID (UUID)

        Returns:
            dict: Normalized response with ok, counts, request_id
        """
        # Try the dedicated pull endpoint first
        path = f'/admin/intake/batches/{batch_id}/pull'

        # Use longer timeout for pull operations (queries multiple Notion databases)
        response = self._bridge_request('POST', path, json_data={
            'tenant_code': tenant_code,
        }, timeout=60)

        # If 404, fallback to /admin/intake/run
        # Note: Bridge API returns 'statusCode' (not 'status') for HTTP errors
        if isinstance(response, dict) and (response.get('status') == 404 or response.get('statusCode') == 404):
            _logger.info("Pull endpoint not found, falling back to /admin/intake/run")
            return self.pull_from_notion(tenant_code, batch_id)

        _logger.info(f"Bridge pull_all response shape: {_shape(response)}")

        return response

    def get_batch_info(self, batch_id):
        """Get batch info including pack_databases from Bridge API.

        Used as fallback when notion_pack_databases_json is missing.
        Calls GET /admin/intake/batches/:id

        Args:
            batch_id: Bridge batch ID (UUID)

        Returns:
            dict: Response with batch info including pack_databases
        """
        path = f'/admin/intake/batches/{batch_id}'

        response = self._bridge_request('GET', path)

        _logger.info(f"Bridge get_batch_info response: {_safe_json(response)}")

        return response

    # ========== Tenant API ==========

    def upsert_tenant(self, tenant_code, tenant_name, **kwargs):
        """Upsert tenant via Bridge API.

        Args:
            tenant_code: Tenant code (e.g., 'TEN-000007')
            tenant_name: Tenant name
            **kwargs: Additional fields (subdomain, domain_primary, customer_db_name, etc.)

        Returns:
            dict: Response with tenant data
        """
        body = {
            'tenant_code': tenant_code,
            'tenant_name': tenant_name,
            **kwargs,
        }

        path = f'/admin/tenants/{tenant_code}'
        response = self._bridge_request('PUT', path, json_data=body)

        _logger.info(f"Bridge upsert_tenant response: {_safe_json(response)}")

        return response
