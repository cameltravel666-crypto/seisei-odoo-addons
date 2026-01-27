import requests
import base64
import logging
import re
from odoo import models, fields, api
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

# OCR 服务地址（优先使用 Docker 服务名，如果不在同一网络则使用主机 IP）
import os
OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://ocr:8868")


class OcrDocument(models.Model):
    _name = 'ocr.document'
    _description = '票据识别'
    _order = 'create_date desc'

    name = fields.Char('名称', required=True, default='新票据')
    image = fields.Binary('票据图片', required=True)
    image_filename = fields.Char('文件名')
    
    doc_type = fields.Selection([
        ('retail_receipt', '零售小票'),
        ('qualified_invoice', '适格请求书'),
        ('vat_invoice', '增值税发票'),
        ('other', '其他'),
    ], string='票据类型', default='other')
    
    state = fields.Selection([
        ('draft', '待识别'),
        ('done', '已识别'),
        ('error', '识别失败'),
    ], string='状态', default='draft')
    
    ocr_result = fields.Text('识别原文')
    invoice_number = fields.Char('发票号码/登录番号')
    invoice_date = fields.Date('开票日期')
    subtotal = fields.Float('小计', digits=(16, 2))
    amount = fields.Float('合计金额', digits=(16, 2))
    tax_amount = fields.Float('税额', digits=(16, 2))
    tax_amount_10 = fields.Float('10%税额', digits=(16, 2))
    tax_amount_8 = fields.Float('8%税额', digits=(16, 2))
    seller_name = fields.Char('开票方/销售方')
    buyer_name = fields.Char('收票方/购买方')
    line_ids = fields.One2many('ocr.document.line', 'document_id', '商品明细')
    account_move_id = fields.Many2one('account.move', '关联账单')
    process_time = fields.Float('处理时间(秒)')
    error_message = fields.Text('错误信息')

    def _parse_amount(self, amt_str):
        if not amt_str:
            return 0
        amt_str = str(amt_str).strip()
        amt_str = re.sub(r'[￥¥\\円]', '', amt_str).strip()
        if re.match(r'^\d{1,3}[.,]\d{3}$', amt_str):
            amt_str = amt_str.replace('.', '').replace(',', '')
        else:
            amt_str = amt_str.replace(',', '').replace(' ', '')
        try:
            return float(amt_str)
        except:
            return 0

    def _detect_doc_type(self, texts):
        full_text = ''.join(texts)
        if '適格請求書' in full_text or '登録番号' in full_text or '登录番号' in full_text:
            return 'qualified_invoice'
        if '請求書' in full_text and '御中' in full_text:
            return 'qualified_invoice'
        if '增值税' in full_text or '发票代码' in full_text:
            return 'vat_invoice'
        return 'retail_receipt'

    def action_recognize(self):
        for record in self:
            if not record.image:
                raise UserError('请先上传票据图片！')
            
            try:
                image_data = base64.b64decode(record.image)
                filename = record.image_filename or 'image.jpg'
                files = {'file': (filename, image_data, 'image/jpeg')}
                
                response = requests.post(
                    f"{OCR_SERVICE_URL}/ocr/invoice",
                    files=files,
                    timeout=120
                )
                
                if response.status_code == 200:
                    result = response.json()
                    
                    if result.get('success'):
                        texts = result.get('texts', [])
                        record.ocr_result = '\n'.join(texts)
                        record.doc_type = record._detect_doc_type(texts)
                        
                        _logger.info(f'票据类型: {record.doc_type}, 原文行数: {len(texts)}')
                        
                        if record.doc_type == 'qualified_invoice':
                            record._extract_qualified_invoice(texts)
                        else:
                            record._extract_retail_receipt(texts)
                        
                        record.state = 'done'
                    else:
                        record.state = 'error'
                        record.error_message = '识别失败'
                else:
                    record.state = 'error'
                    record.error_message = f'API 错误: {response.status_code}'
                    
            except Exception as e:
                record.state = 'error'
                record.error_message = str(e)
                _logger.exception(f'识别异常: {e}')

    def _extract_retail_receipt(self, texts):
        """零售小票提取"""
        full_text = ' '.join(texts)
        
        # 店铺名
        if texts:
            for text in texts[:3]:
                text = text.strip()
                if len(text) > 2 and not text.startswith('20') and not text.isdigit():
                    if not re.match(r'^[\d\s]+$', text):
                        self.seller_name = text
                        break
        
        self._extract_date(full_text)
        
        # 合计
        match = re.search(r'合\s*[計计十]\s*[￥¥\\]?\s*([\d,.\s]+)', full_text)
        if match:
            self.amount = self._parse_amount(match.group(1))
        
        # 小计
        match = re.search(r'小\s*[計计叶]\s*[￥¥\\]?\s*([\d,.]+)', full_text)
        if match:
            self.subtotal = self._parse_amount(match.group(1))
        
        # 消费税
        match = re.search(r'[うち]*消[費费]税\s*[￥¥\\]?\s*([\d,.]+)', full_text)
        if match:
            self.tax_amount = self._parse_amount(match.group(1))
        
        # 提取商品明细
        self._extract_retail_lines(texts)

    def _extract_retail_lines(self, texts):
        """零售小票商品明细"""
        self.line_ids.unlink()
        lines_data = []
        
        skip_words = ['小計', '小计', '小十', '消費税', '消费税', 'うち', 
                      'お預り', 'お釣り', '対象', '对象', 'SHOP', 'shop', 
                      '番号', '年', '月', '日', 'No', '土']
        
        # 总金额关键词（需要特殊处理，不跳过）
        total_keywords = ['合計', '合计', '合十', '总计', '总金额']
        
        _logger.info(f'开始提取明细，共 {len(texts)} 行')
        
        for i, text in enumerate(texts):
            text = text.strip()
            
            # 基本过滤
            if not text or len(text) < 2:
                continue
            
            # 检查是否是总金额行（总金额行不跳过，需要特殊处理）
            is_total_line = any(w in text for w in total_keywords)
            
            # 非总金额行才应用 skip_words 过滤
            if not is_total_line and any(w in text for w in skip_words):
                continue
            if text.isdigit() or re.match(r'^[\d\s.,]+$', text):
                continue
            if re.match(r'^\d+[個組本枚]', text):
                continue
            if re.match(r'^4\d{12}', text):  # 条形码
                continue
            
            # 格式1: "グンティCD ¥1.170" 或 "商品名 ¥金额" 或 "合十 ¥金额"
            match = re.match(r'^(.+?)\s*[￥¥\\]\s*([\d,.]+)$', text)
            if match:
                name = match.group(1).strip()
                amount = self._parse_amount(match.group(2))
                
                # 过滤纯数字或太短的名称
                if len(name) >= 2 and amount > 0 and not name.isdigit():
                    # 检查是否是总金额行（使用之前判断的 is_total_line）
                    if is_total_line:
                        # 总金额行：只设置贷方科目，不设置借方科目
                        _logger.info(f'找到总金额行: {name} = {amount}')
                        lines_data.append({
                            'document_id': self.id,
                            'name': name,
                            'quantity': 1,
                            'amount': amount,
                            'unit_price': amount,
                            'debit_account': False,  # 总金额不显示在借方
                            'credit_account': 'genkin',  # 总金额显示在贷方（现金）
                        })
                    elif not any(w in name for w in skip_words):
                        # 普通商品行：正常处理
                        _logger.info(f'找到商品: {name} = {amount}')
                        lines_data.append({
                            'document_id': self.id,
                            'name': name,
                            'quantity': 1,
                            'amount': amount,
                            'unit_price': amount,
                        })
                continue
            
            # 格式2: 在整个文本中搜索 "商品名 ¥金额" 模式
        
        # 如果逐行没找到，在全文中搜索
        if not lines_data:
            full_text = '\n'.join(texts)
            _logger.info('逐行未找到，尝试全文搜索')
            
            # 匹配片假名/汉字商品名 + ¥金额
            pattern = r'([ァ-ヶー一-龥a-zA-Z\s]{2,}?)\s*[￥¥\\]\s*([\d,.]+)'
            for match in re.finditer(pattern, full_text):
                name = match.group(1).strip()
                amount = self._parse_amount(match.group(2))
                
                # 检查是否是总金额行
                is_total = any(w in name for w in total_keywords)
                
                # 非总金额行才应用 skip_words 过滤
                if not is_total and any(w in name for w in skip_words):
                    continue
                
                if len(name) >= 2 and amount > 0:
                    if is_total:
                        # 总金额行：只设置贷方科目
                        _logger.info(f'全文找到总金额行: {name} = {amount}')
                        lines_data.append({
                            'document_id': self.id,
                            'name': name,
                            'quantity': 1,
                            'amount': amount,
                            'unit_price': amount,
                            'debit_account': False,  # 总金额不显示在借方
                            'credit_account': 'genkin',  # 总金额显示在贷方（现金）
                        })
                    else:
                        # 普通商品行
                        _logger.info(f'全文找到商品: {name} = {amount}')
                        lines_data.append({
                            'document_id': self.id,
                            'name': name,
                            'quantity': 1,
                            'amount': amount,
                            'unit_price': amount,
                        })
        
        _logger.info(f'共找到 {len(lines_data)} 个商品')
        
        # 创建明细
        for i, data in enumerate(lines_data):
            data['sequence'] = (i + 1) * 10
            self.env['ocr.document.line'].create(data)
        
        # 对于零售小票，添加总金额行（只显示在贷方科目）
        if self.doc_type == 'retail_receipt' and self.amount > 0:
            total_line = self.env['ocr.document.line'].create({
                'document_id': self.id,
                'name': '合計',
                'quantity': 1,
                'amount': self.amount,
                'unit_price': self.amount,
                'sequence': 9999,  # 放在最后
                'debit_account': False,  # 总金额不显示在借方
                'credit_account': 'genkin',  # 总金额显示在贷方（现金）
            })
            _logger.info(f'已创建总金额行: {self.amount}')

    def _extract_qualified_invoice(self, texts):
        """适格请求书提取"""
        full_text = ' '.join(texts)
        
        match = re.search(r'登[録录]番号\s*([A-Z0-9\-]+)', full_text, re.IGNORECASE)
        if match:
            self.invoice_number = match.group(1)
        
        patterns = [r'([△▲][△▲][\(（]株[\)）])', r'([○●◎\w]+[\(（]株[\)）])']
        for pattern in patterns:
            match = re.search(pattern, full_text)
            if match:
                self.seller_name = match.group(1)
                break
        
        match = re.search(r'([○●◎]+)\s*御中', full_text)
        if match:
            self.buyer_name = match.group(1)
        
        self._extract_date(full_text)
        
        patterns = [r'合\s*計\s*([\d,.\s]+)\s*円', r'合計\s*([\d,.]+)\s*円']
        for pattern in patterns:
            match = re.search(pattern, full_text)
            if match:
                amt = self._parse_amount(match.group(1))
                if amt > 0:
                    self.amount = amt
                    break
        
        match = re.search(r'消[費费]税\s*([\d,.]+)\s*円', full_text)
        if match:
            self.tax_amount = self._parse_amount(match.group(1))
        
        match = re.search(r'10%\s*[対对]象.*?消[費费]税\s*([\d,.]+)', full_text)
        if match:
            self.tax_amount_10 = self._parse_amount(match.group(1))
        
        match = re.search(r'8%\s*[対对]象.*?消[費费]税\s*([\d,.]+)', full_text)
        if match:
            self.tax_amount_8 = self._parse_amount(match.group(1))
        
        self._extract_jp_invoice_lines(texts)

    def _extract_jp_invoice_lines(self, texts):
        """适格请求书商品明细"""
        self.line_ids.unlink()
        full_text = '\n'.join(texts)
        lines_data = []
        
        skip_words = ['合計', '小計', '消費税', '対象', '对象', '本体', '登録', '月分', '御中', '請求書']
        
        pattern = r'[□○]?月?\d*日?\s*([ぁ-んァ-ン一-龥a-zA-Z]+)\s*(\d+(?:\.\d+)?)\s*(kg|個|組|本|枚)?\s*[※＊]?\s*([\d,.]+)\s*円'
        
        for match in re.finditer(pattern, full_text, re.IGNORECASE):
            name = match.group(1).strip()
            qty_str = match.group(2)
            unit = match.group(3) or ''
            amount_str = match.group(4)
            
            if any(w in name for w in skip_words):
                continue
            
            if len(name) >= 2:
                amount = self._parse_amount(amount_str)
                qty = float(qty_str) if qty_str else 1
                lines_data.append({
                    'document_id': self.id,
                    'name': name,
                    'quantity': qty,
                    'unit': unit,
                    'amount': amount,
                    'unit_price': amount / qty if qty else amount,
                })
        
        for i, data in enumerate(lines_data):
            data['sequence'] = (i + 1) * 10
            self.env['ocr.document.line'].create(data)

    def _extract_date(self, full_text):
        patterns = [
            r'(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日',
            r'(\d{4})[/-](\d{1,2})[/-](\d{1,2})',
        ]
        for pattern in patterns:
            match = re.search(pattern, full_text)
            if match:
                try:
                    year, month, day = match.groups()
                    self.invoice_date = f'{year}-{int(month):02d}-{int(day):02d}'
                    return
                except:
                    pass

    def action_create_bill(self):
        self.ensure_one()
        if self.state != 'done':
            raise UserError('请先完成票据识别！')
        move = self.env['account.move'].create({
            'move_type': 'in_invoice',
            'ref': self.invoice_number or self.name,
            'invoice_date': self.invoice_date,
            'partner_id': self._get_or_create_partner(),
        })
        self.account_move_id = move.id
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'account.move',
            'res_id': move.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def _get_or_create_partner(self):
        if not self.seller_name:
            return False
        partner = self.env['res.partner'].search([('name', '=', self.seller_name)], limit=1)
        if not partner:
            partner = self.env['res.partner'].create({'name': self.seller_name, 'supplier_rank': 1})
        return partner.id

    def action_reset(self):
        self.line_ids.unlink()
        self.write({
            'state': 'draft', 'ocr_result': False, 'doc_type': 'other',
            'invoice_number': False, 'invoice_date': False,
            'amount': 0, 'subtotal': 0, 'tax_amount': 0,
            'tax_amount_10': 0, 'tax_amount_8': 0,
            'seller_name': False, 'buyer_name': False, 'error_message': False,
        })

    def action_auto_classify_all(self):
        for record in self:
            for line in record.line_ids:
                if not line.debit_account:
                    line.debit_account = line._guess_debit_account()
                if not line.credit_account:
                    line.credit_account = 'genkin'
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {'message': f'已自动分类 {sum(len(r.line_ids) for r in self)} 条明细', 'type': 'success'}
        }
