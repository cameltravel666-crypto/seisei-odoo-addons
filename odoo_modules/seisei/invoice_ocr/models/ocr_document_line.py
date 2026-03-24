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

        # 2. Keyword fallback
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
