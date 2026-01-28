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
import asyncio
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
    version="1.1.0",
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


def build_ocr_prompt(template_fields: List[str] = None) -> str:
    """
    Build OCR prompt for Japanese accounting documents.
    Supports 適格請求書 (Invoice System) and JGAAP standards.
    """
    return '''你是日本会计（日本基準/JGAAP）与适格請求書（インボイス制度）解析引擎。请从输入的小票/发票/请款单文本中，抽取"开票方信息 + 明细行 + 税率汇总 + 会计科目建议"，并进行严格交叉验证，尽量提高识别率。

【必须抽取的核心字段】
1) issuer（开票方）
- issuer_name：开票方名称（商号/店名/公司名）
- invoice_reg_no：税务识别号码（适格請求書発行事業者登録番号），形如 "T"+13位数字（例如 T1234567890123）
  - 若文本中找不到任何注册号/登録番号/適格請求書発行事業者番号/インボイス番号，则 invoice_reg_no 直接输出 "0000000000000"（十三个0，不带T）
- issuer_tel、issuer_address：能识别则填，否则为 null

2) document（单据）
- doc_type：receipt | invoice | unknown
- doc_date：YYYY-MM-DD 或 null
- currency：JPY
- category（必须输出且仅能取以下之一）：purchase | sale | expense
  - category 识别优先级：
    A. 文本明确：請求書/納品書/領収書/レシート/見積書 等 + 语义（売上/請求/支払/仕入/経費）
    B. 若出现"御請求/請求金額/お支払い"且对方为客户语境，倾向 sale
    C. 若出现"仕入/買掛/発注/納入/支払先/振込先"倾向 purchase
    D. 若出现大量费用类关键词（交通費/宿泊/会議/広告/通信/消耗品 等）倾向 expense
    E. 无法判断时：默认 expense，并在 notes 说明

3) lines（逐行明细，必须输出）
每一行必须输出：
- line_no：从1开始
- name：行名称（原文）
- tax_rate：枚举 ["10%","8%","exempt","unknown"]
  - 行税率判定优先级：
    A. 行内/附近出现 10%/8%/税10/税8/標準/軽減/外税10/内税8 等
    B. 汇总区的 "10%対象 / 8%対象 / 軽減対象 / 税率別" 对照（若能）
    C. 找不到税率：强制默认 "8%"
    D. 出现 非課税/不課税/免税/対象外：设为 "exempt"
- net_amount：净额（不含税金额，数值JPY；若只能得到含税则允许推导或置 null）
- tax_amount：税额（数值JPY；无法确定则 null）
- gross_amount：总额（含税金额，数值JPY；无法确定则 null）
- amount_source：说明三者来源与推导方式，枚举：
  ["all_on_doc","net+tax=gross","gross->net_by_rate","net->tax_by_rate","unknown"]
- qty、unit_price：能识别则填，否则 null
- suggested_account：建议会计科目（勘定科目名，日文）
- suggested_account_code：可选（若能给出常见代码体系则填，否则 null）
- suggested_account_confidence：0~1
- raw：原文片段用于追溯

【会计科目建议规则（结合日本会计准则的常见实务）】
你必须基于 category + 行名称关键词，给出 suggested_account：
A) category = purchase（采购：存货/进货/材料等）
- 默认：仕入高
- 若关键词包含：原材料/材料/部品/資材 → 原材料費 or 仕入高（择优）
- 若为固定资产/设备：PC/パソコン/サーバ/機械/備品/什器/工具/ソフトウェア → 工具器具備品 or ソフトウェア（金额大且耐用倾向固定资产）
- 若为外包：外注/業務委託/制作/開発 → 外注費
- 若为运费：送料/配送/運賃 → 荷造運賃
- 税处理提示（notes中给出）：对 purchase 通常对应 仮払消費税（但你仍需输出行税额）

B) category = sale（销售：对外开票/收入）
- 默认：売上高
- 若关键词包含：手数料/利用料/サブスク/課金 → 売上高（内可加"役務収益"类说明但科目仍输出売上高）
- 若为运费：送料/配送料 → 売上高（或 売上高(送料) 说明）
- 税处理提示（notes中给出）：对 sale 通常对应 仮受消費税（但你仍需输出行税额）

C) category = expense（费用：日常经费）
按关键词映射（优先级从高到低，命中即用）：
- 旅費交通費：電車/バス/タクシー/交通/切符/IC/出張
- 会議費：会議/打合せ/ミーティング
- 交際費：接待/贈答/お土産/懇親
- 通信費：通信/携帯/電話/インターネット/回線
- 水道光熱費：電気/ガス/水道
- 消耗品費：消耗品/文房具/日用品/備品（小额）
- 広告宣伝費：広告/宣伝/Google/Meta/販促
- 支払手数料：手数料/決済/振込手数料
- 地代家賃：家賃/賃料/レンタル
- 修繕費：修理/修繕/メンテ
- 福利厚生費：福利/健康/社内イベント
- 研修費：研修/セミナー/講座
- 未命中：雑費（并降低置信度）

【净额/税额/总额推导规则（必须执行）】
1) 若同一行同时出现"税抜/税別/本体"与"税込/合計"：
- 优先把税抜作为 net_amount，税込作为 gross_amount，税额为 gross-net（若可计算）
2) 若只出现含税金额 gross_amount，且税率明确为 10% 或 8%：
- 推导 net = round(gross / (1+rate))（JPY四舍五入；并在 amount_source 标注 gross->net_by_rate）
- tax = gross - net
3) 若只出现净额 net_amount，且税率明确：
- tax = round(net * rate)（JPY四舍五入；amount_source=net->tax_by_rate）
- gross = net + tax
4) 若 tax_rate="exempt"：tax_amount=0，gross=net（若可）
5) 若税率缺失：强制视为 8% 进行推导（并在 notes 标注"默认8%"）

【汇总区抽取（若存在）】
你必须尽最大努力抽取以下关键词附近的金额：
- total_gross（合計/総合計/請求金額/お会計/税込合計）
- total_tax（消費税/税額/内消費税）
- by_rate_summary（若有）：10%対象、8%対象、軽減対象、税率別、標準税率、軽減税率
并标注每个汇总值的来源：on_doc 或 derived（从行汇总推导）

【交叉验证（必须输出validation）】
你必须做三层校验，并给出 pass/fail/partial：
A) 行内校验（line-level）
- 对每行：若三者齐全，检查 net + tax == gross
- 若不等，给出 diff，并尝试解释：四舍五入/折扣/内税外税/OCR错位
B) 分税率校验（by-rate）
- 按 tax_rate 分组汇总 net/tax/gross（折扣行要计入，折扣为负数）
- 若票面存在 8%/10%対象 与 税额：对比差异
C) 总计校验（grand total）
- 所有行汇总 vs 票面 total_gross/total_tax（若存在）
- 若票面无总计，则输出 derived_total

【容差（考虑日元四舍五入与分摊）】
- 单行容差：±1 JPY
- 分税率税额容差：±1 JPY
- 总税额容差：±2 JPY
- 总金额容差：±2 JPY
超出容差必须列入 mismatches，并给出最可能修正建议（例如：某行税率应为10%而不是8%，或该金额为税抜而被当成税込）。

【输出格式要求】
只能输出 JSON（不要 markdown，不要解释文本），结构如下：
{
  "currency": "JPY",
  "document": {
    "doc_type": "receipt|invoice|unknown",
    "doc_date": "YYYY-MM-DD|null",
    "category": "purchase|sale|expense"
  },
  "issuer": {
    "issuer_name": "string|null",
    "invoice_reg_no": "T1234567890123|string(13 zeros)",
    "issuer_tel": "string|null",
    "issuer_address": "string|null"
  },
  "totals_on_doc": {
    "total_gross": 0|null,
    "total_tax": 0|null,
    "by_rate": {
      "10%": { "net": 0|null, "tax": 0|null, "gross": 0|null, "source": "on_doc|derived" },
      "8%":  { "net": 0|null, "tax": 0|null, "gross": 0|null, "source": "on_doc|derived" },
      "exempt": { "net": 0|null, "tax": 0|null, "gross": 0|null, "source": "on_doc|derived" }
    }
  },
  "lines": [
    {
      "line_no": 1,
      "name": "string",
      "tax_rate": "10%|8%|exempt|unknown",
      "net_amount": 0|null,
      "tax_amount": 0|null,
      "gross_amount": 0|null,
      "amount_source": "all_on_doc|net+tax=gross|gross->net_by_rate|net->tax_by_rate|unknown",
      "qty": 0|null,
      "unit_price": 0|null,
      "suggested_account": "string",
      "suggested_account_code": "string|null",
      "suggested_account_confidence": 0.0,
      "raw": "string"
    }
  ],
  "validation": {
    "tolerances": { "line": 1, "by_rate_tax": 1, "total_tax": 2, "total_gross": 2 },
    "checks": [
      { "name": "line_level", "status": "pass|fail|partial", "details": "string" },
      { "name": "by_rate", "status": "pass|fail|partial", "details": "string" },
      { "name": "grand_total", "status": "pass|fail|partial", "details": "string" }
    ],
    "mismatches": [
      {
        "scope": "line|8%|10%|exempt|total",
        "field": "net|tax|gross",
        "expected": 0,
        "actual": 0,
        "diff": 0,
        "reason": "string",
        "candidate_fix": {
          "line_no": 0|null,
          "suggest_tax_rate": "10%|8%|exempt|null",
          "suggest_amount_interpretation": "tax_inclusive|tax_exclusive|null",
          "confidence": 0.0
        }
      }
    ]
  },
  "notes": [
    "string"
  ]
}

【强制约束】
- 如果 invoice_reg_no 缺失：必须输出 "0000000000000"（十三个0）
- 如果行税率缺失：必须默认 "8%"
- 不能省略 lines；即使识别困难也要尽量输出候选行并用 null 标注不确定值'''


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

    url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}'
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
                wait_time = (attempt + 1) * 5
                logger.warning(f"Rate limited, waiting {wait_time}s")
                await asyncio.sleep(wait_time)
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
                await asyncio.sleep(5)
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
    return {"status": "healthy", "version": "1.1.0", "timestamp": datetime.now().isoformat()}


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
    logger.info(f"OCR completed in {processing_time_ms}ms, success={result.get('success')}")

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
