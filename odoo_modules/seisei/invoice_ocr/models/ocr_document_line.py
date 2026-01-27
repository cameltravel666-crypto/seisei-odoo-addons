from odoo import models, fields, api

# 日本会计科目（借方 - 费用类）
DEBIT_ACCOUNTS = [
    ('shiire', '仕入高（进货成本）'),
    ('shoumouhin', '消耗品費（消耗品费）'),
    ('jimu', '事務用品費（办公用品费）'),
    ('kousai', '交際費（交际费）'),
    ('fukuri', '福利厚生費（福利费）'),
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

# 商品关键词 -> 科目映射
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
    
    # 福利费
    '飲料': 'fukuri', 'コーヒー': 'fukuri', 'お茶': 'fukuri',
    
    # CD/书籍等
    'CD': 'zappi', 'DVD': 'zappi', '本': 'zappi', 'ブック': 'zappi',
    
    # 其他消耗品
    'カード': 'shoumouhin', 'セット': 'shoumouhin',
    'ハンカチ': 'shoumouhin', 'ブランケット': 'shoumouhin',
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
    unit_price = fields.Float('单价', digits=(16, 2))
    amount = fields.Float('金额', digits=(16, 2))
    tax_rate = fields.Char('税率')
    note = fields.Char('备注')
    
    # 会计科目
    debit_account = fields.Selection(DEBIT_ACCOUNTS, '借方科目')
    credit_account = fields.Selection(CREDIT_ACCOUNTS, '贷方科目', default='genkin')
    
    @api.model
    def create(self, vals):
        """创建时自动推断借方科目"""
        record = super().create(vals)
        if not record.debit_account and record.name:
            record.debit_account = record._guess_debit_account()
        return record
    
    def _guess_debit_account(self):
        """根据商品名称推断借方科目"""
        if not self.name:
            return 'zappi'
        
        name = self.name
        
        # 检查关键词
        for keyword, account in KEYWORD_ACCOUNT_MAP.items():
            if keyword in name:
                return account
        
        # 默认归类为杂费
        return 'zappi'
    
    def action_auto_classify(self):
        """批量自动分类"""
        for record in self:
            record.debit_account = record._guess_debit_account()
