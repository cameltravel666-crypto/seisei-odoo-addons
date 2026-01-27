# -*- coding: utf-8 -*-
"""
Public OCR Demo API - No authentication required
For https://biznexus.seisei.tokyo/try-ocr

Rate limited to prevent abuse.
"""
import base64
import json
import logging
import time
from collections import defaultdict
from threading import Lock

from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)

# Simple in-memory rate limiter
# In production, consider using Redis for distributed rate limiting
_rate_limit_store = defaultdict(list)
_rate_limit_lock = Lock()

# Rate limit: 10 requests per minute per IP
RATE_LIMIT_REQUESTS = 10
RATE_LIMIT_WINDOW = 60  # seconds

# Max file size: 10MB
MAX_FILE_SIZE = 10 * 1024 * 1024


def _check_rate_limit(ip: str) -> bool:
    """Check if IP is rate limited. Returns True if allowed, False if limited."""
    now = time.time()
    with _rate_limit_lock:
        # Clean old entries
        _rate_limit_store[ip] = [t for t in _rate_limit_store[ip] if now - t < RATE_LIMIT_WINDOW]

        if len(_rate_limit_store[ip]) >= RATE_LIMIT_REQUESTS:
            return False

        _rate_limit_store[ip].append(now)
        return True


def _get_client_ip():
    """Get client IP, considering proxy headers."""
    # Check X-Forwarded-For header (set by Traefik/nginx)
    forwarded_for = request.httprequest.headers.get('X-Forwarded-For')
    if forwarded_for:
        # Take the first IP in the chain (original client)
        return forwarded_for.split(',')[0].strip()

    # Check X-Real-IP header
    real_ip = request.httprequest.headers.get('X-Real-IP')
    if real_ip:
        return real_ip

    # Fallback to remote_addr
    return request.httprequest.remote_addr


class PublicOcrDemoController(http.Controller):
    """Public OCR Demo API Controller"""

    @http.route('/api/ocr/demo/process', type='http', auth='none', methods=['POST'], csrf=False, cors='*')
    def process_demo(self, **kwargs):
        """
        Public OCR processing endpoint for demo purposes.

        Accepts multipart/form-data with:
        - file: Image or PDF file to process
        - doc_type: 'invoice' or 'expense' (default: 'invoice')

        Returns JSON:
        {
            "success": true/false,
            "extracted": { ... },
            "line_items": [ ... ],
            "error": "..." (if failed)
        }
        """
        # Check rate limit
        client_ip = _get_client_ip()
        if not _check_rate_limit(client_ip):
            _logger.warning(f"[OCR Demo] Rate limit exceeded for IP: {client_ip}")
            return Response(
                json.dumps({
                    'success': False,
                    'error': 'Rate limit exceeded. Please wait a moment before trying again.',
                    'error_ja': 'リクエスト制限を超えました。しばらくしてから再度お試しください。'
                }),
                content_type='application/json',
                status=429,
                headers={'Access-Control-Allow-Origin': '*'}
            )

        try:
            # Get uploaded file
            file = request.httprequest.files.get('file')
            if not file:
                return Response(
                    json.dumps({
                        'success': False,
                        'error': 'No file provided',
                        'error_ja': 'ファイルが指定されていません'
                    }),
                    content_type='application/json',
                    status=400,
                    headers={'Access-Control-Allow-Origin': '*'}
                )

            # Check file size
            file.seek(0, 2)  # Seek to end
            file_size = file.tell()
            file.seek(0)  # Reset to beginning

            if file_size > MAX_FILE_SIZE:
                return Response(
                    json.dumps({
                        'success': False,
                        'error': f'File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB',
                        'error_ja': f'ファイルサイズが大きすぎます。最大サイズは{MAX_FILE_SIZE // (1024*1024)}MBです'
                    }),
                    content_type='application/json',
                    status=400,
                    headers={'Access-Control-Allow-Origin': '*'}
                )

            # Read file data
            file_data = file.read()
            mimetype = file.content_type or 'image/jpeg'

            # Validate mimetype
            allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
            if mimetype not in allowed_types:
                return Response(
                    json.dumps({
                        'success': False,
                        'error': f'Unsupported file type: {mimetype}',
                        'error_ja': f'サポートされていないファイル形式です: {mimetype}'
                    }),
                    content_type='application/json',
                    status=400,
                    headers={'Access-Control-Allow-Origin': '*'}
                )

            # Get document type
            doc_type = kwargs.get('doc_type', 'invoice')
            if doc_type not in ['invoice', 'expense']:
                doc_type = 'invoice'

            # Import OCR processing function
            from ..models.llm_ocr import process_document, process_expense_document

            _logger.info(f"[OCR Demo] Processing {doc_type} from IP: {client_ip}, size: {file_size} bytes")

            # Process document
            if doc_type == 'expense':
                result = process_expense_document(file_data, mimetype, tenant_id='demo')
            else:
                result = process_document(file_data, mimetype, tenant_id='demo')

            if result.get('success'):
                _logger.info(f"[OCR Demo] Success for IP: {client_ip}")
                return Response(
                    json.dumps({
                        'success': True,
                        'extracted': result.get('extracted', {}),
                        'line_items': result.get('line_items', []),
                    }, ensure_ascii=False),
                    content_type='application/json',
                    status=200,
                    headers={'Access-Control-Allow-Origin': '*'}
                )
            else:
                _logger.warning(f"[OCR Demo] Failed for IP: {client_ip}: {result.get('error')}")
                return Response(
                    json.dumps({
                        'success': False,
                        'error': result.get('error', 'OCR processing failed'),
                        'error_ja': result.get('error', 'OCR処理に失敗しました')
                    }, ensure_ascii=False),
                    content_type='application/json',
                    status=500,
                    headers={'Access-Control-Allow-Origin': '*'}
                )

        except Exception as e:
            _logger.exception(f"[OCR Demo] Error processing request: {e}")
            return Response(
                json.dumps({
                    'success': False,
                    'error': 'Internal server error',
                    'error_ja': '内部エラーが発生しました'
                }),
                content_type='application/json',
                status=500,
                headers={'Access-Control-Allow-Origin': '*'}
            )

    @http.route('/api/ocr/demo/process', type='http', auth='none', methods=['OPTIONS'], csrf=False)
    def process_demo_options(self, **kwargs):
        """Handle CORS preflight request"""
        return Response(
            '',
            status=200,
            headers={
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
                'Access-Control-Max-Age': '86400',
            }
        )

    @http.route('/api/ocr/demo/health', type='http', auth='none', methods=['GET'], csrf=False, cors='*')
    def health_check(self, **kwargs):
        """Health check endpoint for the demo API"""
        return Response(
            json.dumps({
                'status': 'ok',
                'service': 'Odoo OCR Demo API',
                'rate_limit': f'{RATE_LIMIT_REQUESTS} requests per {RATE_LIMIT_WINDOW} seconds'
            }),
            content_type='application/json',
            status=200,
            headers={'Access-Control-Allow-Origin': '*'}
        )
