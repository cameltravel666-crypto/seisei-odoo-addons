from odoo import models, fields, api

# 日本会计科目（借方 - 费用类）
DEBIT_ACCOUNTS = [
    ('shiire', '仕入高（进货成本）'),
    ('shoumouhin', '消耗品費（消耗品费）'),
    ('jimu', '事務用品費（办公用品费）'),
    ('kousai', '交際費（交际费）'),
    ('kaigi', '会議費（会议费）'),
    ('ryohi', '旅費交通費（交通费）'),
    ('tsuushin', '通信費（通信费）'),
    ('suido', '水道光熱費（水电费）'),
    ('sozei', '租税公課（税费）'),
    ('zappi', '雑費（杂费）'),
]

# 贷方科目（资产/负债类）
CREDIT_ACCOUNTS = [
    ('genkin', '現金（现金）'),
    ('yokin', '普通預金（银行存款）'),
    ('kaikake', '買掛金（应付账款）'),
    ('miharai', '未払金（未付款）'),
    ('card', 'クレジットカード（信用卡）'),
]

TAX_RATES = [
    ('0', '非課税'),
    ('8', '8%（軽減税率）'),
    ('10', '10%'),
]

# 商品关键词 -> 科目映射 (lowest priority fallback)
KEYWORD_ACCOUNT_MAP = {
    # 食材类 -> 仕入高
    '牛肉': 'shiire', '豚肉': 'shiire', '鶏肉': 'shiire', '肉': 'shiire',
    '魚': 'shiire', '野菜': 'shiire', '米': 'shiire', '食材': 'shiire',
    '調味料': 'shiire', '油': 'shiire', '醤油': 'shiire', '塩': 'shiire',
    # 消耗品
    '割りばし': 'shoumouhin', 'はし': 'shoumouhin', '箸': 'shoumouhin',
    'ナプキン': 'shoumouhin', '紙': 'shoumouhin', 'ラップ': 'shoumouhin',
    '洗剤': 'shoumouhin', 'ゴミ袋': 'shoumouhin', '袋': 'shoumouhin',
    # 办公用品
    'ペン': 'jimu', 'ノート': 'jimu', 'ファイル': 'jimu',
    'コピー': 'jimu', '印刷': 'jimu', '文具': 'jimu',
    # 交际费
    '贈答': 'kousai', 'ギフト': 'kousai', 'お歳暮': 'kousai',
    # 会议费 (饮食类)
    '飲料': 'kaigi', 'コーヒー': 'kaigi', 'お茶': 'kaigi',
    '飲食': 'kaigi', '飲食代': 'kaigi',
    # 交通费
    '運賃': 'ryohi', 'タクシー': 'ryohi', '交通': 'ryohi',
    # 其他
    'CD': 'zappi', 'DVD': 'zappi', '本': 'zappi', 'ブック': 'zappi',
    'カード': 'shoumouhin', 'セット': 'shoumouhin',
}


class OcrDocumentLine(models.Model):
    _name = 'ocr.document.line'
    _description = '票据明细行'
    _order = 'sequence, id'

    document_id = fields.Many2one('ocr.document', '票据', required=True, ondelete='cascade')
    sequence = fields.Integer('序号', default=10)
    name = fields.Char('商品名称')
    quantity = fields.Float('数量', digits=(16, 2), default=1)
    unit = fields.Char('单位')

    # --- Tax-split amounts ---
    gross_amount = fields.Float('税込金額', digits=(16, 2))
    tax_rate = fields.Selection(TAX_RATES, '税率', default='10')
    net_amount = fields.Float('税抜金額', digits=(16, 2), compute='_compute_amounts', store=True)
    tax_amount = fields.Float('消費税額', digits=(16, 2), compute='_compute_amounts', store=True)

    # 会计科目
    debit_account = fields.Selection(DEBIT_ACCOUNTS, '借方科目')
    credit_account = fields.Selection(CREDIT_ACCOUNTS, '贷方科目', default='genkin')

    # OCR snapshot (for learning: detect user corrections)
    ocr_debit_account = fields.Selection(DEBIT_ACCOUNTS, '识别借方', readonly=True)
    ocr_credit_account = fields.Selection(CREDIT_ACCOUNTS, '识别贷方', readonly=True)

    # 弥生摘要
    memo = fields.Char('摘要', compute='_compute_memo', store=True)
    note = fields.Char('备注')

    @api.depends('gross_amount', 'tax_rate')
    def _compute_amounts(self):
        for line in self:
            rate = int(line.tax_rate or '0')
            gross = line.gross_amount or 0
            if rate > 0 and gross:
                line.tax_amount = round(gross * rate / (100 + rate))
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
            # Snapshot OCR-assigned accounts
            record.ocr_debit_account = record.debit_account
            record.ocr_credit_account = record.credit_account
        return records

    def _guess_debit_account(self):
        """Guess debit account: learned rules first, then keyword map."""
        if not self.name:
            return 'zappi'

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

        # 2. Keyword fallback
        for keyword, account in KEYWORD_ACCOUNT_MAP.items():
            if keyword in self.name:
                return account

        return 'zappi'

    def action_auto_classify(self):
        for record in self:
            record.debit_account = record._guess_debit_account()
