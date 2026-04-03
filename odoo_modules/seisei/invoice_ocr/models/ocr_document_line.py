import math

from odoo import models, fields, api

TAX_RATES = [
    ('0', 'Tax-exempt'),
    ('8', '8% (Reduced)'),
    ('10', '10%'),
]

# 商品关键词 -> 科目code映射 (lowest priority fallback)
KEYWORD_ACCOUNT_MAP = {
    # 食材类 -> 仕入高
    '牛肉': 'shiire', '豚肉': 'shiire', '鶏肉': 'shiire', '肉': 'shiire',
    '魚': 'shiire', '野菜': 'shiire', '米': 'shiire', '食材': 'shiire',
    '調味料': 'shiire', '油': 'shiire', '醤油': 'shiire', '塩': 'shiire',
    '仕入': 'shiire', '一括仕入': 'shiire',
    # 食材 (追加)
    '餃子': 'shiire', '味噌': 'shiire', '豆板醤': 'shiire', 'ラー油': 'shiire',
    'だし': 'shiire', '醤': 'shiire', '麺': 'shiire', 'スープ': 'shiire',
    'たれ': 'shiire', 'つゆ': 'shiire', '酢': 'shiire', '味醂': 'shiire',
    'みりん': 'shiire', '砂糖': 'shiire', '小麦粉': 'shiire', '片栗粉': 'shiire',
    'マヨネーズ': 'shiire', 'ケチャップ': 'shiire', 'ソース': 'shiire',
    '海苔': 'shiire', 'わかめ': 'shiire', '豆腐': 'shiire', '納豆': 'shiire',
    '卵': 'shiire', 'たまご': 'shiire', '牛乳': 'shiire', 'バター': 'shiire',
    'チーズ': 'shiire', '生クリーム': 'shiire',
    # 消耗品
    '割りばし': 'shoumouhin', 'はし': 'shoumouhin', '箸': 'shoumouhin',
    'ナプキン': 'shoumouhin', '紙': 'shoumouhin', 'ラップ': 'shoumouhin',
    '洗剤': 'shoumouhin', 'ゴミ袋': 'shoumouhin', '袋': 'shoumouhin',
    'カード': 'shoumouhin', 'セット': 'shoumouhin',
    # 办公用品
    'ペン': 'jimu', 'ノート': 'jimu', 'ファイル': 'jimu',
    'コピー': 'jimu', '印刷': 'jimu', '文具': 'jimu',
    # 交际费
    '贈答': 'kousai', 'ギフト': 'kousai', 'お歳暮': 'kousai',
    # 会议费 (饮食类)
    '飲料': 'kaigi', 'コーヒー': 'kaigi', 'お茶': 'kaigi',
    '飲食': 'kaigi', '飲食代': 'kaigi',
    # 旅費交通費 (交通・駐車)
    '運賃': 'ryohi', 'タクシー': 'ryohi', '交通': 'ryohi',
    '駐車料金': 'ryohi', '駐車場': 'ryohi', 'パーキング': 'ryohi',
    'チャージ': 'ryohi', '定期券': 'ryohi', 'きっぷ': 'ryohi',
    '乗車券': 'ryohi', '回数券': 'ryohi', '手配料金': 'ryohi',
    '高速代': 'ryohi', 'ETC': 'ryohi', 'ガソリン': 'sharyou',
    '軽油': 'sharyou', '給油': 'sharyou',
    # 保険料
    '保険料': 'hoken', '損害保険': 'hoken',
    # 租税公課
    '納税': 'sozei', '本税': 'sozei', '法人税': 'sozei',
    '住民税': 'sozei', '印紙': 'sozei', '固定資産税': 'sozei',
    # 通信費
    'ご請求分': 'tsuushin', '通信料': 'tsuushin', '電話代': 'tsuushin',
    # 水道光熱費
    '電気代': 'suido', 'ガス代': 'suido', '水道代': 'suido',
    # 荷造運賃
    '配送料': 'nizukuri', '送料': 'nizukuri', '宅急便': 'nizukuri',
    'ゆうパック': 'nizukuri', '郵便': 'nizukuri', '宅配便': 'nizukuri',
    # 修繕費
    '修理': 'shuuzen', '修繕': 'shuuzen',
}


# 発行者名キーワード -> 科目code映射 (seller name pattern matching)
SELLER_KEYWORD_MAP = {
    # 駐車場 -> 旅費交通費
    'パーキング': 'ryohi', 'パーク': 'ryohi', 'リパーク': 'ryohi',
    '駐車': 'ryohi', 'カーマックス': 'ryohi',
    # 鉄道・交通 -> 旅費交通費
    '鉄道': 'ryohi', 'メトロ': 'ryohi', '地下鉄': 'ryohi',
    '交通': 'ryohi', 'タクシー': 'ryohi',
    # 保険 -> 保険料
    '損害保険': 'hoken', '火災保険': 'hoken', '生命保険': 'hoken',
    # ホームセンター -> 消耗品費
    'ホームセンター': 'shoumouhin', 'コーナン': 'shoumouhin',
    'カインズ': 'shoumouhin', 'ビバホーム': 'shoumouhin',
    'DEPO': 'shoumouhin', '建デポ': 'shoumouhin', 'ドイト': 'shoumouhin',
    # 100円ショップ -> 消耗品費
    'ダイソー': 'shoumouhin', 'DAISO': 'shoumouhin', 'セリア': 'shoumouhin',
    # スーパー/食品 -> 仕入高
    'スーパー': 'shiire', '業務スーパー': 'shiire', 'ベルクス': 'shiire',
    'コモディ': 'shiire', '赤札堂': 'shiire', '肉のハナマサ': 'shiire',
    # 食品卸/米穀 -> 仕入高
    '米穀': 'shiire', '食品': 'shiire', '青果': 'shiire', '水産': 'shiire',
    '精肉': 'shiire', '鮮魚': 'shiire', '製麺': 'shiire',
    '日栄商事': 'shiire',
    # 郵便/宅配 -> 荷造運賃
    '郵便': 'nizukuri', 'ゆうパック': 'nizukuri',
    'ヤマト': 'nizukuri', '佐川': 'nizukuri', 'クロネコ': 'nizukuri',
    'SAGAWA': 'nizukuri',
    # 電気・通信 -> 通信費
    'NTT': 'tsuushin',
    # 厨房用品 -> 消耗品費
    'テンポス': 'shoumouhin', 'TENPOS': 'shoumouhin',
    'キッチンワールド': 'shoumouhin',
    # ガソリンスタンド -> 車両費
    'ガソリン': 'sharyou', 'エネオス': 'sharyou', 'ENEOS': 'sharyou',
    'コスモ石油': 'sharyou', '出光': 'sharyou', 'apollo': 'sharyou',
    # ドラッグストア/薬局 -> 消耗品費
    'マツモトキヨシ': 'shoumouhin', 'ウエルシア': 'shoumouhin',
    '薬局': 'shoumouhin', 'ドラッグ': 'shoumouhin',
    # WORKMAN/作業着 -> 消耗品費
    'WORKMAN': 'shoumouhin', 'ワークマン': 'shoumouhin',
    # 家電量販店 -> 消耗品費
    'ヨドバシ': 'shoumouhin', 'ヤマダデンキ': 'shoumouhin', 'ビック': 'shoumouhin',
    # Amazon -> 消耗品費 (default, items vary)
    'アマゾン': 'shoumouhin', 'amazon': 'shoumouhin',
    # ニトリ/家具 -> 消耗品費
    'ニトリ': 'shoumouhin',
}


def _resolve_account(env, code, account_type):
    """Resolve an account code to an ocr.account record id."""
    if not code:
        return False
    account = env['ocr.account'].search([
        ('code', '=', code),
        ('account_type', '=', account_type),
        ('active', '=', True),
    ], limit=1)
    return account.id if account else False


class OcrDocumentLine(models.Model):
    _name = 'ocr.document.line'
    _description = 'OCR Document Line'
    _order = 'sequence, id'

    document_id = fields.Many2one('ocr.document', 'Document', required=True, ondelete='cascade')
    sequence = fields.Integer('Sequence', default=10)
    name = fields.Char('Item Name')
    quantity = fields.Float('Quantity', digits=(16, 2), default=1)
    unit = fields.Char('Unit')

    # --- Tax-split amounts ---
    gross_amount = fields.Float('Gross Amount', digits=(16, 2))
    tax_rate = fields.Selection(TAX_RATES, 'Tax Rate', default='10')
    net_amount = fields.Float('Net Amount', digits=(16, 2), compute='_compute_amounts', store=True)
    tax_amount = fields.Float('Tax Amount', digits=(16, 2), compute='_compute_amounts', store=True)

    # 会計科目 (Many2one to configurable master)
    debit_account = fields.Many2one(
        'ocr.account', 'Debit Account',
        domain=[('account_type', '=', 'debit'), ('active', '=', True)],
    )
    credit_account = fields.Many2one(
        'ocr.account', 'Credit Account',
        domain=[('account_type', '=', 'credit'), ('active', '=', True)],
    )

    # OCR snapshot (for learning: detect user corrections)
    ocr_debit_account = fields.Many2one(
        'ocr.account', 'OCR Debit', readonly=True,
        domain=[('account_type', '=', 'debit')],
    )
    ocr_credit_account = fields.Many2one(
        'ocr.account', 'OCR Credit', readonly=True,
        domain=[('account_type', '=', 'credit')],
    )

    # 弥生摘要
    memo = fields.Char('Memo', compute='_compute_memo', store=True)
    note = fields.Char('Notes')

    @api.depends('gross_amount', 'tax_rate')
    def _compute_amounts(self):
        for line in self:
            rate = int(line.tax_rate or '0')
            gross = line.gross_amount or 0
            if rate > 0 and gross:
                line.tax_amount = math.floor(gross * rate / (100 + rate))
                line.net_amount = gross - line.tax_amount
            else:
                line.tax_amount = 0
                line.net_amount = gross

    @api.depends('name', 'document_id.seller_name')
    def _compute_memo(self):
        for line in self:
            parts = []
            if line.document_id.seller_name:
                parts.append(line.document_id.seller_name)
            if line.name:
                parts.append(line.name)
            line.memo = ' '.join(parts) if parts else ''

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for record in records:
            if not record.debit_account and record.name:
                record.debit_account = record._guess_debit_account()
            # Set default credit if not set
            if not record.credit_account:
                record.credit_account = _resolve_account(
                    self.env, 'genkin', 'credit')
            # Snapshot OCR-assigned accounts
            record.ocr_debit_account = record.debit_account
            record.ocr_credit_account = record.credit_account
        return records

    def _guess_debit_account(self):
        """Guess debit account: learned rules first, then keyword map.
        Returns an ocr.account record or False.
        """
        if not self.name:
            return _resolve_account(self.env, 'zappi', 'debit')

        # 1. Check learned rules (if document has client)
        if self.document_id.client_id:
            Rule = self.env['ocr.account.rule']
            # Item exact match
            rule = Rule.search([
                ('client_id', '=', self.document_id.client_id.id),
                ('match_type', '=', 'item'),
                ('match_value', '=', self.name),
                ('debit_account', '!=', False),
                ('hit_count', '>=', 2),
                ('active', '=', True),
            ], limit=1)
            if rule:
                return rule.debit_account

            # Seller match
            if self.document_id.seller_name:
                rule = Rule.search([
                    ('client_id', '=', self.document_id.client_id.id),
                    ('match_type', '=', 'seller'),
                    ('match_value', '=', self.document_id.seller_name),
                    ('debit_account', '!=', False),
                    ('hit_count', '>=', 2),
                    ('active', '=', True),
                ], limit=1)
                if rule:
                    return rule.debit_account

        # 2. Seller name keyword fallback (catches parking, transit, etc.)
        seller = self.document_id.seller_name or ''
        if seller:
            for keyword, account_code in SELLER_KEYWORD_MAP.items():
                if keyword in seller:
                    return _resolve_account(self.env, account_code, 'debit')

        # 3. Item name keyword fallback
        for keyword, account_code in KEYWORD_ACCOUNT_MAP.items():
            if keyword in self.name:
                return _resolve_account(self.env, account_code, 'debit')

        return _resolve_account(self.env, 'zappi', 'debit')

    def write(self, vals):
        """Detect account changes and trigger real-time learning."""
        account_fields = {'debit_account', 'credit_account'}
        has_account_change = bool(account_fields & set(vals.keys()))

        result = super().write(vals)

        if has_account_change and not self.env.context.get('_skip_realtime_learn'):
            docs_to_learn = self.env['ocr.document']
            for line in self:
                if (line.debit_account != line.ocr_debit_account
                        or line.credit_account != line.ocr_credit_account):
                    line.document_id.has_correction = True
                    docs_to_learn |= line.document_id
            for doc in docs_to_learn:
                if doc.client_id and doc.state in ('done', 'reviewed'):
                    doc.with_context(
                        _skip_realtime_learn=True,
                    )._learn_from_corrections()

        return result

    def action_auto_classify(self):
        for record in self:
            record.debit_account = record._guess_debit_account()
