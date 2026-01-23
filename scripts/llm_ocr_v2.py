"""
多模态LLM OCR处理模块 v2
支持 PDF 转图片后使用 GPT-4o-mini
"""
import base64
import json
import logging
import os
import re
import requests
import io
from typing import Dict, Any, List

_logger = logging.getLogger(__name__)

# API配置
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')

# 模型配置
LLM_MODELS = {
    'gpt4o-mini': {
        'provider': 'openai',
        'model': 'gpt-4o-mini',
        'cost_per_image': 0.15,  # 日元
        'sell_price': 0.5,
        'supports_pdf': False,
    },
    'haiku': {
        'provider': 'anthropic',
        'model': 'claude-3-5-haiku-20241022',
        'cost_per_image': 1.0,
        'sell_price': 3.0,
        'supports_pdf': True,
    },
    'sonnet': {
        'provider': 'anthropic',
        'model': 'claude-sonnet-4-20250514',
        'cost_per_image': 4.0,
        'sell_price': 12.0,
        'supports_pdf': True,
    },
}

# 采购单识别提示词
PURCHASE_ORDER_PROMPT = '''あなたは請求書・納品書のOCR専門家です。
この画像から以下の情報を抽出してJSON形式で返してください：

{
  "vendor_name": "仕入先名",
  "date": "YYYY-MM-DD形式の日付",
  "invoice_number": "請求書番号",
  "line_items": [
    {
      "product_name": "商品名（日本語のまま）",
      "quantity": 数量（数値）,
      "unit": "単位",
      "unit_price": 単価（数値）,
      "amount": 金額（数値）
    }
  ],
  "subtotal": 小計,
  "tax": 消費税,
  "total": 合計金額
}

重要：
- 商品名は画像に書かれている通りに抽出（翻訳しない）
- 数値は数字のみ（通貨記号やカンマなし）
- 読み取れない項目はnullにする
- JSONのみを返す（説明文不要）'''

# 多页PDF提示词
MULTI_PAGE_PROMPT = '''あなたは請求書・納品書のOCR専門家です。
これは複数ページの請求書の一部です。このページから商品明細を抽出してJSON形式で返してください：

{
  "page_info": {
    "vendor_name": "仕入先名（あれば）",
    "date": "日付（あれば）",
    "invoice_number": "請求書番号（あれば）"
  },
  "line_items": [
    {
      "product_name": "商品名",
      "quantity": 数量,
      "unit": "単位",
      "unit_price": 単価,
      "amount": 金額
    }
  ]
}

JSONのみを返してください。'''


def pdf_to_images(pdf_data: bytes, dpi: int = 150) -> List[bytes]:
    """
    PDF を画像に変換

    Args:
        pdf_data: PDF のバイナリデータ
        dpi: 解像度 (デフォルト 150)

    Returns:
        JPEG 画像のバイナリデータのリスト
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        _logger.error('[LLM OCR] PyMuPDF not installed. Run: pip install PyMuPDF')
        raise ImportError('PyMuPDF is required for PDF conversion. Install with: pip install PyMuPDF')

    images = []

    try:
        # PDF を開く
        pdf_document = fitz.open(stream=pdf_data, filetype='pdf')

        for page_num in range(len(pdf_document)):
            page = pdf_document[page_num]

            # ページを画像に変換
            # dpi=150 で十分な品質、ファイルサイズも適度
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)

            # JPEG に変換
            img_data = pix.tobytes('jpeg')
            images.append(img_data)

            _logger.info(f'[LLM OCR] Converted page {page_num + 1}/{len(pdf_document)} to image')

        pdf_document.close()

    except Exception as e:
        _logger.exception(f'[LLM OCR] PDF conversion error: {e}')
        raise

    return images


def process_with_llm(
    image_data: bytes,
    mimetype: str,
    model_key: str = 'gpt4o-mini',
    prompt: str = PURCHASE_ORDER_PROMPT
) -> Dict[str, Any]:
    """
    多模態LLMで画像/PDFを処理

    Args:
        image_data: 画像/PDFのバイナリデータ
        mimetype: MIMEタイプ
        model_key: 使用するモデル
        prompt: 処理用プロンプト

    Returns:
        処理結果の辞書
    """
    model_config = LLM_MODELS.get(model_key, LLM_MODELS['gpt4o-mini'])

    try:
        # PDF の場合
        if mimetype == 'application/pdf':
            if model_config['supports_pdf']:
                # Claude は PDF を直接サポート
                return _process_anthropic(image_data, mimetype, model_config, prompt)
            else:
                # GPT-4o-mini: PDF を画像に変換して処理
                return _process_pdf_as_images(image_data, model_config, prompt)

        # 画像の場合
        if model_config['provider'] == 'anthropic':
            return _process_anthropic(image_data, mimetype, model_config, prompt)
        elif model_config['provider'] == 'openai':
            return _process_openai(image_data, mimetype, model_config, prompt)
        else:
            return {'success': False, 'error': f'Unknown provider: {model_config["provider"]}'}

    except Exception as e:
        _logger.exception(f'[LLM OCR] Error: {e}')
        return {'success': False, 'error': str(e)}


def _process_pdf_as_images(
    pdf_data: bytes,
    config: dict,
    prompt: str
) -> Dict[str, Any]:
    """PDF を画像に変換して処理"""

    # PDF を画像に変換
    images = pdf_to_images(pdf_data, dpi=150)

    if not images:
        return {'success': False, 'error': 'Failed to convert PDF to images'}

    all_line_items = []
    extracted_info = {}
    total_cost = 0
    raw_responses = []

    # 各ページを処理
    for i, img_data in enumerate(images):
        _logger.info(f'[LLM OCR] Processing page {i + 1}/{len(images)}')

        # 最初のページは通常プロンプト、以降は簡略版
        page_prompt = prompt if i == 0 else MULTI_PAGE_PROMPT

        result = _process_openai(img_data, 'image/jpeg', config, page_prompt)

        if result.get('success'):
            total_cost += config['cost_per_image']
            raw_responses.append(f"--- Page {i + 1} ---\n{result.get('raw_response', '')}")

            extracted = result.get('extracted', {})

            # 最初のページから基本情報を取得
            if i == 0:
                extracted_info = {
                    'vendor_name': extracted.get('vendor_name'),
                    'date': extracted.get('date'),
                    'invoice_number': extracted.get('invoice_number'),
                    'subtotal': extracted.get('subtotal'),
                    'tax': extracted.get('tax'),
                    'total': extracted.get('total'),
                }
            else:
                # 後続ページから追加情報
                page_info = extracted.get('page_info', {})
                if page_info.get('vendor_name') and not extracted_info.get('vendor_name'):
                    extracted_info['vendor_name'] = page_info['vendor_name']

            # 商品明細を追加
            page_items = extracted.get('line_items', [])
            all_line_items.extend(page_items)
        else:
            _logger.warning(f'[LLM OCR] Page {i + 1} failed: {result.get("error")}')

    return {
        'success': True,
        'extracted': extracted_info,
        'line_items': all_line_items,
        'raw_response': '\n\n'.join(raw_responses),
        'model': config['model'],
        'pages_processed': len(images),
        'cost': total_cost,
        'sell_price': config['sell_price'] * len(images),
    }


def _process_anthropic(
    image_data: bytes,
    mimetype: str,
    config: dict,
    prompt: str
) -> Dict[str, Any]:
    """Anthropic Claude API で処理"""
    if not ANTHROPIC_API_KEY:
        return {'success': False, 'error': 'ANTHROPIC_API_KEY not configured'}

    b64_data = base64.standard_b64encode(image_data).decode('utf-8')

    headers = {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
    }

    # PDF は document type を使用
    if mimetype == 'application/pdf':
        content = [
            {
                'type': 'document',
                'source': {
                    'type': 'base64',
                    'media_type': 'application/pdf',
                    'data': b64_data,
                }
            },
            {'type': 'text', 'text': prompt}
        ]
    else:
        media_type = mimetype if mimetype.startswith('image/') else 'image/jpeg'
        content = [
            {
                'type': 'image',
                'source': {
                    'type': 'base64',
                    'media_type': media_type,
                    'data': b64_data,
                }
            },
            {'type': 'text', 'text': prompt}
        ]

    payload = {
        'model': config['model'],
        'max_tokens': 4096,
        'messages': [{'role': 'user', 'content': content}],
    }

    response = requests.post(
        'https://api.anthropic.com/v1/messages',
        headers=headers,
        json=payload,
        timeout=120
    )

    if response.status_code != 200:
        return {'success': False, 'error': f'API error: {response.status_code} - {response.text}'}

    result = response.json()
    raw_text = result.get('content', [{}])[0].get('text', '')
    extracted = _extract_json(raw_text)

    return {
        'success': True,
        'extracted': extracted,
        'line_items': extracted.get('line_items', []),
        'raw_response': raw_text,
        'model': config['model'],
        'cost': config['cost_per_image'],
        'sell_price': config['sell_price'],
    }


def _process_openai(
    image_data: bytes,
    mimetype: str,
    config: dict,
    prompt: str
) -> Dict[str, Any]:
    """OpenAI GPT-4V API で処理"""
    if not OPENAI_API_KEY:
        return {'success': False, 'error': 'OPENAI_API_KEY not configured'}

    b64_data = base64.standard_b64encode(image_data).decode('utf-8')

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {OPENAI_API_KEY}',
    }

    # 画像の MIME タイプを確認
    if mimetype not in ['image/jpeg', 'image/png', 'image/gif', 'image/webp']:
        mimetype = 'image/jpeg'

    payload = {
        'model': config['model'],
        'max_tokens': 4096,
        'messages': [{
            'role': 'user',
            'content': [
                {
                    'type': 'image_url',
                    'image_url': {
                        'url': f'data:{mimetype};base64,{b64_data}',
                        'detail': 'high'  # 高精細モード
                    }
                },
                {'type': 'text', 'text': prompt}
            ]
        }],
    }

    response = requests.post(
        'https://api.openai.com/v1/chat/completions',
        headers=headers,
        json=payload,
        timeout=60
    )

    if response.status_code != 200:
        return {'success': False, 'error': f'API error: {response.status_code} - {response.text}'}

    result = response.json()
    raw_text = result.get('choices', [{}])[0].get('message', {}).get('content', '')
    extracted = _extract_json(raw_text)

    return {
        'success': True,
        'extracted': extracted,
        'line_items': extracted.get('line_items', []),
        'raw_response': raw_text,
        'model': config['model'],
        'cost': config['cost_per_image'],
        'sell_price': config['sell_price'],
    }


def _extract_json(text: str) -> dict:
    """テキストから JSON を抽出"""
    # コードブロック内の JSON を探す
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # 直接 JSON を探す
    try:
        start = text.find('{')
        end = text.rfind('}') + 1
        if start != -1 and end > start:
            return json.loads(text[start:end])
    except json.JSONDecodeError:
        pass

    return {'raw_text': text}


def get_pricing_info(model_key: str = 'gpt4o-mini') -> dict:
    """価格情報を取得"""
    config = LLM_MODELS.get(model_key, LLM_MODELS['gpt4o-mini'])
    return {
        'model': config['model'],
        'cost_per_image': config['cost_per_image'],
        'sell_price': config['sell_price'],
        'profit_margin': '200%',
        'free_quota': 30,
        'supports_pdf': config['supports_pdf'],
    }
