# -*- coding: utf-8 -*-
"""
Central OCR Service - Managed by Odoo 19
Handles all OCR API calls, tracks usage per tenant, hides API details from tenants.
Version 1.4.1 - Fix prompt account names to match staging chart of accounts
"""

import os
import json
import base64
import logging
import time
import asyncio
import re
from datetime import datetime, date
from typing import Optional, List, Dict, Any, Literal
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncpg

# Configuration
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
DATABASE_URL = os.getenv('OCR_DATABASE_URL', 'postgresql://ocr:ocr@localhost:5432/ocr_service')
SERVICE_KEY = os.getenv('OCR_SERVICE_KEY', '')
FREE_QUOTA_PER_MONTH = int(os.getenv('OCR_FREE_QUOTA', '30'))
PRICE_PER_IMAGE = float(os.getenv('OCR_PRICE_PER_IMAGE', '20'))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

db_pool: Optional[asyncpg.Pool] = None


# ============== PROMPTS ==============

# FAST PROMPT - For quick extraction of totals + optional line items (~5-8s)
# CRITICAL: Always read summary lines at the bottom, NOT item-by-item totals
PROMPT_FAST = '''日本のレシート/請求書から**レシート下部の合計欄**の数字を正確に抽出してJSON形式で返す:
{
  "vendor": "店名/会社名",
  "tax_id": "T+13桁 または null",
  "date": "YYYY-MM-DD または null",
  "gross": 合計(数値),
  "net": 小計(数値),
  "tax": 消費税合計(数値),
  "r8_gross": 8%対象額(数値/0),
  "r8_tax": 8%税額(数値/0),
  "r10_gross": 10%対象額(数値/0),
  "r10_tax": 10%税額(数値/0),
  "line_items": [
    {
      "product_name": "商品名",
      "quantity": 数量,
      "unit_price": 単価,
      "tax_rate": "8%" or "10%",
      "amount": 金額
    }
  ]
}

【STEP 1: 必ず下記のキーワード行から数字を読み取る】商品明細を足し算してはいけない:
1. "小計" / "税抜合計" / "税抜" / "税前" → net
2. **税金行を優先的に探す**（以下のいずれかから税率別に抽出）:
   - "外税額 8%" / "外税額　8%" / "外税額(8%)"
   - "(内)消費税等 8%" / "(内)消費税 8%" / "消費税 8%" / "消費税等 8%"
   - "内消費税8%" / "内消費税 8%" / "内税8%"
   - "外税額 10%" / "外税額　10%" / "外税額(10%)"
   - "(内)消費税等 10%" / "(内)消費税 10%" / "消費税 10%" / "消費税等 10%"
   - "内消費税10%" / "内消費税 10%" / "内税10%"
   → これらの行から r8_tax と r10_tax を抽出
3. "合計" / "お会計" / "総合計" / "お支払い" / "お釣り前の金額" → gross
   **重要**: "小計"ではなく"合計"を gross として読み取る
4. "8%対象" / "8%対象額" / "税率8%対象額" / "(税率 8%対象額)" → r8_gross (あれば)
5. "10%対象" / "10%対象額" / "税率10%対象額" / "(税率 10%対象額)" → r10_gross (あれば)

【STEP 2: 外税 or 内税を判定】:
A) 「外税額」または「(内)消費税等」の表記がある → 外税形式
   → r8_gross = 0, r10_gross = 0 に強制設定
   → r8_tax と r10_tax のみ税金行から読取
   → tax = r8_tax + r10_tax

B) 「8%対象」「10%対象」の表記がある → 内税形式
   → r8_gross, r10_gross を「X%対象」または「税率X%対象額」行から読取
   → r8_tax, r10_tax を「内消費税X%」または「消費税X%」行から読取
   → tax = r8_tax + r10_tax

C) どちらでもない → net + tax = gross を検証して判定

【外税レシート例1（業務スーパー形式）】:
```
小計            ¥4,714  → net = 4714
外税額　8%      ¥377    → r8_tax = 377, r8_gross = 0
合計            ¥5,091  → gross = 5091
(税率 8%対象額  ¥5,091) → 無視（これは合計額）
(内)消費税等 8% ¥377    → r8_tax = 377（確認用）
```

【外税レシート例2（複数税率）】:
```
小計            ¥7,415  → net = 7415
外税額　8%      ¥592    → r8_tax = 592, r8_gross = 0
外税額　10%     ¥1      → r10_tax = 1, r10_gross = 0
合計            ¥8,008  → gross = 8008
```

【内税レシート例（r8_gross/r10_gross に値あり）】:
```
8%対象          ¥7,953  → r8_gross = 7953
内消費税8%      ¥588    → r8_tax = 588
10%対象         ¥55     → r10_gross = 55
内消費税10%     ¥5      → r10_tax = 5
合計            ¥8,008  → gross = 8008
```

【必須検証】:
✓ net + tax = gross (±2円の誤差許容)
✓ r8_tax + r10_tax = tax (±1円)
✓ 外税形式の場合: r8_gross = 0 AND r10_gross = 0
✓ 全ての金額は正の整数

【STEP 3: 明細行の抽出（可能な場合のみ）】:
**重要**: 合計欄の抽取を優先。明細行は**ベストエフォート**で抽出する
- 明細行が明確に記載されている場合のみ抽出
- 各明細行から以下を抽出:
  * product_name: 商品名/品名
  * quantity: 数量（デフォルト1）
  * unit_price: 単価（税抜）
  * tax_rate: "8%" または "10%" （デフォルト"8%"）
  * amount: 金額（その行の税抜金額、または税込なら推定）
- 明細行がない/不明確な場合: line_items = []
- 明細行の合計は net に近い値になるべき

【出力】:
- 数字のみ（カンマ・円記号なし）
- 見つからない項目は 0 または null
- T番号なし→tax_id:null
- 明細なし→line_items:[]
- JSONのみ出力（説明文不要）'''

# FULL PROMPT - For detailed line-by-line extraction (~25-35s)
# v2.0: Optimized for higher extraction rate, non-retail receipts, JGAAP compliance
PROMPT_FULL = '''你是日本会计（日本基準/JGAAP）与适格請求書（インボイス制度）解析引擎。
从输入的小票/发票/领收书/请款单图片中，抽取信息并输出JSON。

★★★ 最高优先规则 ★★★
1. lines 数组**绝对不能为空**。即使只能识别到一个总金额，也必须输出至少1行。
2. 若无法逐行提取明细，必须创建"汇总行"：用 total_gross 作为 gross_amount，name 设为单据类型描述。
3. 每行的 gross_amount 不能为 0（除非是折扣行）。若 unit_price 未知，从 gross_amount/qty 反算。

【第一步：识别单据类型，确定勘定科目】
先判断单据属于哪种类型，这决定了 category 和 suggested_account：

■ 超市/便利店（スーパー/コンビニ）→ category=expense
  - 食品/饮料 → 福利厚生費（社内用）or 会議費（会议用）or 交際費（招待用）
  - 日用品/文具 → 消耗品費
  - 默认 → 消耗品費
■ 出租车（タクシー）→ category=expense, suggested_account=旅費交通費
  - 明细行：运费/迎车费/高速代 等
  - 若只有总额：创建1行 name="タクシー代"
■ 停车场（駐車場/パーキング）→ category=expense, suggested_account=旅費交通費
  - 创建1行 name="駐車料金"
■ 铁道/巴士（JR/電車/バス/地下鉄/新幹線）→ category=expense, suggested_account=旅費交通費
  - 明细行：区间名/运费
  - 若只有总额：创建1行 name="交通費" + 区间信息
■ 餐厅/居酒屋/咖啡店 → category=expense
  - 若有"会議"暗示 → 会議費
  - 若有"接待/懇親"暗示 → 交際費
  - 默认 → 福利厚生費（社内饮食）
  - 明细行：各料理/饮品
  - 若只有总额：创建1行 name="飲食代"
■ 邮局/快递（郵便局/ゆうパック/宅急便/ヤマト/佐川）→ category=expense
  - 邮票/信件 → 通信費
  - 包裹/快递 → 荷造運賃
■ 加油站（ガソリンスタンド/GS）→ category=expense, suggested_account=旅費交通費
■ 酒店/住宿（ホテル/旅館/宿泊）→ category=expense, suggested_account=旅費交通費
  - 住宿费 → 旅費交通費
  - 餐费 → 会議費/交際費
■ 商店/购物（百貨店/ドラッグストア/家電量販店）→ category=expense
  - 药品 → 福利厚生費
  - 办公用品/文具 → 消耗品費
  - 电子设备（<10万円）→ 消耗品費
  - 电子设备（>=10万円）→ 工具器具備品
■ 采购/进货（仕入/卸売/業務用）→ category=purchase, suggested_account=仕入高
■ 请求书/发票（請求書/納品書）→ 根据内容判断 category
  - 外包/开发/设计 → 外注費
  - 广告/推广 → 広告宣伝費
  - 保险/保修 → 保険料
  - 租金/物业 → 賃借料
  - 通信/网络 → 通信費
  - 水电气 → 水道光熱費
■ 无法判断 → category=expense, suggested_account=雑費

【第二步：抽取开票方信息】
issuer:
- issuer_name：商号/店名/公司名（注意：日文汉字要准确识别，例如"奈良漬"不要误读为"不良漬"）
- invoice_reg_no：T+13位数字。找不到则输出 "0000000000000"
- issuer_tel、issuer_address：能识别则填，否则 null

【第三步：抽取合计与税率信息】
totals_on_doc:
- total_gross：合計/総合計/請求金額/お会計/領収金額（税込总额）
- total_tax：消費税/税額/内消費税
- by_rate：按税率分组（8%/10%/exempt），抽取各税率的 net/tax/gross

税率判定：
- 食品/饮料（酒类除外）→ 8%（軽減税率）
- 外食/酒类/日用品/服务费 → 10%（標準税率）
- 出租车/停车/铁道/住宿/餐厅服务 → 10%
- 邮票(84円/63円等定额)→ exempt（非課税）
- 带 ※/＊/軽 标记 → 8%
- 带 標 标记 → 10%
- 无法判断 → 默认 10%（服务类）或 8%（商品类）

【第四步：抽取明细行（最重要！）】
lines 数组中每行必须包含：
- line_no, name, tax_rate, net_amount, tax_amount, gross_amount
- amount_source, qty, unit_price, suggested_account, raw

提取规则：
A) 有明细的单据（超市/便利店/请求书等）→ 逐行提取每个商品/项目
B) 无明细或明细模糊的单据（出租车/停车/铁道等）→ 创建汇总行：
   - name = 单据类型描述（如"タクシー代"/"駐車料金"/"乗車券"）
   - gross_amount = total_gross
   - 用税率推导 net_amount 和 tax_amount
C) 混合情况 → 能提取的逐行提取，不能的汇总为1行

金额推导（每行必须执行）：
1) 若同时有税抜和税込 → net_amount=税抜, gross_amount=税込, tax=gross-net
2) 若只有 gross_amount → net=round(gross/(1+rate)), tax=gross-net, amount_source="gross->net_by_rate"
3) 若只有 net_amount → tax=round(net*rate), gross=net+tax, amount_source="net->tax_by_rate"
4) exempt → tax=0, gross=net
5) unit_price 必须有值：若未直接出现，则 unit_price = gross_amount / qty

【第五步：交叉验证】
validation:
A) 行合计 vs total_gross（容差 ±2 JPY）
B) 税额合计 vs total_tax（容差 ±2 JPY）
C) 若不匹配，在 mismatches 中说明原因

【完整会计科目对照表（勘定科目）】
expense 类：
- 旅費交通費：タクシー/電車/バス/新幹線/飛行機/駐車場/高速代/出張/交通費/IC
- 会議費：会議/打合せ/ミーティング用飲食（1人5000円以下参考）
- 交際費：接待/贈答/お土産/懇親/取引先飲食
- 通信費：通信/携帯/電話/インターネット/回線/切手/はがき/郵便
- 荷造運賃：宅急便/宅配/ゆうパック/送料/配送
- 水道光熱費：電気/ガス/水道
- 消耗品費：消耗品/文房具/日用品/事務用品/コピー用紙/電池/USB
- 広告宣伝費：広告/宣伝/Google/Meta/販促/チラシ/看板
- 支払手数料：手数料/振込手数料/決済手数料
- 賃借料：家賃/賃料/レンタル/駐車場月極
- 福利厚生費：社内飲食/社内イベント/健康診断/薬/ドラッグストア
- 保険料：保険/損害保険/火災保険
- 雑費：上記に当てはまらないもの/修理/修繕/メンテナンス/ガソリン/軽油/洗車/車検/ETC/書籍/雑誌/新聞/電子書籍/研修/セミナー/講座/資格（confidence低め）

purchase 類：
- 仕入高（默认）
- 原材料費：原材料/材料/部品
- 外注費：外注/業務委託/開発/制作/デザイン
- 荷造運賃：送料/配送/運賃

sale 類：
- 売上高（默认）

【输出JSON格式】
{
  "currency": "JPY",
  "document": {
    "doc_type": "receipt|invoice|unknown",
    "doc_date": "YYYY-MM-DD|null",
    "category": "purchase|sale|expense"
  },
  "issuer": {
    "issuer_name": "string|null",
    "invoice_reg_no": "T1234567890123|0000000000000",
    "issuer_tel": "string|null",
    "issuer_address": "string|null"
  },
  "totals_on_doc": {
    "total_gross": 0,
    "total_tax": 0,
    "by_rate": {
      "10%": { "net": 0, "tax": 0, "gross": 0, "source": "on_doc|derived" },
      "8%":  { "net": 0, "tax": 0, "gross": 0, "source": "on_doc|derived" },
      "exempt": { "net": 0, "tax": 0, "gross": 0, "source": "on_doc|derived" }
    }
  },
  "lines": [
    {
      "line_no": 1,
      "name": "string",
      "tax_rate": "10%|8%|exempt",
      "net_amount": 0,
      "tax_amount": 0,
      "gross_amount": 0,
      "amount_source": "all_on_doc|net+tax=gross|gross->net_by_rate|net->tax_by_rate",
      "qty": 1,
      "unit_price": 0,
      "suggested_account": "勘定科目名",
      "suggested_account_code": null,
      "suggested_account_confidence": 0.9,
      "raw": "原文片段"
    }
  ],
  "validation": {
    "checks": [
      { "name": "line_vs_total", "status": "pass|fail", "details": "string" },
      { "name": "tax_check", "status": "pass|fail", "details": "string" }
    ],
    "mismatches": []
  },
  "notes": []
}

【强制约束（违反任何一条视为失败）】
1. lines 数组不能为空！最少1行。无明细时用 total_gross 创建汇总行。
2. 每行 gross_amount > 0（折扣行除外）。
3. 每行必须有 suggested_account（日文勘定科目名）。
4. invoice_reg_no 缺失时输出 "0000000000000"。
5. 税率缺失时根据单据类型默认（服务类10%，商品类8%）。
6. 只输出JSON，不要markdown，不要解释。'''

# BANK STATEMENT PROMPT - For bank passbook / statement OCR
PROMPT_BANK_STATEMENT = '''あなたは日本の銀行通帳（普通預金通帳）の読み取り専門AIです。
画像から以下の情報をJSON形式で正確に抽出してください。

【通帳フォーマットの自動判定】
日本の通帳には主に2つのレイアウトがあります。画像を見て自動判定すること：

■ フォーマットA（摘要型）— メガバンク・地銀に多い:
  年月日 | 摘要 | お支払金額(出金) | お預り金額(入金) | 差引残高 | 備考
  - 備考欄に店番号(例:983,441)やコード(CFS等)

■ フォーマットB（記号型）— ゆうちょ銀行・一部地銀:
  年月日 | 摘要(お客様メモ) | お支払金額(出金) | お預り金額(入金) | 差引残高 | 記号・店番号
  - 出金/入金列の下に補足テキスト（振込人名・取引先名など）が印字される
  - 記号列に RT, LT, QT, KT+店番号(例:KT537) などが記載される
  - 残高は特定行にのみ ★数値★ の形式で印字される（全行にはない）

【★★★ 出金/入金の判定ルール（列位置で判定・絶対遵守）★★★】
⚠️ 取引種類名（振込、為替手数料等）で出金/入金を推測してはいけない！
⚠️ ★数値の物理的な列位置のみで判定すること：
- お支払金額列（左側の金額列）に★数値 → withdrawal
- お預り金額列（右側の金額列）に★数値 → deposit
- 各行に金額は1つだけ（出金か入金のどちらか一方のみ）
- テキスト（カタカナ名等）は金額ではない → description の補足

【金額とテキストの分離ルール（絶対遵守）】
- ★に続く数値（例: ★220, ★317,360）= 金額 → withdrawal または deposit フィールドに数値として格納
- カタカナ/漢字テキスト（例: フカヤ モエカ, フリコミ テスウリヨウ）= 摘要の補足 → description に結合
- description = 摘要欄のテキスト + 金額欄に印字されたテキスト部分
- 金額欄の★数値は description に含めない（計算用フィールドのみ）

【フォーマットBの補足テキスト抽出ルール（★最重要★）】
通帳の各行において、金額欄にテキストが印字されている場合、それは金額ではなく摘要の補足：
    摘要          | お支払        | お預り              | 残高        | 記号
例1: 為替手数料   | ★220         | フリコミ テスウリヨウ |             | RT
     → description="為替手数料 フリコミ テスウリヨウ", withdrawal=220, deposit=0
     （★220はお支払列→出金。フリコミ テスウリヨウはテキスト→descriptionに結合）

例2: 振込IB2      |★317,360      | フカヤ モエカ        |             | RT
     → description="振込IB2 フカヤ モエカ", withdrawal=317360, deposit=0
     （★317,360はお支払列→出金。フカヤ モエカはテキスト→descriptionに結合）
     ⚠️ 注意: 同じ「振込」でもお預り列に金額がある場合はdepositになる。列位置で判定！

例3: 口座振替3    |★209,937      | エムアイカート゛      | ★2,647,130★ | RT537
     → description="口座振替3 エムアイカート゛", withdrawal=209937, deposit=0, balance=2647130, reference="RT537"

例4: 振込2        |              | ★3,357,059          |              | LT537
     → description="振込2", withdrawal=0, deposit=3357059
     （★3,357,059はお預り列→入金）

例5: 合計記帳     |              | ★1,000,000          |              | QT
                  |              | 19ケン               |              |
     → description="合計記帳 (19件)", withdrawal=0, deposit=1000000
  ★ 補足テキスト（カタカナ名、取引件数など）は必ず description に含めること！

【出金/入金の検算ルール】
残高が印字されている行で、前の残高 + 入金 - 出金 ≒ 現在の残高 となることを検算。
合わない場合は出金/入金の列判定が間違っている → 修正してから出力すること。

【残高の取り扱い】
- ★マーク付き残高（例: ★2,857,067★ や ¥3,142,880★）→ ★¥を除去して数値のみ抽出
- 残高が印字されている行: balance = 数値
- 残高が印字されていない行: balance = null
- balance_start: 最初のページの最初の残高（取引前）
- balance_end: 最後のページの最後の残高（取引後）

【出力フォーマット（JSON only, no markdown）】:
{
  "bank_name": "銀行名",
  "branch_name": "支店名",
  "account_type": "普通 or 当座",
  "account_number": "口座番号",
  "account_holder": "口座名義人",
  "statement_period": "対象期間（例：2025/11/01〜2025/11/30）",
  "balance_start": 期首残高（数値）,
  "balance_end": 期末残高（数値）,
  "transactions": [
    {
      "seq": 連番（1から開始、通帳の印字順）,
      "date": "通帳に印字されたまま（例: 06-1223, 7-12-8）",
      "description": "摘要＋補足テキスト（振込人名など）を結合した文字列",
      "withdrawal": 出金額（数値、0なら0）,
      "deposit": 入金額（数値、0なら0）,
      "balance": 残高（数値、印字されていればその値、なければnull）,
      "reference": "記号・店番号（RT, LT, QT, KT537等。なければ空文字）"
    }
  ]
}

【★★★ 順序に関する絶対ルール ★★★】
- 画像に印字された順序（上から下、ページ順）で出力すること
- 絶対に日付でソートしないこと！通帳の物理的な印字順 = 正しい順序
- seq は1から始めて、通帳の印字順に連番を振る

【重要な注意事項】
- ⚠️ 差引残高と備考/記号は別々の列。絶対に結合しないこと！
- ⚠️ 日付は通帳に印字された形式のまま出力（自分で西暦変換しない）
  例: 通帳に「06-1223」→ "date": "06-1223"（そのまま）
  ※ 令和→西暦の変換はシステム側で自動処理
- 金額のカンマは除去して数値で返す
- 入金はdeposit、出金はwithdrawal
- ★マーク付き残高は★¥を除去して数値のみ
- 合計記帳の場合、件数（例:19ケン→19件）をdescriptionに含める

【★★★ 出力前の自己検証（必ず実行）★★★】
各取引行について以下3点を確認し、違反があれば修正してから出力すること：

1. description に補足テキストが含まれているか？
   ❌ "振込IB2" — 補足テキスト（振込人名）が欠落している！
   ✅ "振込IB2 フカヤ モエカ" — 補足テキストが結合されている
   ❌ "為替手数料" — 補足テキスト欠落！
   ✅ "為替手数料 フリコミ テスウリヨウ" — 正しい

2. reference にカタカナ名が混入していないか？
   ❌ reference="RT フカヤ モエカ" — 補足テキストが reference に誤混入！
   ✅ reference="RT", description="振込IB2 フカヤ モエカ"
   ❌ reference="RT537 フリコミ テスウリヨウ" — 誤り！
   ✅ reference="RT537", description="為替手数料 フリコミ テスウリヨウ"

3. reference には記号コード（RT/LT/QT/KT）＋店番号（数字のみ）以外を入れない
   正しい例: "RT", "RT537", "LT537", "QT", "KT537"

JSONのみを返す（説明文不要）'''


# ============== LIFESPAN ==============

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage database connection pool lifecycle"""
    global db_pool
    try:
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
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
                    file_size_bytes INTEGER,
                    prompt_version VARCHAR(10)
                )
            ''')
            # Add prompt_version column if not exists
            await conn.execute('''
                DO $$
                BEGIN
                    ALTER TABLE ocr_requests ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(10);
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            ''')
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        db_pool = None

    yield

    if db_pool:
        await db_pool.close()


# ============== APP ==============

app = FastAPI(
    title="Central OCR Service",
    description="Centralized OCR service with backward compatible parameter support (output_level + prompt_version)",
    version="1.4.1",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== MODELS ==============

class OCRRequest(BaseModel):
    image_data: str  # Base64 encoded
    mime_type: str = 'image/jpeg'
    prompt_version: Optional[Literal['fast', 'full']] = None  # Legacy parameter
    output_level: Optional[Literal['summary', 'accounting', 'bank_statement']] = None
    template_fields: List[str] = []
    tenant_id: str = 'default'

    def get_prompt_mode(self) -> str:
        """Get normalized prompt mode with priority: output_level > prompt_version > default"""
        if self.output_level:
            mapping = {
                'summary': 'fast',
                'accounting': 'full',
                'bank_statement': 'bank_statement',
            }
            return mapping[self.output_level]
        elif self.prompt_version:
            # Use legacy parameter directly
            return self.prompt_version
        else:
            # Default to fast mode (summary)
            return 'fast'


class OCRResponse(BaseModel):
    success: bool
    extracted: Optional[Dict[str, Any]] = None
    raw_response: Optional[str] = None
    error_code: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None
    prompt_version: Optional[str] = None
    processing_time_ms: Optional[int] = None


class UsageResponse(BaseModel):
    tenant_id: str
    year_month: str
    image_count: int
    free_remaining: int
    billable_count: int
    total_cost: float


# ============== AUTH ==============

async def verify_service_key(x_service_key: Optional[str] = Header(None)):
    if SERVICE_KEY and x_service_key != SERVICE_KEY:
        raise HTTPException(status_code=401, detail="Invalid service key")
    return True


# ============== CORE ==============

def extract_json_from_text(text: str) -> dict:
    """Extract JSON from text response"""
    # Try markdown code block
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON from code block: {e}")

    # Try raw JSON (Gemini JSON mode returns plain JSON)
    try:
        # Gemini with responseMimeType='application/json' returns plain JSON
        parsed = json.loads(text)
        logger.info(f"[DEBUG] Successfully parsed JSON directly")
        return parsed
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse raw JSON: {e}")
        # Fallback: try to extract JSON from text
        try:
            start = text.find('{')
            end = text.rfind('}') + 1
            if start != -1 and end > start:
                extracted_json = text[start:end]
                logger.info(f"[DEBUG] Extracted JSON substring from {start} to {end}")
                return json.loads(extracted_json)
        except json.JSONDecodeError as e2:
            logger.error(f"Failed to parse extracted JSON: {e2}")

    logger.error(f"All JSON extraction methods failed, returning raw_text")
    return {'raw_text': text}


async def call_gemini_api(
    image_data: str,
    mime_type: str,
    prompt_version: str = 'fast'
) -> Dict[str, Any]:
    """Call Gemini API with fast, full, or bank_statement prompt"""
    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY not configured")
        return {'success': False, 'error_code': 'service_error'}

    url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}'

    # Select prompt and config based on version
    if prompt_version == 'fast':
        prompt = PROMPT_FAST
        config = {
            'temperature': 0,
            'maxOutputTokens': 2048,
            'responseMimeType': 'application/json',
        }
        timeout = 30
    elif prompt_version == 'bank_statement':
        prompt = PROMPT_BANK_STATEMENT
        config = {
            'temperature': 0,
            'maxOutputTokens': 4096,
            'responseMimeType': 'application/json',
        }
        timeout = 90
    else:
        prompt = PROMPT_FULL
        config = {
            'temperature': 0,
            'maxOutputTokens': 4096,
            'responseMimeType': 'application/json',
        }
        timeout = 90

    payload = {
        'contents': [{
            'parts': [
                {'inline_data': {'mime_type': mime_type, 'data': image_data}},
                {'text': prompt}
            ]
        }],
        'generationConfig': config
    }

    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={'Content-Type': 'application/json'}
                )

            if response.status_code == 429:
                wait_time = (attempt + 1) * 3
                logger.warning(f"Rate limited, waiting {wait_time}s")
                await asyncio.sleep(wait_time)
                continue

            if response.status_code != 200:
                logger.error(f"Gemini API error: {response.status_code} - {response.text[:200]}")
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
            logger.info(f"[DEBUG] Gemini raw_text (first 500 chars): {raw_text[:500]}")
            extracted = extract_json_from_text(raw_text)
            logger.info(f"[DEBUG] Extracted keys: {list(extracted.keys())}")
            logger.info(f"[DEBUG] Extracted data: {extracted}")

            return {
                'success': True,
                'extracted': extracted,
                'raw_response': raw_text,
            }

        except httpx.TimeoutException:
            logger.warning(f"Timeout on attempt {attempt + 1}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2)
                continue
            return {'success': False, 'error_code': 'timeout'}
        except Exception as e:
            logger.exception(f"Gemini API error: {e}")
            return {'success': False, 'error_code': 'service_error'}

    return {'success': False, 'error_code': 'max_retries'}


async def update_usage(
    tenant_id: str,
    success: bool,
    processing_time_ms: int,
    file_size: int,
    prompt_version: str = 'fast'
):
    """Update usage tracking"""
    if not db_pool:
        return None

    year_month = datetime.now().strftime('%Y-%m')

    try:
        async with db_pool.acquire() as conn:
            await conn.execute('''
                INSERT INTO ocr_requests (tenant_id, success, processing_time_ms, file_size_bytes, prompt_version)
                VALUES ($1, $2, $3, $4, $5)
            ''', tenant_id, success, processing_time_ms, file_size, prompt_version)

            if success:
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


# ============== ENDPOINTS ==============

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "1.5.0",
        "prompts": ["fast", "full", "bank_statement"],
        "parameters": {
            "legacy": ["prompt_version"],
            "current": ["output_level"],
            "mapping": {
                "output_level=summary": "prompt_version=fast",
                "output_level=accounting": "prompt_version=full",
                "output_level=bank_statement": "bank_statement"
            }
        },
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/v1/ocr/process", response_model=OCRResponse)
async def process_ocr(
    request: OCRRequest,
    _: bool = Depends(verify_service_key)
):
    """Process OCR request with fast or full prompt (supports both legacy and new parameters)"""
    start_time = time.time()
    file_size = len(request.image_data) * 3 // 4

    # Get normalized prompt mode (handles both output_level and prompt_version)
    prompt_mode = request.get_prompt_mode()

    logger.info(f"OCR request from {request.tenant_id}, output_level={request.output_level}, prompt_version={request.prompt_version}, resolved_mode={prompt_mode}")

    result = await call_gemini_api(
        request.image_data,
        request.mime_type,
        prompt_mode
    )

    processing_time_ms = int((time.time() - start_time) * 1000)
    logger.info(f"OCR completed in {processing_time_ms}ms, mode={prompt_mode}, success={result.get('success')}")

    usage = await update_usage(
        request.tenant_id,
        result.get('success', False),
        processing_time_ms,
        file_size,
        prompt_mode
    )

    if result.get('success'):
        return OCRResponse(
            success=True,
            extracted=result.get('extracted'),
            raw_response=result.get('raw_response'),
            usage=usage,
            prompt_version=prompt_mode,  # Return resolved mode
            processing_time_ms=processing_time_ms
        )
    else:
        return OCRResponse(
            success=False,
            error_code=result.get('error_code', 'processing_failed'),
            prompt_version=prompt_mode,  # Return resolved mode
            processing_time_ms=processing_time_ms
        )


@app.get("/api/v1/usage/{tenant_id}", response_model=UsageResponse)
async def get_usage(
    tenant_id: str,
    year_month: Optional[str] = None,
    _: bool = Depends(verify_service_key)
):
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
