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
# Note: Read at function call time to avoid caching issues with module imports
def _get_ocr_config():
    """Get OCR service configuration at runtime to avoid caching issues."""
    return {
        'url': os.getenv('OCR_SERVICE_URL', 'http://172.17.0.1:8180/api/v1'),
        'key': os.getenv('OCR_SERVICE_KEY', ''),
    }

# Legacy module-level variables for backwards compatibility
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

# Template fields for bank statement OCR extraction
BANK_STATEMENT_TEMPLATE_FIELDS = [
    'bank_name/銀行名',
    'branch_name/支店名',
    'account_type/口座種類',
    'account_number/口座番号',
    'account_holder/口座名義',
    'statement_period/対象期間',
    'balance_start/期首残高',
    'balance_end/期末残高',
    'transactions/取引明細',
]

# OCR Prompt for bank statements (通帳/取引明細書)
BANK_STATEMENT_OCR_PROMPT = '''あなたは日本の銀行取引明細書（通帳記入・取引明細表）の読み取り専門AIです。
画像から以下の情報をJSON形式で正確に抽出してください。

出力フォーマット（JSON only, no markdown）:
{
  "bank_name": "銀行名（例：三菱UFJ銀行）",
  "branch_name": "支店名（例：新宿支店）",
  "account_type": "普通 or 当座",
  "account_number": "口座番号",
  "account_holder": "口座名義人",
  "statement_period": "対象期間（例：2024/01/01〜2024/01/31）",
  "balance_start": 期首残高（数値、カンマなし）,
  "balance_end": 期末残高（数値、カンマなし）,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "摘要/適要（振込人名、引落先など原文のまま）",
      "withdrawal": 出金額（数値、0なら0）,
      "deposit": 入金額（数値、0なら0）,
      "balance": 取引後残高（数値、あれば）,
      "reference": "取引番号/整理番号（あれば、なければ空文字）"
    }
  ]
}

注意事項：
- 和暦（令和/平成）は西暦に変換してYYYY-MM-DD形式で返す
- 金額のカンマ（,）は除去して数値で返す
- 摘要は原文のまま（略称もそのまま）
- 入金はdeposit、出金はwithdrawal（両方0はありえない）
- 残高(balance)は可能な限り抽出、不明ならnull
- referenceが読み取れない場合は空文字
- balance_startは最初の取引前の残高、balance_endは最後の取引後の残高
- 全ての取引を時系列順に出力

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


def process_bank_statement(file_data: bytes, mimetype: str, tenant_id: str = 'default') -> Dict[str, Any]:
    """Process bank statement document (image or multi-page PDF).

    For multi-page PDFs: each page is OCR'd separately, results are merged,
    and duplicate transactions are removed.

    Returns:
        Dict with keys: success, extracted (bank_name, transactions[], etc.), pages
    """
    config = _get_ocr_config()
    if not config['url']:
        return {'success': False, 'error': 'OCRサービスが利用できません。'}

    # Convert PDF to images if needed
    is_pdf = mimetype == 'application/pdf' or (
        isinstance(file_data, bytes) and file_data[:5] == b'%PDF-'
    )

    if is_pdf:
        try:
            page_images = pdf_to_images(file_data)
        except Exception as e:
            _logger.exception(f'[OCR-BankStmt] PDF conversion failed: {e}')
            return {'success': False, 'error': f'PDF変換エラー: {e}'}
    else:
        page_images = [file_data]

    all_transactions = []
    first_page_header = {}
    last_page_header = {}
    errors = []

    for i, img_data in enumerate(page_images):
        _logger.info(f'[OCR-BankStmt] Processing page {i + 1}/{len(page_images)}')
        result = _call_ocr_service_raw(
            img_data, 'image/jpeg' if is_pdf else mimetype,
            tenant_id, BANK_STATEMENT_TEMPLATE_FIELDS, 'bank_statement',
        )
        if result.get('success'):
            extracted = result.get('extracted', {})
            txns = extracted.get('transactions', [])
            all_transactions.extend(txns)
            if i == 0:
                first_page_header = extracted
            last_page_header = extracted
        else:
            errors.append(f'Page {i + 1}: {result.get("error", "unknown")}')

    if not all_transactions and errors:
        return {'success': False, 'error': '; '.join(errors)}

    # Merge: header from first page, balance_end from last page
    merged = {
        'bank_name': first_page_header.get('bank_name', ''),
        'branch_name': first_page_header.get('branch_name', ''),
        'account_type': first_page_header.get('account_type', ''),
        'account_number': first_page_header.get('account_number', ''),
        'account_holder': first_page_header.get('account_holder', ''),
        'statement_period': first_page_header.get('statement_period', ''),
        'balance_start': first_page_header.get('balance_start', 0),
        'balance_end': last_page_header.get('balance_end', 0),
        'transactions': _deduplicate_bank_transactions(all_transactions),
    }

    return {
        'success': True,
        'extracted': merged,
        'pages': len(page_images),
    }


def _deduplicate_bank_transactions(transactions: list) -> list:
    """Remove duplicate transactions based on (date, description, withdrawal, deposit)."""
    seen = set()
    unique = []
    for txn in transactions:
        key = (
            txn.get('date', ''),
            txn.get('description', ''),
            txn.get('withdrawal', 0),
            txn.get('deposit', 0),
        )
        if key not in seen:
            seen.add(key)
            unique.append(txn)
    return unique


def _call_ocr_service_raw(file_data: bytes, mimetype: str, tenant_id: str,
                          template_fields: List[str], output_level: str = 'accounting') -> Dict[str, Any]:
    """Call OCR service and return raw extracted data without invoice-specific normalization."""
    try:
        config = _get_ocr_config()
        ocr_url = config['url']
        ocr_key = config['key']

        b64_data = base64.standard_b64encode(file_data).decode('utf-8')

        headers = {'Content-Type': 'application/json'}
        if ocr_key:
            headers['X-Service-Key'] = ocr_key

        payload = {
            'image_data': b64_data,
            'mime_type': mimetype,
            'template_fields': template_fields,
            'tenant_id': tenant_id,
            'output_level': output_level,
        }

        response = requests.post(
            f'{ocr_url}/ocr/process',
            json=payload,
            headers=headers,
            timeout=120,
        )

        if response.status_code != 200:
            body = response.text[:500] if response.text else 'no body'
            _logger.error(f'[OCR] HTTP {response.status_code}: {body}')
            return {'success': False, 'error': f'OCR service error {response.status_code}: {body}'}

        result = response.json()
        if result.get('success'):
            return {
                'success': True,
                'extracted': result.get('extracted', {}),
                'raw_response': result.get('raw_response', ''),
            }
        else:
            return {'success': False, 'error': result.get('error_code', 'Unknown error')}

    except requests.exceptions.Timeout:
        return {'success': False, 'error': 'OCR service timeout'}
    except Exception as e:
        _logger.exception(f'[OCR-BankStmt] Service call error: {e}')
        return {'success': False, 'error': str(e)}


def _process_with_template(file_data: bytes, mimetype: str, tenant_id: str, doc_type: str, output_level: str = 'accounting') -> Dict[str, Any]:
    """Process document with specific document type

    All OCR processing is handled by the central OCR service.
    No direct API calls are made from this module.

    Args:
        output_level: 'summary' (quick preview, partial items) or 'accounting' (full line-by-line extraction)
    """
    # Check config at runtime
    config = _get_ocr_config()
    if not config['url']:
        _logger.error('[OCR] OCR_SERVICE_URL not configured')
        return {'success': False, 'error': 'OCRサービスが利用できません。システム管理者にお問い合わせください。'}

    template_fields = EXPENSE_TEMPLATE_FIELDS if doc_type == 'expense' else INVOICE_TEMPLATE_FIELDS
    result = _call_ocr_service(file_data, mimetype, tenant_id, template_fields, output_level)

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
                      template_fields: List[str], output_level: str = 'accounting') -> Dict[str, Any]:
    """Call central OCR service

    Args:
        output_level: 'summary' (quick preview) or 'accounting' (full line-by-line)
    """
    try:
        # Get config at runtime to avoid caching issues
        config = _get_ocr_config()
        ocr_url = config['url']
        ocr_key = config['key']

        _logger.info(f'[OCR] Calling service at {ocr_url}, output_level={output_level}, key present: {bool(ocr_key)}')

        b64_data = base64.standard_b64encode(file_data).decode('utf-8')

        headers = {'Content-Type': 'application/json'}
        if ocr_key:
            headers['X-Service-Key'] = ocr_key

        payload = {
            'image_data': b64_data,
            'mime_type': mimetype,
            'template_fields': template_fields,
            'tenant_id': tenant_id,
            'output_level': output_level,  # 'summary' or 'accounting'
        }

        response = requests.post(
            f'{ocr_url}/ocr/process',
            json=payload,
            headers=headers,
            timeout=120
        )

        if response.status_code != 200:
            body = response.text[:500] if response.text else 'no body'
            _logger.error(f'[OCR] HTTP {response.status_code}: {body}')
            return {'success': False, 'error': f'OCR service error {response.status_code}: {body}'}

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
            # Propagate top-level suggested_account to items that lack it (flat format)
            top_suggested = extracted.get('suggested_account') or normalized.get('suggested_account')
            if top_suggested and line_items:
                for li in line_items:
                    if not li.get('suggested_account'):
                        li['suggested_account'] = top_suggested
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

            # UNIVERSAL FALLBACK: if line_items is still empty, create from gross_amount/total
            if not line_items:
                total_amount = (
                    extracted.get('gross_amount') or
                    extracted.get('total_gross') or
                    extracted.get('total') or
                    normalized.get('total') or
                    (extracted.get('totals_on_doc', {}) or {}).get('total_gross')
                )
                if total_amount:
                    vendor = (
                        extracted.get('vendor_name') or
                        extracted.get('issuer_name') or
                        normalized.get('vendor_name') or
                        'Unknown'
                    )
                    # Look for suggested_account in multiple places (nested Gemini format)
                    suggested = (
                        extracted.get('suggested_account') or
                        normalized.get('suggested_account') or
                        extracted.get('category') or
                        (extracted.get('document', {}) or {}).get('category', '')
                    )
                    # Also try first line's suggested_account if lines exist but were empty after conversion
                    if not suggested:
                        raw_lines = extracted.get('lines', [])
                        if raw_lines and isinstance(raw_lines, list):
                            suggested = raw_lines[0].get('suggested_account', '')
                    line_items = [{
                        'product_name': vendor,
                        'quantity': 1,
                        'unit_price': total_amount,
                        'amount': total_amount,
                        'tax_rate': _parse_tax_rate(extracted.get('tax_rate', '10%')),
                        'suggested_account': suggested if suggested else None,
                    }]
                    _logger.warning(f'[OCR] Universal fallback: created summary line from total={total_amount}')

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

    Handles multiple formats:
    - Fast format: flat with vendor, tax_id, gross, net, r8_*, r10_*
    - Full format: nested issuer/document/lines
    - Legacy format: flat structure with Japanese keys
    """
    import json
    _logger.info(f'[OCR] _normalize_extracted called')
    _logger.info(f'[OCR] extracted keys in normalize: {list(extracted.keys())}')
    _logger.info(f'[OCR] extracted data in normalize: {json.dumps(extracted, ensure_ascii=False, indent=2)}')

    # Clean invoice_reg_no at top level (flat format from Gemini)
    if 'invoice_reg_no' in extracted:
        reg = re.sub(r'[()（）\s]', '', str(extracted['invoice_reg_no']))
        extracted['invoice_reg_no'] = reg

    # Check if this is the fast prompt format
    # FAST format has: vendor_name, gross, net, r8_gross, r8_tax, r10_gross, r10_tax
    has_vendor = 'vendor_name' in extracted or 'vendor' in extracted
    has_gross = 'gross' in extracted
    has_tax = 'r8_tax' in extracted or 'r8_net' in extracted
    _logger.info(f'[OCR] FAST format check: has_vendor={has_vendor}, has_gross={has_gross}, has_tax={has_tax}')

    if has_vendor and has_gross and has_tax:
        _logger.info('[OCR] FAST format detected in _normalize_extracted, calling _normalize_fast_format')
        return _normalize_fast_format(extracted)

    # Check if this is the new unified prompt format
    if 'issuer' in extracted or 'document' in extracted or 'lines' in extracted:
        return _normalize_new_format(extracted)

    # Old format - use legacy key mapping
    key_mapping = {
        'vendor_name': ['vendor_name_仕入先名', 'vendor_name', '仕入先名', 'vendor', 'store_name_店舗名', 'store_name', '店舗名'],
        'vendor_address': ['vendor_address_住所', 'vendor_address', '住所', 'address'],
        'tax_id': ['tax_id_登録番号', 'tax_id', '登録番号', 'registration_number', 'invoice_reg_no'],
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
        # Strip parentheses and spaces: T(105000 1019926) → T1050001019926
        if reg_no:
            reg_no = re.sub(r'[()（）\s]', '', str(reg_no))
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
        # If gross_amount is 0 but net + tax are available, compute it
        if not amount and line.get('net_amount') and line.get('tax_amount'):
            amount = line['net_amount'] + line['tax_amount']
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

    # Fallback: if lines are empty but we have totals, create a summary line
    totals = extracted.get('totals_on_doc', {})
    if not line_items and totals.get('total_gross'):
        _logger.warning('[OCR] No lines extracted, creating fallback summary line from totals')
        total_gross = totals['total_gross']
        total_tax = totals.get('total_tax') or 0
        # Determine tax rate from by_rate data
        by_rate = totals.get('by_rate', {})
        fallback_tax_rate = 10  # Default for services
        if by_rate.get('8%', {}).get('gross') and not by_rate.get('10%', {}).get('gross'):
            fallback_tax_rate = 8
        # Build fallback line
        doc_type = extracted.get('document', {}).get('doc_type', 'unknown')
        issuer_name = extracted.get('issuer', {}).get('issuer_name', '')
        fallback_name = issuer_name or doc_type
        line_items.append({
            'product_name': fallback_name,
            'quantity': 1,
            'unit_price': total_gross,
            'amount': total_gross,
            'tax_rate': fallback_tax_rate,
            'suggested_account': extracted.get('document', {}).get('suggested_account') or None,
        })

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


def _normalize_fast_format(extracted: dict) -> dict:
    """Normalize fast OCR format to Odoo-expected format.

    Fast format structure (from fast prompt):
    {
        "vendor": "店名/会社名",
        "tax_id": "T+13桁 or null",
        "date": "YYYY-MM-DD or null",
        "gross": 合計,
        "net": 小計(税前),
        "tax": 消費税合計,
        "r8_gross": 8%対象額(税込, or 0 if 外税),
        "r8_tax": 8%税額,
        "r10_gross": 10%対象額(税込, or 0 if 外税),
        "r10_tax": 10%税額
    }

    Handles two formats:
    A. 内税 (tax-inclusive): r8_gross/r10_gross have values
    B. 外税 (tax-exclusive): r8_gross/r10_gross = 0, calculate from tax amounts

    Converts to Odoo format for accounting journal entries.
    """
    _logger.info('[OCR] _normalize_fast_format called')
    normalized = {}

    # Basic fields
    normalized['vendor_name'] = extracted.get('vendor')
    normalized['tax_id'] = extracted.get('tax_id')
    normalized['date'] = extracted.get('date')

    # Totals
    gross = extracted.get('gross') or 0
    net = extracted.get('net') or 0
    tax = extracted.get('tax') or 0

    # Validation: net + tax should equal gross (±2 yen tolerance)
    if abs((net + tax) - gross) > 2:
        _logger.warning(f'[OCR] Amount mismatch: net={net} + tax={tax} != gross={gross}, diff={abs((net+tax)-gross)}')

    normalized['total'] = gross
    normalized['subtotal'] = net
    normalized['tax'] = tax

    # Tax breakdown by rate
    r8_gross = extracted.get('r8_gross') or 0
    r8_tax = extracted.get('r8_tax') or 0
    r10_gross = extracted.get('r10_gross') or 0
    r10_tax = extracted.get('r10_tax') or 0

    # Validate tax breakdown
    if abs((r8_tax + r10_tax) - tax) > 1:
        _logger.warning(f'[OCR] Tax breakdown mismatch: r8_tax={r8_tax} + r10_tax={r10_tax} != tax={tax}')

    # Calculate tax-exclusive amounts
    # Format A: 内税 (r8_gross/r10_gross provided) - net = gross - tax
    # Format B: 外税 (r8_gross/r10_gross = 0) - calculate net from tax
    if r8_gross > 0 or r10_gross > 0:
        # Format A: 内税 (tax-inclusive)
        r8_net = r8_gross - r8_tax if r8_gross > 0 else 0
        r10_net = r10_gross - r10_tax if r10_gross > 0 else 0
        _logger.info(f'[OCR] Format: 内税 (tax-inclusive)')
    else:
        # Format B: 外税 (tax-exclusive) - calculate net from tax amounts
        # r8_net = r8_tax / 0.08, r10_net = r10_tax / 0.10
        r8_net = round(r8_tax / 0.08) if r8_tax > 0 else 0
        r10_net = round(r10_tax / 0.10) if r10_tax > 0 else 0
        _logger.info(f'[OCR] Format: 外税 (tax-exclusive), calculated net from tax')

        # Cross-validate: calculated net should match subtotal
        calculated_net = r8_net + r10_net
        if abs(calculated_net - net) > 2:
            _logger.warning(f'[OCR] Calculated net mismatch: {calculated_net} != {net}, using subtotal value')
            # If mismatch, distribute subtotal proportionally by tax amounts
            if r8_tax + r10_tax > 0:
                ratio_8 = r8_tax / (r8_tax + r10_tax)
                r8_net = round(net * ratio_8)
                r10_net = net - r8_net

    _logger.info(f'[OCR] Tax breakdown: 8%: gross={r8_gross}, tax={r8_tax}, net={r8_net}')
    _logger.info(f'[OCR] Tax breakdown: 10%: gross={r10_gross}, tax={r10_tax}, net={r10_net}')

    normalized['tax_8_net'] = r8_net
    normalized['tax_8_amount'] = r8_tax
    normalized['tax_10_net'] = r10_net
    normalized['tax_10_amount'] = r10_tax

    # For accounting journal entries:
    # Debit: 仕入高 (net) + 仮払消費税8% (r8_tax) + 仮払消費税10% (r10_tax)
    # Credit: 現金/買掛金 (gross)
    normalized['debit_expense'] = normalized['subtotal']  # 仕入高/経費
    normalized['debit_tax_8'] = r8_tax  # 仮払消費税 8%
    normalized['debit_tax_10'] = r10_tax  # 仮払消費税 10%
    normalized['credit_total'] = normalized['total']  # 現金/買掛金

    # Create synthetic line items for compatibility (one line per tax rate)
    line_items = []
    if r8_net > 0:
        line_items.append({
            'product_name': '8%対象商品',
            'quantity': 1,
            'amount': r8_net + r8_tax,  # gross amount
            'net_amount': r8_net,
            'tax_amount': r8_tax,
            'tax_rate': 8,
        })
    if r10_net > 0:
        line_items.append({
            'product_name': '10%対象商品',
            'quantity': 1,
            'amount': r10_net + r10_tax,  # gross amount
            'net_amount': r10_net,
            'tax_amount': r10_tax,
            'tax_rate': 10,
        })

    normalized['line_items'] = line_items
    normalized['is_tax_inclusive'] = True  # Fast format assumes tax-inclusive totals

    # Keep original data
    normalized['_original'] = extracted
    normalized['_prompt_version'] = 'fast'

    _logger.info(f'[OCR] Normalized fast format: vendor={normalized.get("vendor_name")}, '
                 f'total={normalized.get("total")}, tax_8={r8_tax}, tax_10={r10_tax}')
    _logger.info(f'[OCR] _normalize_fast_format returning with _prompt_version={normalized.get("_prompt_version")}')

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
