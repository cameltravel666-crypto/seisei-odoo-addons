"""
OCR Processing Module - Uses Central OCR Service
Supports PDF and images via the central OCR service
Also supports direct Gemini API as fallback

Updated: Auto-detect tenant_id from Odoo database name
"""
import base64
import json
import logging
import os
import re
import requests
from typing import Dict, Any, List

_logger = logging.getLogger(__name__)

# Central OCR Service configuration
OCR_SERVICE_URL = os.getenv('OCR_SERVICE_URL', 'http://172.17.0.1:8180/api/v1')
OCR_SERVICE_KEY = os.getenv('OCR_SERVICE_KEY', '')

# Fallback to direct Gemini if no OCR service
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')

# Pricing configuration
PRICING = {
    'model': 'gemini-2.0-flash-exp',
    'free_quota': 30,
    'price_per_image': 20,
}

# Template fields for invoice OCR extraction
INVOICE_TEMPLATE_FIELDS = [
    'vendor_name',
    'vendor_address',
    'tax_id',
    'date',
    'invoice_number',
    'subtotal',
    'tax',
    'total',
    'is_tax_inclusive',
]

# Template fields for expense/receipt OCR extraction
EXPENSE_TEMPLATE_FIELDS = [
    'store_name',
    'vendor_name',
    'date',
    'receipt_number',
    'description',
    'category',
    'subtotal',
    'tax',
    'total_amount',
]

# OCR Prompt for invoice/purchase orders
INVOICE_OCR_PROMPT = '''あなたは請求書・納品書・レシートのOCR専門家です。
この画像から以下の情報を抽出してJSON形式で返してください：

{
  "vendor_name": "仕入先名/店舗名",
  "vendor_address": "住所（あれば）",
  "tax_id": "登録番号/インボイス番号（T+13桁、あれば）",
  "date": "YYYY-MM-DD形式の日付",
  "invoice_number": "請求書番号/レシート番号",
  "is_tax_inclusive": true,
  "line_items": [
    {
      "product_name": "商品名（日本語のまま）",
      "quantity": 数量,
      "unit": "単位",
      "unit_price": 単価,
      "amount": 金額,
      "tax_rate": 税率（8 または 10）
    }
  ],
  "subtotal": 税抜小計,
  "tax_8_amount": 8%対象の税額,
  "tax_10_amount": 10%対象の税額,
  "tax": 消費税合計,
  "total": 合計金額（税込総額）
}

重要な税率判定ルール：
- 「外8」「軽8」「*」「※」マークがある商品 → tax_rate: 8
- 「外10」「標10」マークがある商品 → tax_rate: 10
- 食品・飲料（酒類を除く）→ tax_rate: 8
- 日用品・雑貨・酒類 → tax_rate: 10
- 判別できない場合は tax_rate: 8 をデフォルトとする

JSONのみを返す（説明文不要）'''

# OCR Prompt for expense receipts
EXPENSE_OCR_PROMPT = '''あなたはレシート・領収書のOCR専門家です。
この画像から以下の情報を抽出してJSON形式で返してください：

{
  "store_name": "店舗名",
  "vendor_name": "仕入先名/会社名",
  "date": "YYYY-MM-DD形式の日付",
  "receipt_number": "レシート番号",
  "description": "摘要/内容",
  "category": "経費カテゴリ",
  "subtotal": 税抜小計,
  "tax": 消費税,
  "total_amount": 合計金額
}

JSONのみを返す（説明文不要）'''


def get_tenant_id_from_env():
    """Get tenant_id from Odoo database name or environment

    Database names are like: ten_mkqzyn00
    Subdomain (tenant_id for OCR service) should be: mkqzyn00
    """
    try:
        # Try to get from Odoo environment
        from odoo import api, SUPERUSER_ID
        from odoo.tools import config

        db_name = config.get('db_name') or os.getenv('PGDATABASE', '')
        if db_name:
            # Extract subdomain from db name: ten_mkqzyn00 -> mkqzyn00
            if db_name.startswith('ten_'):
                return db_name[4:]  # Remove 'ten_' prefix
            return db_name
    except Exception as e:
        _logger.debug(f'Could not get tenant from Odoo config: {e}')

    # Fallback to environment variable
    return os.getenv('TENANT_ID', 'default')


def process_document(file_data: bytes, mimetype: str, tenant_id: str = None) -> Dict[str, Any]:
    """Process invoice document (image or PDF)

    Args:
        file_data: Raw file bytes
        mimetype: MIME type of file
        tenant_id: Optional tenant ID (auto-detected if not provided)
    """
    if not tenant_id:
        tenant_id = get_tenant_id_from_env()
    return _process_with_template(file_data, mimetype, tenant_id, 'invoice')


def process_expense_document(file_data: bytes, mimetype: str, tenant_id: str = None) -> Dict[str, Any]:
    """Process expense/receipt document (image or PDF)

    Args:
        file_data: Raw file bytes
        mimetype: MIME type of file
        tenant_id: Optional tenant ID (auto-detected if not provided)
    """
    if not tenant_id:
        tenant_id = get_tenant_id_from_env()
    return _process_with_template(file_data, mimetype, tenant_id, 'expense')


def _process_with_template(file_data: bytes, mimetype: str, tenant_id: str, doc_type: str) -> Dict[str, Any]:
    """Process document with specific document type"""
    _logger.info(f'[OCR] Processing {doc_type} for tenant: {tenant_id}')

    # Try central OCR service first
    if OCR_SERVICE_URL:
        template_fields = EXPENSE_TEMPLATE_FIELDS if doc_type == 'expense' else INVOICE_TEMPLATE_FIELDS
        result = _call_ocr_service(file_data, mimetype, tenant_id, template_fields)
        if result.get('success'):
            return result
        _logger.warning(f'[OCR] Central service failed: {result.get("error")}, trying direct Gemini')

    # Handle PDF
    if mimetype == 'application/pdf':
        try:
            images = pdf_to_images(file_data)
        except Exception as e:
            return {'success': False, 'error': f'PDF conversion failed: {e}'}

        if not images:
            return {'success': False, 'error': 'PDF has no pages'}

        # Process first page only for now
        return _process_image_direct(images[0], 'image/jpeg', doc_type)

    # Handle image
    return _process_image_direct(file_data, mimetype, doc_type)


def _call_ocr_service(file_data: bytes, mimetype: str, tenant_id: str,
                      template_fields: List[str]) -> Dict[str, Any]:
    """Call central OCR service"""
    try:
        b64_data = base64.standard_b64encode(file_data).decode('utf-8')

        headers = {'Content-Type': 'application/json'}
        if OCR_SERVICE_KEY:
            headers['X-Service-Key'] = OCR_SERVICE_KEY

        payload = {
            'image_data': b64_data,
            'mime_type': mimetype,
            'template_fields': template_fields,
            'tenant_id': tenant_id,
        }

        _logger.info(f'[OCR] Calling OCR service for tenant {tenant_id}')

        response = requests.post(
            f'{OCR_SERVICE_URL}/ocr/process',
            json=payload,
            headers=headers,
            timeout=120
        )

        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                # Parse extracted data
                extracted = data.get('extracted', {})
                # Support both 'line_items' and 'lines' field names
                line_items = extracted.get('line_items') or extracted.get('lines', [])

                # Add usage info to result
                usage = data.get('usage', {})

                _logger.info(f'[OCR] Success: {len(line_items)} items, usage: {usage}')

                return {
                    'success': True,
                    'extracted': extracted,
                    'line_items': line_items,
                    'raw_response': data.get('raw_response', ''),
                    'pages': 1,
                    'usage': usage,
                }
            else:
                return {'success': False, 'error': data.get('error_code', 'Unknown error')}
        else:
            _logger.error(f'[OCR] Service returned {response.status_code}: {response.text[:200]}')
            return {'success': False, 'error': f'Service error: {response.status_code}'}

    except requests.exceptions.Timeout:
        return {'success': False, 'error': 'Service timeout'}
    except Exception as e:
        _logger.exception(f'[OCR] Service call failed: {e}')
        return {'success': False, 'error': str(e)}


def _process_image_direct(file_data: bytes, mimetype: str, doc_type: str) -> Dict[str, Any]:
    """Process image directly with Gemini API (fallback)"""
    if not GEMINI_API_KEY:
        return {'success': False, 'error': 'No OCR service or Gemini API key configured'}

    try:
        b64_data = base64.standard_b64encode(file_data).decode('utf-8')

        prompt = EXPENSE_OCR_PROMPT if doc_type == 'expense' else INVOICE_OCR_PROMPT

        url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={GEMINI_API_KEY}'

        payload = {
            'contents': [{
                'parts': [
                    {'inline_data': {'mime_type': mimetype, 'data': b64_data}},
                    {'text': prompt}
                ]
            }],
            'generationConfig': {
                'temperature': 0.1,
                'maxOutputTokens': 4096,
            }
        }

        response = requests.post(url, json=payload, headers={'Content-Type': 'application/json'}, timeout=90)

        if response.status_code == 200:
            result = response.json()
            candidates = result.get('candidates', [])
            if candidates:
                content = candidates[0].get('content', {})
                parts = content.get('parts', [])
                if parts:
                    raw_text = parts[0].get('text', '')
                    extracted = _extract_json_from_text(raw_text)
                    # Support both 'line_items' and 'lines' field names
                    line_items = extracted.get('line_items') or extracted.get('lines', [])

                    return {
                        'success': True,
                        'extracted': extracted,
                        'line_items': line_items,
                        'raw_response': raw_text,
                        'pages': 1,
                    }

        return {'success': False, 'error': 'Gemini processing failed'}

    except Exception as e:
        _logger.exception(f'[OCR] Direct Gemini failed: {e}')
        return {'success': False, 'error': str(e)}


def _extract_json_from_text(text: str) -> dict:
    """Extract JSON from text response"""
    # Try markdown code block
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Try raw JSON
    try:
        start = text.find('{')
        end = text.rfind('}') + 1
        if start != -1 and end > start:
            return json.loads(text[start:end])
    except json.JSONDecodeError:
        pass

    return {'raw_text': text}


def pdf_to_images(pdf_data: bytes) -> List[bytes]:
    """Convert PDF to images using pdf2image"""
    try:
        from pdf2image import convert_from_bytes
        import io

        images = convert_from_bytes(pdf_data, dpi=200, first_page=1, last_page=5)

        result = []
        for img in images:
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=90)
            result.append(buf.getvalue())

        return result
    except ImportError:
        _logger.warning('[OCR] pdf2image not installed, PDF support disabled')
        return []
    except Exception as e:
        _logger.exception(f'[OCR] PDF conversion failed: {e}')
        return []
