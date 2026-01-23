"""
多模态LLM OCR处理模块
支持 Claude Haiku 3.5 / Sonnet 4 / GPT-4o-mini
"""
import base64
import json
import logging
import os
import re
import requests
from typing import Dict, Any

_logger = logging.getLogger(__name__)

# API配置
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')

# 模型配置
LLM_MODELS = {
    'haiku': {
        'provider': 'anthropic',
        'model': 'claude-3-5-haiku-20241022',
        'cost_per_image': 1.0,  # 日元
        'sell_price': 3.0,
    },
    'sonnet': {
        'provider': 'anthropic',
        'model': 'claude-sonnet-4-20250514',
        'cost_per_image': 4.0,
        'sell_price': 12.0,
    },
    'gpt4o-mini': {
        'provider': 'openai',
        'model': 'gpt-4o-mini',
        'cost_per_image': 0.15,
        'sell_price': 0.5,
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


def process_with_llm(
    image_data: bytes,
    mimetype: str,
    model_key: str = 'haiku',
    prompt: str = PURCHASE_ORDER_PROMPT
) -> Dict[str, Any]:
    """
    Use multimodal LLM to process image

    Args:
        image_data: Binary image data
        mimetype: MIME type (image/jpeg, image/png, application/pdf)
        model_key: Model to use (haiku/sonnet/gpt4o-mini)
        prompt: Processing prompt

    Returns:
        {
            'success': bool,
            'extracted': dict,
            'line_items': list,
            'raw_response': str,
            'model': str,
            'cost': float,
            'error': str (only on error)
        }
    """
    model_config = LLM_MODELS.get(model_key, LLM_MODELS['haiku'])

    try:
        if model_config['provider'] == 'anthropic':
            return _process_anthropic(image_data, mimetype, model_config, prompt)
        elif model_config['provider'] == 'openai':
            return _process_openai(image_data, mimetype, model_config, prompt)
        else:
            return {'success': False, 'error': f'Unknown provider: {model_config["provider"]}'}
    except Exception as e:
        _logger.exception(f'[LLM OCR] Error: {e}')
        return {'success': False, 'error': str(e)}


def _process_anthropic(
    image_data: bytes,
    mimetype: str,
    config: dict,
    prompt: str
) -> Dict[str, Any]:
    """Process with Anthropic Claude API"""
    if not ANTHROPIC_API_KEY:
        return {'success': False, 'error': 'ANTHROPIC_API_KEY not configured'}

    b64_data = base64.standard_b64encode(image_data).decode('utf-8')

    # Media type conversion
    media_type = mimetype
    if mimetype == 'application/pdf':
        media_type = 'application/pdf'
    elif mimetype.startswith('image/'):
        media_type = mimetype
    else:
        media_type = 'image/jpeg'

    headers = {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
    }

    # PDF uses document type
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
        timeout=60
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
    """Process with OpenAI GPT-4V API"""
    if not OPENAI_API_KEY:
        return {'success': False, 'error': 'OPENAI_API_KEY not configured'}

    b64_data = base64.standard_b64encode(image_data).decode('utf-8')

    # PDF is not directly supported by OpenAI
    if mimetype == 'application/pdf':
        return {'success': False, 'error': 'OpenAI does not support PDF directly'}

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {OPENAI_API_KEY}',
    }

    payload = {
        'model': config['model'],
        'max_tokens': 4096,
        'messages': [{
            'role': 'user',
            'content': [
                {
                    'type': 'image_url',
                    'image_url': {
                        'url': f'data:{mimetype};base64,{b64_data}'
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
        return {'success': False, 'error': f'API error: {response.status_code}'}

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
    """Extract JSON from text"""
    # Look for JSON in code blocks
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Try to find raw JSON
    try:
        start = text.find('{')
        end = text.rfind('}') + 1
        if start != -1 and end > start:
            return json.loads(text[start:end])
    except json.JSONDecodeError:
        pass

    return {'raw_text': text}


def get_pricing_info(model_key: str = 'haiku') -> dict:
    """Get pricing information"""
    config = LLM_MODELS.get(model_key, LLM_MODELS['haiku'])
    return {
        'model': config['model'],
        'cost_per_image': config['cost_per_image'],
        'sell_price': config['sell_price'],
        'profit_margin': '200%',
        'free_quota': 30,
    }
