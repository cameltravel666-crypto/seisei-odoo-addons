# -*- coding: utf-8 -*-
"""
Central OCR Service - Managed by Odoo 19
Handles all OCR API calls, tracks usage per tenant, hides API details from tenants.
"""

import os
import json
import base64
import logging
import time
import re
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncpg

# Configuration
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
DATABASE_URL = os.getenv('OCR_DATABASE_URL', 'postgresql://ocr:ocr@localhost:5432/ocr_service')
SERVICE_KEY = os.getenv('OCR_SERVICE_KEY', '')  # For authenticating Odoo instances
FREE_QUOTA_PER_MONTH = int(os.getenv('OCR_FREE_QUOTA', '30'))
PRICE_PER_IMAGE = float(os.getenv('OCR_PRICE_PER_IMAGE', '20'))  # JPY

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database pool
db_pool: Optional[asyncpg.Pool] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage database connection pool lifecycle"""
    global db_pool
    try:
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        # Initialize tables
        async with db_pool.acquire() as conn:
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS ocr_usage (
                    id SERIAL PRIMARY KEY,
                    tenant_id VARCHAR(100) NOT NULL,
                    year_month VARCHAR(7) NOT NULL,
                    image_count INTEGER DEFAULT 0,
                    billable_count INTEGER DEFAULT 0,
                    total_cost DECIMAL(10,2) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(tenant_id, year_month)
                )
            ''')
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS ocr_requests (
                    id SERIAL PRIMARY KEY,
                    tenant_id VARCHAR(100) NOT NULL,
                    request_time TIMESTAMP DEFAULT NOW(),
                    success BOOLEAN,
                    error_code VARCHAR(50),
                    processing_time_ms INTEGER,
                    file_size_bytes INTEGER
                )
            ''')
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        db_pool = None

    yield

    if db_pool:
        await db_pool.close()


app = FastAPI(
    title="Central OCR Service",
    description="Centralized OCR service managed by Odoo 19",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Models
class OCRRequest(BaseModel):
    image_data: str  # Base64 encoded
    mime_type: str = 'image/jpeg'
    template_fields: List[str] = []
    tenant_id: str = 'default'


class OCRResponse(BaseModel):
    success: bool
    extracted: Optional[Dict[str, Any]] = None
    raw_response: Optional[str] = None
    error_code: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None


class UsageResponse(BaseModel):
    tenant_id: str
    year_month: str
    image_count: int
    free_remaining: int
    billable_count: int
    total_cost: float


# Authentication
async def verify_service_key(x_service_key: Optional[str] = Header(None)):
    """Verify the service key from Odoo instances"""
    if SERVICE_KEY and x_service_key != SERVICE_KEY:
        raise HTTPException(status_code=401, detail="Invalid service key")
    return True


def build_ocr_prompt(template_fields: List[str]) -> str:
    """Build OCR prompt based on template fields"""
    if not template_fields:
        template_fields = [
            '仕入先名/Vendor Name',
            '日付/Date',
            '請求書番号/Invoice Number',
            '登録番号/Tax ID',
            '合計金額/Total Amount',
            '通貨/Currency'
        ]

    fields_json = {}
    for field in template_fields:
        key = field.strip().replace(' ', '_').replace('/', '_')
        fields_json[key] = f"<{field}の値>"

    fields_str = json.dumps(fields_json, ensure_ascii=False, indent=2)

    return f'''あなたは請求書・納品書のOCR専門家です。
この画像から以下の項目を抽出してJSON形式で返してください：

{fields_str}

また、明細行がある場合は以下の形式で抽出：
{{
  "line_items": [
    {{
      "product_name": "商品名",
      "quantity": 数量,
      "unit": "単位",
      "unit_price": 単価,
      "amount": 金額
    }}
  ]
}}

重要：
- 項目名は上記のキー名をそのまま使用
- 数値は数字のみ（通貨記号やカンマなし）
- 日付はYYYY-MM-DD形式
- 読み取れない項目はnullにする
- JSONのみを返す（説明文不要）'''


def extract_json_from_text(text: str) -> dict:
    """Extract JSON from text response"""
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    try:
        start = text.find('{')
        end = text.rfind('}') + 1
        if start != -1 and end > start:
            return json.loads(text[start:end])
    except json.JSONDecodeError:
        pass

    return {'raw_text': text}


async def call_gemini_api(image_data: str, mime_type: str, template_fields: List[str]) -> Dict[str, Any]:
    """Call Gemini API - internal function, never exposed to tenants"""
    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY not configured")
        return {'success': False, 'error_code': 'service_error'}

    url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={GEMINI_API_KEY}'
    prompt = build_ocr_prompt(template_fields)

    payload = {
        'contents': [{
            'parts': [
                {'inline_data': {'mime_type': mime_type, 'data': image_data}},
                {'text': prompt}
            ]
        }],
        'generationConfig': {
            'temperature': 0.1,
            'maxOutputTokens': 4096,
        }
    }

    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={'Content-Type': 'application/json'}
                )

            if response.status_code == 429:
                wait_time = (attempt + 1) * 10
                logger.warning(f"Rate limited, waiting {wait_time}s")
                time.sleep(wait_time)
                continue

            if response.status_code != 200:
                logger.error(f"Gemini API error: {response.status_code}")
                return {'success': False, 'error_code': 'service_error'}

            result = response.json()
            candidates = result.get('candidates', [])
            if not candidates:
                return {'success': False, 'error_code': 'processing_failed'}

            content = candidates[0].get('content', {})
            parts = content.get('parts', [])
            if not parts:
                return {'success': False, 'error_code': 'processing_failed'}

            raw_text = parts[0].get('text', '')
            extracted = extract_json_from_text(raw_text)

            return {
                'success': True,
                'extracted': extracted,
                'raw_response': raw_text,
            }

        except httpx.TimeoutException:
            if attempt < max_retries - 1:
                time.sleep(5)
                continue
            return {'success': False, 'error_code': 'timeout'}
        except Exception as e:
            logger.exception(f"Gemini API error: {e}")
            return {'success': False, 'error_code': 'service_error'}

    return {'success': False, 'error_code': 'max_retries'}


async def update_usage(tenant_id: str, success: bool, processing_time_ms: int, file_size: int):
    """Update usage tracking for tenant"""
    if not db_pool:
        return None

    year_month = datetime.now().strftime('%Y-%m')

    try:
        async with db_pool.acquire() as conn:
            # Log the request
            await conn.execute('''
                INSERT INTO ocr_requests (tenant_id, success, processing_time_ms, file_size_bytes)
                VALUES ($1, $2, $3, $4)
            ''', tenant_id, success, processing_time_ms, file_size)

            if success:
                # Update monthly usage
                await conn.execute('''
                    INSERT INTO ocr_usage (tenant_id, year_month, image_count, billable_count, total_cost)
                    VALUES ($1, $2, 1,
                        CASE WHEN 1 > $3 THEN 1 ELSE 0 END,
                        CASE WHEN 1 > $3 THEN $4 ELSE 0 END)
                    ON CONFLICT (tenant_id, year_month) DO UPDATE SET
                        image_count = ocr_usage.image_count + 1,
                        billable_count = CASE
                            WHEN ocr_usage.image_count >= $3 THEN ocr_usage.billable_count + 1
                            ELSE ocr_usage.billable_count
                        END,
                        total_cost = CASE
                            WHEN ocr_usage.image_count >= $3 THEN ocr_usage.total_cost + $4
                            ELSE ocr_usage.total_cost
                        END,
                        updated_at = NOW()
                ''', tenant_id, year_month, FREE_QUOTA_PER_MONTH, PRICE_PER_IMAGE)

                # Get current usage
                row = await conn.fetchrow('''
                    SELECT image_count, billable_count, total_cost
                    FROM ocr_usage WHERE tenant_id = $1 AND year_month = $2
                ''', tenant_id, year_month)

                if row:
                    return {
                        'image_count': row['image_count'],
                        'free_remaining': max(0, FREE_QUOTA_PER_MONTH - row['image_count']),
                        'billable_count': row['billable_count'],
                        'total_cost': float(row['total_cost']),
                    }
    except Exception as e:
        logger.exception(f"Usage update error: {e}")

    return None


# API Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.post("/api/v1/ocr/process", response_model=OCRResponse)
async def process_ocr(
    request: OCRRequest,
    _: bool = Depends(verify_service_key)
):
    """Process OCR request from Odoo 18 instance"""
    start_time = time.time()
    file_size = len(request.image_data) * 3 // 4  # Approximate decoded size

    logger.info(f"OCR request from tenant: {request.tenant_id}")

    # Call Gemini API
    result = await call_gemini_api(
        request.image_data,
        request.mime_type,
        request.template_fields
    )

    processing_time_ms = int((time.time() - start_time) * 1000)

    # Update usage tracking
    usage = await update_usage(
        request.tenant_id,
        result.get('success', False),
        processing_time_ms,
        file_size
    )

    if result.get('success'):
        return OCRResponse(
            success=True,
            extracted=result.get('extracted'),
            raw_response=result.get('raw_response'),
            usage=usage
        )
    else:
        return OCRResponse(
            success=False,
            error_code=result.get('error_code', 'processing_failed')
        )


@app.get("/api/v1/usage/{tenant_id}", response_model=UsageResponse)
async def get_usage(
    tenant_id: str,
    year_month: Optional[str] = None,
    _: bool = Depends(verify_service_key)
):
    """Get usage statistics for a tenant"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    if not year_month:
        year_month = datetime.now().strftime('%Y-%m')

    async with db_pool.acquire() as conn:
        row = await conn.fetchrow('''
            SELECT tenant_id, year_month, image_count, billable_count, total_cost
            FROM ocr_usage WHERE tenant_id = $1 AND year_month = $2
        ''', tenant_id, year_month)

    if row:
        return UsageResponse(
            tenant_id=row['tenant_id'],
            year_month=row['year_month'],
            image_count=row['image_count'],
            free_remaining=max(0, FREE_QUOTA_PER_MONTH - row['image_count']),
            billable_count=row['billable_count'],
            total_cost=float(row['total_cost'])
        )
    else:
        return UsageResponse(
            tenant_id=tenant_id,
            year_month=year_month,
            image_count=0,
            free_remaining=FREE_QUOTA_PER_MONTH,
            billable_count=0,
            total_cost=0
        )


@app.get("/api/v1/usage")
async def list_all_usage(
    year_month: Optional[str] = None,
    _: bool = Depends(verify_service_key)
):
    """List usage for all tenants (admin endpoint for Odoo 19)"""
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    if not year_month:
        year_month = datetime.now().strftime('%Y-%m')

    async with db_pool.acquire() as conn:
        rows = await conn.fetch('''
            SELECT tenant_id, year_month, image_count, billable_count, total_cost
            FROM ocr_usage WHERE year_month = $1
            ORDER BY image_count DESC
        ''', year_month)

    return {
        'year_month': year_month,
        'free_quota': FREE_QUOTA_PER_MONTH,
        'price_per_image': PRICE_PER_IMAGE,
        'tenants': [
            {
                'tenant_id': row['tenant_id'],
                'image_count': row['image_count'],
                'free_remaining': max(0, FREE_QUOTA_PER_MONTH - row['image_count']),
                'billable_count': row['billable_count'],
                'total_cost': float(row['total_cost'])
            }
            for row in rows
        ]
    }


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8080)
