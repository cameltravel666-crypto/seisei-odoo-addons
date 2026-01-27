"""
OCR Processing Module - Central OCR Service Only
All OCR processing is handled by the central OCR service.
API keys and technical details are not exposed to Odoo instances.
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
# All OCR processing is handled by the central service - no direct API calls
OCR_SERVICE_URL = os.getenv('OCR_SERVICE_URL', 'http://172.17.0.1:8180/api/v1')
OCR_SERVICE_KEY = os.getenv('OCR_SERVICE_KEY', '')

# Pricing configuration
PRICING = {
    'model': 'gemini-2.0-flash-exp',
    'free_quota': 50,
    'price_per_image': 20,
}

# Template fields for invoice OCR extraction
INVOICE_TEMPLATE_FIELDS = [
    'vendor_name/仕入先名',
    'vendor_address/住所',
    'tax_id/登録番号',
    'date/日付',
    'invoice_number/請求書番号',
    'subtotal/小計',
    'tax/消費税',
    'total/合計金額',
    'is_tax_inclusive/税込み',
]

# Template fields for expense/receipt OCR extraction
EXPENSE_TEMPLATE_FIELDS = [
    'store_name/店舗名',
    'vendor_name/仕入先名',
    'date/日付',
    'receipt_number/レシート番号',
    'description/摘要',
    'category/カテゴリ',
    'subtotal/小計',
    'tax/消費税',
    'total_amount/合計金額',
]

# OCR Prompt for invoice/purchase orders
# Important: Default tax_rate to 8% when uncertain (most items in Japan supermarkets are food = 8%)
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
      "quantity": 数量（数値）,
      "unit": "単位",
      "unit_price": 単価（数値）,
      "amount": 金額（数値）,
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
- 判別できない場合は tax_rate: 8 をデフォルトとする（日本のスーパーは食品が多いため）

税額の検証：
- tax_8_amount と tax_10_amount を正確に抽出
- tax = tax_8_amount + tax_10_amount であること
- スーパーのレシートは基本的に is_tax_inclusive: true（税込表示）

JSONのみを返す（説明文不要）'''

# OCR Prompt for expense receipts
EXPENSE_OCR_PROMPT = '''あなたはレシート・領収書のOCR専門家です。
この画像から以下の情報を抽出してJSON形式で返してください：

{
  "store_name": "店舗名/仕入先名",
  "vendor_name": "会社名（あれば）",
  "date": "YYYY-MM-DD形式の日付",
  "receipt_number": "レシート番号/領収書番号（あれば）",
  "description": "購入内容の要約（例：コーヒー、文房具、交通費など）",
  "category": "経費カテゴリ（交通費、飲食費、消耗品費など）",
  "subtotal": 税抜金額,
  "tax": 消費税額,
  "total_amount": 合計金額（税込総額/領収金額）
}

JSONのみを返す（説明文不要）'''


def pdf_to_images(pdf_data: bytes, dpi: int = 150) -> List[bytes]:
    """Convert PDF to images using PyMuPDF"""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        _logger.error('[OCR] PyMuPDF not installed')
        raise ImportError('PyMuPDF required. Install: pip install PyMuPDF')

    images = []

    try:
        pdf_doc = fitz.open(stream=pdf_data, filetype='pdf')

        for page_num in range(len(pdf_doc)):
            page = pdf_doc[page_num]
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes('jpeg')
            images.append(img_data)
            _logger.info(f'[OCR] PDF page {page_num + 1}/{len(pdf_doc)} converted')

        pdf_doc.close()

    except Exception as e:
        _logger.exception(f'[OCR] PDF conversion error: {e}')
        raise

    return images


def process_document(file_data: bytes, mimetype: str, tenant_id: str = 'default') -> Dict[str, Any]:
    """Process invoice document (image or PDF)"""
    return _process_with_template(file_data, mimetype, tenant_id, 'invoice')


def process_expense_document(file_data: bytes, mimetype: str, tenant_id: str = 'default') -> Dict[str, Any]:
    """Process expense/receipt document (image or PDF)"""
    return _process_with_template(file_data, mimetype, tenant_id, 'expense')


def _process_with_template(file_data: bytes, mimetype: str, tenant_id: str, doc_type: str) -> Dict[str, Any]:
    """Process document with specific document type

    All OCR processing is handled by the central OCR service.
    No direct API calls are made from this module.
    """
    if not OCR_SERVICE_URL:
        _logger.error('[OCR] OCR_SERVICE_URL not configured')
        return {'success': False, 'error': 'OCRサービスが利用できません。システム管理者にお問い合わせください。'}

    template_fields = EXPENSE_TEMPLATE_FIELDS if doc_type == 'expense' else INVOICE_TEMPLATE_FIELDS
    result = _call_ocr_service(file_data, mimetype, tenant_id, template_fields)

    if result.get('success'):
        return result

    # Return user-friendly error without exposing technical details
    error_code = result.get('error', '')
    _logger.error(f'[OCR] Service error: {error_code}')

    # Map technical errors to user-friendly messages
    if 'timeout' in error_code.lower():
        return {'success': False, 'error': 'OCR処理がタイムアウトしました。しばらくしてから再度お試しください。'}
    elif '503' in error_code or '502' in error_code:
        return {'success': False, 'error': 'OCRサービスが一時的に利用できません。しばらくしてから再度お試しください。'}
    elif '401' in error_code or '403' in error_code:
        return {'success': False, 'error': 'OCRサービスの認証に失敗しました。システム管理者にお問い合わせください。'}
    else:
        return {'success': False, 'error': 'OCR処理に失敗しました。しばらくしてから再度お試しください。'}


def _parse_tax_rate(tax_rate_str) -> int:
    """Parse tax rate from various formats to integer.

    Handles: "8%", "10%", 8, 10, 0.08, 0.10, "exempt"
    Returns: integer tax rate (8, 10, 0)
    """
    if tax_rate_str is None:
        return 8  # Default to 8% for food items

    if tax_rate_str == 'exempt':
        return 0

    if isinstance(tax_rate_str, str):
        # Remove % and whitespace
        tax_rate_str = tax_rate_str.replace('%', '').strip()

    try:
        rate = float(tax_rate_str)
        # If decimal format (0.08), convert to percentage
        if rate < 1:
            return int(rate * 100)
        return int(rate)
    except (ValueError, TypeError):
        return 8  # Default


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

        response = requests.post(
            f'{OCR_SERVICE_URL}/ocr/process',
            json=payload,
            headers=headers,
            timeout=120
        )

        if response.status_code != 200:
            return {'success': False, 'error': f'OCR service error: {response.status_code}'}

        result = response.json()

        if result.get('success'):
            extracted = result.get('extracted', {})
            _logger.info(f'[OCR] Extracted keys: {list(extracted.keys())}')

            # Try to normalize the extracted data
            try:
                normalized = _normalize_extracted(extracted)
                _logger.info(f'[OCR] Normalized keys: {list(normalized.keys())}')
            except Exception as e:
                _logger.exception(f'[OCR] Normalization failed: {e}')
                normalized = extracted

            # Get line_items from normalized data (handles both old and new format)
            line_items = normalized.get('line_items', [])

            # Multiple fallbacks for line_items
            if not line_items:
                line_items = extracted.get('line_items', [])
            if not line_items:
                # Support new format with 'lines' field
                lines = extracted.get('lines', [])
                if lines:
                    _logger.info(f'[OCR] Found {len(lines)} lines in extracted, converting to line_items')
                    line_items = []
                    for line in lines:
                        item = {
                            'product_name': line.get('name', ''),
                            'quantity': line.get('qty') or 1,
                            'unit_price': line.get('unit_price'),
                            'amount': line.get('gross_amount') or line.get('net_amount'),
                            'tax_rate': _parse_tax_rate(line.get('tax_rate', '8%')),
                            'suggested_account': line.get('suggested_account'),
                        }
                        line_items.append(item)

            _logger.info(f'[OCR] Final line_items count: {len(line_items)}')

            return {
                'success': True,
                'extracted': normalized,
                'line_items': line_items,
                'raw_response': result.get('raw_response', ''),
                'pages': 1,
            }
        else:
            return {'success': False, 'error': result.get('error_code', 'Unknown error')}

    except requests.exceptions.Timeout:
        return {'success': False, 'error': 'OCR service timeout'}
    except Exception as e:
        _logger.exception(f'[OCR] Service call error: {e}')
        return {'success': False, 'error': str(e)}


def _normalize_extracted(extracted: dict) -> dict:
    """Normalize extracted data from OCR.

    Handles both old format (flat structure) and new format (nested issuer/document/lines).
    """
    # Check if this is the new unified prompt format
    if 'issuer' in extracted or 'document' in extracted or 'lines' in extracted:
        return _normalize_new_format(extracted)

    # Old format - use legacy key mapping
    key_mapping = {
        'vendor_name': ['vendor_name_仕入先名', 'vendor_name', '仕入先名', 'vendor', 'store_name_店舗名', 'store_name', '店舗名'],
        'vendor_address': ['vendor_address_住所', 'vendor_address', '住所', 'address'],
        'tax_id': ['tax_id_登録番号', 'tax_id', '登録番号', 'registration_number'],
        'date': ['date_日付', 'date', '日付'],
        'invoice_number': ['invoice_number_請求書番号', 'invoice_number', '請求書番号', 'receipt_number_レシート番号', 'receipt_number', 'レシート番号'],
        'subtotal': ['subtotal_小計', 'subtotal', '小計'],
        'tax': ['tax_消費税', 'tax', '消費税', '内消費税'],
        'total': ['total_合計金額', 'total', '合計金額', '領収金額', 'total_amount_合計金額', 'total_amount'],
        'total_amount': ['total_amount_合計金額', 'total_amount', 'total_合計金額', 'total', '合計金額'],
        'is_tax_inclusive': ['is_tax_inclusive_税込み', 'is_tax_inclusive', '税込み'],
        'description': ['description_摘要', 'description', '摘要', 'memo'],
        'category': ['category_カテゴリ', 'category', 'カテゴリ'],
        'store_name': ['store_name_店舗名', 'store_name', '店舗名'],
    }

    normalized = {}
    for target_key, source_keys in key_mapping.items():
        for source_key in source_keys:
            if source_key in extracted and extracted[source_key]:
                normalized[target_key] = extracted[source_key]
                break

    # Copy remaining fields
    for key, value in extracted.items():
        if key not in normalized and not any(key in sources for sources in key_mapping.values()):
            normalized[key] = value

    return normalized


def _normalize_new_format(extracted: dict) -> dict:
    """Normalize new unified OCR format to Odoo-expected format.

    New format structure:
    {
        "issuer": {"issuer_name": "...", "invoice_reg_no": "...", ...},
        "document": {"doc_type": "...", "doc_date": "...", "category": "..."},
        "lines": [{"name": "...", "gross_amount": ..., "tax_rate": "10%", ...}],
        "totals_on_doc": {"total_gross": ..., "total_tax": ...}
    }

    Converts to Odoo format:
    {
        "vendor_name": "...",
        "tax_id": "...",
        "date": "...",
        "total": ...,
        "line_items": [{"product_name": "...", "amount": ..., "tax_rate": 10, ...}]
    }
    """
    normalized = {}

    # Extract issuer info
    issuer = extracted.get('issuer', {})
    if issuer:
        normalized['vendor_name'] = issuer.get('issuer_name')
        normalized['vendor_address'] = issuer.get('issuer_address')
        # Convert invoice_reg_no (T1234...) to tax_id format
        reg_no = issuer.get('invoice_reg_no', '')
        if reg_no and reg_no != '0000000000000':
            normalized['tax_id'] = reg_no if reg_no.startswith('T') else f'T{reg_no}'
        normalized['issuer_tel'] = issuer.get('issuer_tel')

    # Extract document info
    document = extracted.get('document', {})
    if document:
        normalized['date'] = document.get('doc_date')
        normalized['doc_type'] = document.get('doc_type')
        normalized['category'] = document.get('category')

    # Extract totals
    totals = extracted.get('totals_on_doc', {})
    if totals:
        normalized['total'] = totals.get('total_gross')
        normalized['tax'] = totals.get('total_tax')
        # Calculate subtotal if not available
        if totals.get('total_gross') and totals.get('total_tax'):
            try:
                normalized['subtotal'] = totals['total_gross'] - totals['total_tax']
            except (TypeError, ValueError):
                pass

    # Convert lines to line_items format
    lines = extracted.get('lines', [])
    line_items = []
    for line in lines:
        item = {}
        item['product_name'] = line.get('name', '')
        item['quantity'] = line.get('qty', 1) or 1
        item['unit_price'] = line.get('unit_price')

        # Use gross_amount as primary amount (tax-inclusive)
        amount = line.get('gross_amount') or line.get('net_amount')
        item['amount'] = amount

        # Convert tax_rate string to number: "10%" -> 10, "8%" -> 8, "exempt" -> 0
        tax_rate_str = line.get('tax_rate', '10%')
        if tax_rate_str == 'exempt':
            item['tax_rate'] = 0
        elif isinstance(tax_rate_str, str):
            # Extract number from "10%" or "8%"
            tax_num = re.sub(r'[^\d]', '', tax_rate_str)
            item['tax_rate'] = int(tax_num) if tax_num else 10
        else:
            item['tax_rate'] = tax_rate_str or 10

        # Include suggested account for reference
        item['suggested_account'] = line.get('suggested_account')

        line_items.append(item)

    normalized['line_items'] = line_items

    # Determine is_tax_inclusive by comparing line totals with document totals
    # If sum of line amounts ≈ total_gross, lines are tax-inclusive
    # If sum of line amounts ≈ total_gross - total_tax (subtotal), lines are tax-exclusive
    is_tax_inclusive = True  # Default assumption

    totals = extracted.get('totals_on_doc', {})
    total_gross = totals.get('total_gross')
    total_tax = totals.get('total_tax')

    if line_items and total_gross:
        line_sum = sum(item.get('amount') or 0 for item in line_items)
        if line_sum > 0:
            # Check if line sum matches total_gross (tax-inclusive) or subtotal (tax-exclusive)
            tolerance = 5  # Allow small rounding differences
            subtotal = total_gross - (total_tax or 0)

            if abs(line_sum - total_gross) <= tolerance:
                is_tax_inclusive = True
                _logger.info(f'[OCR] Detected tax-inclusive: line_sum={line_sum} ≈ total_gross={total_gross}')
            elif abs(line_sum - subtotal) <= tolerance:
                is_tax_inclusive = False
                _logger.info(f'[OCR] Detected tax-exclusive: line_sum={line_sum} ≈ subtotal={subtotal}')
            else:
                # Fallback: check by_rate.net if available
                by_rate = totals.get('by_rate', {})
                net_8 = by_rate.get('8%', {}).get('net') or 0
                net_10 = by_rate.get('10%', {}).get('net') or 0
                net_total = net_8 + net_10
                if net_total > 0 and abs(line_sum - net_total) <= tolerance:
                    is_tax_inclusive = False
                    _logger.info(f'[OCR] Detected tax-exclusive via by_rate: line_sum={line_sum} ≈ net_total={net_total}')

    normalized['is_tax_inclusive'] = is_tax_inclusive

    # Keep original data for reference
    normalized['_original'] = extracted

    _logger.info(f'[OCR] Normalized new format: vendor={normalized.get("vendor_name")}, '
                 f'lines={len(line_items)}, total={normalized.get("total")}')

    return normalized


def _extract_json(text: str) -> dict:
    """Extract JSON from text response"""
    # Try code block first
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


def get_pricing():
    """Get pricing information"""
    return PRICING.copy()
