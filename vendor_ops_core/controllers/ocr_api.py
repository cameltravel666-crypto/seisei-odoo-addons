# -*- coding: utf-8 -*-
"""
OCR Webhook Controller for Odoo 19

Receives OCR usage notifications from Odoo 18 and updates tenant OCR counts.
This allows centralized billing management in Odoo 19.

Endpoint: POST /api/ocr/webhook
Required header: X-Odoo-Database: ERP
"""

import json
import logging
from odoo import http, fields
from odoo.http import request, Response

_logger = logging.getLogger(__name__)

# Webhook API key for authentication
OCR_WEBHOOK_KEY = "seisei-ocr-webhook-2026"


class OcrWebhookController(http.Controller):
    """Controller for OCR webhook from Odoo 18"""

    @http.route('/api/ocr/webhook', type='http', auth='none', methods=['POST'], csrf=False, save_session=False)
    def ocr_webhook(self, **kwargs):
        """
        Receive OCR usage notification from Odoo 18.

        Expected JSON-RPC payload:
        {
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "tenant_code": "ten_mkqzyn00",
                "document_id": 123,
                "document_model": "account.move",
                "document_name": "INV/2024/001",
                "ocr_status": "done",
                "ocr_pages": 1,
                "api_key": "seisei-ocr-webhook-2026"
            },
            "id": null
        }
        """
        try:
            # Parse JSON body
            raw_data = request.httprequest.data.decode('utf-8')
            data = json.loads(raw_data)

            # Handle both JSON-RPC format and direct params
            params = data.get('params', data)

            # Validate API key
            api_key = params.get('api_key')
            if api_key != OCR_WEBHOOK_KEY:
                _logger.warning(f'[OCR Webhook] Invalid API key: {api_key}')
                return Response(
                    json.dumps({
                        'jsonrpc': '2.0',
                        'result': {'success': False, 'error': 'Invalid API key'},
                        'id': data.get('id')
                    }),
                    content_type='application/json',
                    status=401
                )

            tenant_code = params.get('tenant_code', '')
            ocr_pages = params.get('ocr_pages', 1)
            document_id = params.get('document_id')
            document_model = params.get('document_model')
            document_name = params.get('document_name')

            _logger.info(f'[OCR Webhook] Received: tenant={tenant_code}, pages={ocr_pages}, doc={document_name}')

            # Get database registry
            db_name = request.httprequest.headers.get('X-Odoo-Database', 'ERP')

            # Use a new cursor for database operations
            registry = request.env.registry
            with registry.cursor() as cr:
                env = request.env(cr=cr)
                Tenant = env['vendor.ops.tenant'].sudo()

                # Normalize tenant code: ten_mkqzyn00 -> MKQZYN00
                subdomain = tenant_code
                if tenant_code.startswith('ten_'):
                    subdomain = tenant_code[4:].upper()

                # Search for tenant by subdomain or code
                tenant = Tenant.search([
                    '|',
                    ('subdomain', '=ilike', subdomain),
                    ('code', '=ilike', f'TEN-{subdomain}')
                ], limit=1)

                if not tenant:
                    _logger.error(f'[OCR Webhook] Tenant not found: {tenant_code} (subdomain={subdomain})')
                    return Response(
                        json.dumps({
                            'jsonrpc': '2.0',
                            'result': {'success': False, 'error': f'Tenant not found: {tenant_code}'},
                            'id': data.get('id')
                        }),
                        content_type='application/json',
                        status=404
                    )

                # Get values from Odoo 18 (source of truth)
                # If image_count is provided, use it directly (full sync from Odoo 18)
                # Otherwise, increment by ocr_pages (legacy mode)
                if 'image_count' in params:
                    # Full sync mode - Odoo 18 sends total counts
                    new_count = params.get('image_count', 0)
                    free_quota = params.get('free_quota', 30)
                    billable = params.get('billable_count', max(0, new_count - free_quota))
                    total_cost = params.get('total_cost', billable * 20)
                    year_month = params.get('year_month', '')
                else:
                    # Increment mode - legacy, add pages to existing count
                    new_count = tenant.ocr_image_count + ocr_pages
                    free_quota = 30  # Default free quota
                    billable = max(0, new_count - free_quota)
                    total_cost = billable * 20  # 20 JPY per image
                    year_month = ''

                # Update tenant record
                update_vals = {
                    'ocr_image_count': new_count,
                    'ocr_billable_count': billable,
                    'ocr_total_cost': total_cost,
                    'ocr_last_sync': fields.Datetime.now(),
                }
                if year_month:
                    update_vals['ocr_year_month'] = year_month

                tenant.write(update_vals)

                # Commit the transaction
                cr.commit()

                _logger.info(f'[OCR Webhook] Updated tenant {tenant.code}: count={new_count}, billable={billable}')

                return Response(
                    json.dumps({
                        'jsonrpc': '2.0',
                        'result': {
                            'success': True,
                            'data': {
                                'tenant_code': tenant.code,
                                'ocr_image_count': new_count,
                                'ocr_billable_count': billable,
                                'ocr_total_cost': total_cost,
                            }
                        },
                        'id': data.get('id')
                    }),
                    content_type='application/json',
                    status=200
                )

        except json.JSONDecodeError as e:
            _logger.error(f'[OCR Webhook] Invalid JSON: {e}')
            return Response(
                json.dumps({
                    'jsonrpc': '2.0',
                    'result': {'success': False, 'error': f'Invalid JSON: {str(e)}'},
                    'id': None
                }),
                content_type='application/json',
                status=400
            )
        except Exception as e:
            _logger.exception(f'[OCR Webhook] Error: {e}')
            return Response(
                json.dumps({
                    'jsonrpc': '2.0',
                    'result': {'success': False, 'error': str(e)},
                    'id': None
                }),
                content_type='application/json',
                status=500
            )

    @http.route('/api/ocr/webhook', type='http', auth='none', methods=['GET'], csrf=False)
    def ocr_webhook_health(self, **kwargs):
        """Health check endpoint"""
        return Response(
            json.dumps({
                'success': True,
                'message': 'OCR Webhook endpoint is active',
                'version': '1.0'
            }),
            content_type='application/json',
            status=200
        )
