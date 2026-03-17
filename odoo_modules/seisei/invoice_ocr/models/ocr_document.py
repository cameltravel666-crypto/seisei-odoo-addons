import requests
import base64
import json
import logging
import os
import re
import time

from odoo import models, fields, api
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://ocr:8868")
OCR_SERVICE_KEY = os.getenv("OCR_SERVICE_KEY", "")


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
        ('confirmed', '已确认'),
        ('error', '识别失败'),
    ], string='状态', default='draft')

    ocr_result = fields.Text('识别原文')
    invoice_number = fields.Char('发票号码/登录番号')
    invoice_date = fields.Date('开票日期')
    seller_name = fields.Char('开票方/销售方')
    buyer_name = fields.Char('收票方/购买方')
    client_id = fields.Many2one('ocr.client', '客户')

    line_ids = fields.One2many('ocr.document.line', 'document_id', '商品明细')

    # Computed from lines
    amount = fields.Float('税込合計', digits=(16, 2), compute='_compute_totals', store=True)
    tax_amount = fields.Float('消費税合計', digits=(16, 2), compute='_compute_totals', store=True)
    subtotal = fields.Float('税抜合計', digits=(16, 2), compute='_compute_totals', store=True)

    account_move_id = fields.Many2one('account.move', '关联账单')
    process_time = fields.Float('处理时间(秒)')
    error_message = fields.Text('错误信息')

    @api.depends('line_ids.gross_amount', 'line_ids.tax_amount', 'line_ids.net_amount')
    def _compute_totals(self):
        for doc in self:
            lines = doc.line_ids.filtered(lambda l: l.debit_account)
            doc.amount = sum(l.gross_amount for l in lines)
            doc.tax_amount = sum(l.tax_amount for l in lines)
            doc.subtotal = sum(l.net_amount for l in lines)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

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
        except Exception:
            return 0

    @staticmethod
    def _safe_float(val, default=0):
        if val is None:
            return default
        if isinstance(val, (int, float)):
            return float(val)
        try:
            cleaned = str(val).replace(',', '').replace('¥', '').replace('￥', '').strip()
            return float(cleaned) if cleaned else default
        except (ValueError, TypeError):
            return default

    def _guess_mime_type(self):
        fname = (self.image_filename or '').lower()
        if fname.endswith('.png'):
            return 'image/png'
        if fname.endswith('.pdf'):
            return 'application/pdf'
        if fname.endswith('.webp'):
            return 'image/webp'
        return 'image/jpeg'

    def _detect_doc_type(self, texts):
        full_text = ''.join(texts)
        if '適格請求書' in full_text or '登録番号' in full_text or '登录番号' in full_text:
            return 'qualified_invoice'
        if '請求書' in full_text and '御中' in full_text:
            return 'qualified_invoice'
        if '增值税' in full_text or '发票代码' in full_text:
            return 'vat_invoice'
        return 'retail_receipt'

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
                except Exception:
                    pass

    # ------------------------------------------------------------------
    # Tax rate inference from document-level clues
    # ------------------------------------------------------------------

    def _infer_tax_rate(self, ocr_data=None):
        """Infer dominant tax rate from OCR data or text patterns."""
        if ocr_data:
            totals = ocr_data.get('totals_on_doc') or {}
            by_rate = totals.get('by_rate') or {}
            rate_10 = self._safe_float((by_rate.get('10%') or {}).get('gross'))
            rate_8 = self._safe_float((by_rate.get('8%') or {}).get('gross'))
            if rate_10 > 0:
                return '10'
            if rate_8 > 0:
                return '8'
        return '10'  # default for Japan

    # ------------------------------------------------------------------
    # OCR Recognition
    # ------------------------------------------------------------------

    def _notify_progress(self, message, sticky=False):
        """Send real-time progress notification via bus."""
        try:
            self.env['bus.bus']._sendone(
                self.env.user.partner_id,
                'simple_notification',
                {'title': '票据识别', 'message': message, 'type': 'info', 'sticky': sticky},
            )
            self.env.cr.commit()
        except Exception:
            pass  # non-critical

    def action_recognize(self):
        total = len(self)
        done_count = 0
        fail_count = 0

        for idx, record in enumerate(self, 1):
            if not record.image:
                record.state = 'error'
                record.error_message = '无票据图片'
                fail_count += 1
                continue

            if total > 1:
                record._notify_progress(f'正在识别 {idx}/{total}: {record.name}')

            start = time.time()
            try:
                image_b64 = record.image.decode() if isinstance(record.image, bytes) else record.image
                payload = {
                    'image_data': image_b64,
                    'mime_type': record._guess_mime_type(),
                    'output_level': 'accounting',
                    'tenant_id': self.env.cr.dbname,
                }
                headers = {'Content-Type': 'application/json'}
                if OCR_SERVICE_KEY:
                    headers['x-service-key'] = OCR_SERVICE_KEY

                response = requests.post(
                    f"{OCR_SERVICE_URL}/ocr/process",
                    json=payload,
                    headers=headers,
                    timeout=120,
                )

                record.process_time = round(time.time() - start, 2)

                if response.status_code != 200:
                    record.state = 'error'
                    record.error_message = f'API 错误: {response.status_code}'
                    continue

                result = response.json()

                if not result.get('success'):
                    record.state = 'error'
                    record.error_message = result.get('error_code', '识别失败')
                    continue

                raw = result.get('raw_response', '')
                extracted = result.get('extracted')

                parsed = None
                if isinstance(raw, str) and raw.strip().startswith('{'):
                    try:
                        parsed = json.loads(raw)
                    except (ValueError, TypeError):
                        pass
                elif isinstance(raw, dict):
                    parsed = raw

                if not parsed and isinstance(extracted, dict) and extracted:
                    parsed = extracted

                if parsed:
                    record.ocr_result = json.dumps(parsed, indent=2, ensure_ascii=False)
                elif raw:
                    record.ocr_result = raw

                if parsed and ('totals_on_doc' in parsed or 'issuer' in parsed):
                    record._apply_extracted(parsed)
                elif raw and isinstance(raw, str) and not raw.strip().startswith('{'):
                    texts = raw.split('\n')
                    record.doc_type = record._detect_doc_type(texts)
                    if record.doc_type == 'qualified_invoice':
                        record._extract_qualified_invoice(texts)
                    else:
                        record._extract_retail_receipt(texts)

                record.state = 'done'
                done_count += 1

            except Exception as e:
                record.state = 'error'
                record.error_message = str(e)
                record.process_time = round(time.time() - start, 2)
                fail_count += 1
                _logger.exception('识别异常: %s', e)

            # Commit after each document so progress is saved
            if total > 1:
                self.env.cr.commit()

        if total > 1:
            msg = f'识别完成: {done_count} 成功'
            if fail_count:
                msg += f', {fail_count} 失败'
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': '批量识别',
                    'message': msg,
                    'type': 'success' if fail_count == 0 else 'warning',
                    'sticky': False,
                    'next': {'type': 'ir.actions.act_window_close'},
                },
            }

    # ------------------------------------------------------------------
    # Central OCR structured data → lines
    # ------------------------------------------------------------------

    def _apply_extracted(self, data):
        """Apply structured data from central OCR service into line items."""
        # --- Issuer ---
        issuer = data.get('issuer') or {}
        self.seller_name = issuer.get('issuer_name') or ''
        self.invoice_number = issuer.get('invoice_reg_no') or ''

        # --- Document ---
        doc = data.get('document') or {}
        date_str = doc.get('doc_date') or ''
        if date_str:
            try:
                clean = date_str.replace('/', '-').strip()[:10]
                parts = re.split(r'[-年月日]', clean)
                parts = [p for p in parts if p]
                if len(parts) >= 3:
                    self.invoice_date = f'{int(parts[0]):04d}-{int(parts[1]):02d}-{int(parts[2]):02d}'
            except (ValueError, IndexError):
                pass

        doc_type = doc.get('doc_type') or ''
        type_map = {
            'receipt': 'retail_receipt',
            'retail_receipt': 'retail_receipt',
            'qualified_invoice': 'qualified_invoice',
            'invoice': 'qualified_invoice',
            'vat_invoice': 'vat_invoice',
        }
        self.doc_type = type_map.get(doc_type.lower(), 'other') if doc_type else 'other'

        # --- Default tax rate from document-level data ---
        default_rate = self._infer_tax_rate(data)

        # --- Account name → selection key ---
        account_name_to_key = {
            '仕入高': 'shiire', '消耗品費': 'shoumouhin', '事務用品費': 'jimu',
            '交際費': 'kousai', '福利厚生費': 'fukuri', '旅費交通費': 'ryohi',
            '通信費': 'tsuushin', '水道光熱費': 'suido', '租税公課': 'sozei',
            '雑費': 'zappi',
        }

        # --- Line items ---
        lines = data.get('lines') or []
        if lines:
            self.line_ids.unlink()
            for i, item in enumerate(lines):
                raw_rate = str(item.get('tax_rate') or '').replace('%', '').strip()
                tax_rate = raw_rate if raw_rate in ('0', '8', '10') else default_rate

                suggested = item.get('suggested_account') or ''
                debit_key = account_name_to_key.get(suggested, '')

                vals = {
                    'document_id': self.id,
                    'sequence': (i + 1) * 10,
                    'name': item.get('name') or item.get('description') or '',
                    'quantity': self._safe_float(item.get('qty'), default=1),
                    'unit': item.get('unit') or '',
                    'gross_amount': self._safe_float(
                        item.get('gross_amount') or item.get('amount') or item.get('net_amount')
                    ),
                    'tax_rate': tax_rate,
                }
                if debit_key:
                    vals['debit_account'] = debit_key
                self.env['ocr.document.line'].create(vals)

        # Fallback: if no lines from OCR but we have totals, create a single line
        if not lines:
            totals = data.get('totals_on_doc') or {}
            total_gross = self._safe_float(totals.get('total_gross'))
            if total_gross > 0:
                self.line_ids.unlink()
                self.env['ocr.document.line'].create({
                    'document_id': self.id,
                    'sequence': 10,
                    'name': self.seller_name or '合計',
                    'quantity': 1,
                    'gross_amount': total_gross,
                    'tax_rate': default_rate,
                })

    # ------------------------------------------------------------------
    # Legacy text-based extraction (fallback)
    # ------------------------------------------------------------------

    def _extract_retail_receipt(self, texts):
        full_text = ' '.join(texts)

        if texts:
            for text in texts[:3]:
                text = text.strip()
                if len(text) > 2 and not text.startswith('20') and not text.isdigit():
                    if not re.match(r'^[\d\s]+$', text):
                        self.seller_name = text
                        break

        self._extract_date(full_text)

        # Parse total for fallback single-line creation
        total_amount = 0
        match = re.search(r'合\s*[計计十]\s*[￥¥\\]?\s*([\d,.\s]+)', full_text)
        if match:
            total_amount = self._parse_amount(match.group(1))

        # Detect tax rate from text
        tax_rate = '10'
        if re.search(r'8%|軽減', full_text):
            tax_rate = '8'

        self._extract_retail_lines(texts, tax_rate)

        # If no lines were created, create single line from total
        if not self.line_ids and total_amount > 0:
            self.env['ocr.document.line'].create({
                'document_id': self.id,
                'sequence': 10,
                'name': self.seller_name or '合計',
                'quantity': 1,
                'gross_amount': total_amount,
                'tax_rate': tax_rate,
            })

    def _extract_retail_lines(self, texts, default_tax_rate='10'):
        self.line_ids.unlink()
        lines_data = []

        skip_words = ['小計', '小计', '小十', '消費税', '消费税', 'うち',
                      'お預り', 'お釣り', '対象', '对象', 'SHOP', 'shop',
                      '番号', '年', '月', '日', 'No', '土',
                      '合計', '合计', '合十', '总计', '总金额']

        for text in texts:
            text = text.strip()
            if not text or len(text) < 2:
                continue
            if any(w in text for w in skip_words):
                continue
            if text.isdigit() or re.match(r'^[\d\s.,]+$', text):
                continue
            if re.match(r'^\d+[個組本枚]', text):
                continue
            if re.match(r'^4\d{12}', text):
                continue

            match = re.match(r'^(.+?)\s*[￥¥\\]\s*([\d,.]+)$', text)
            if match:
                name = match.group(1).strip()
                amt = self._parse_amount(match.group(2))
                if len(name) >= 2 and amt > 0 and not name.isdigit():
                    lines_data.append({
                        'document_id': self.id,
                        'name': name,
                        'quantity': 1,
                        'gross_amount': amt,
                        'tax_rate': default_tax_rate,
                    })

        if not lines_data:
            full_text = '\n'.join(texts)
            pattern = r'([ァ-ヶー一-龥a-zA-Z\s]{2,}?)\s*[￥¥\\]\s*([\d,.]+)'
            for match in re.finditer(pattern, full_text):
                name = match.group(1).strip()
                amt = self._parse_amount(match.group(2))
                if any(w in name for w in skip_words):
                    continue
                if len(name) >= 2 and amt > 0:
                    lines_data.append({
                        'document_id': self.id,
                        'name': name,
                        'quantity': 1,
                        'gross_amount': amt,
                        'tax_rate': default_tax_rate,
                    })

        for i, data in enumerate(lines_data):
            data['sequence'] = (i + 1) * 10
            self.env['ocr.document.line'].create(data)

    def _extract_qualified_invoice(self, texts):
        full_text = ' '.join(texts)

        match = re.search(r'登[録录]番号\s*([A-Z0-9\-]+)', full_text, re.IGNORECASE)
        if match:
            self.invoice_number = match.group(1)

        for pattern in [r'([△▲][△▲][\(（]株[\)）])', r'([○●◎\w]+[\(（]株[\)）])']:
            match = re.search(pattern, full_text)
            if match:
                self.seller_name = match.group(1)
                break

        match = re.search(r'([○●◎]+)\s*御中', full_text)
        if match:
            self.buyer_name = match.group(1)

        self._extract_date(full_text)

        # Detect tax rate
        default_rate = '10'
        if re.search(r'8%\s*[対对]象', full_text) and not re.search(r'10%\s*[対对]象', full_text):
            default_rate = '8'

        total_amount = 0
        for pattern in [r'合\s*計\s*([\d,.\s]+)\s*円', r'合計\s*([\d,.]+)\s*円']:
            match = re.search(pattern, full_text)
            if match:
                amt = self._parse_amount(match.group(1))
                if amt > 0:
                    total_amount = amt
                    break

        self._extract_jp_invoice_lines(texts, default_rate)

        if not self.line_ids and total_amount > 0:
            self.env['ocr.document.line'].create({
                'document_id': self.id,
                'sequence': 10,
                'name': self.seller_name or '合計',
                'quantity': 1,
                'gross_amount': total_amount,
                'tax_rate': default_rate,
            })

    def _extract_jp_invoice_lines(self, texts, default_tax_rate='10'):
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
                amt = self._parse_amount(amount_str)
                qty = float(qty_str) if qty_str else 1
                lines_data.append({
                    'document_id': self.id,
                    'name': name,
                    'quantity': qty,
                    'unit': unit,
                    'gross_amount': amt,
                    'tax_rate': default_tax_rate,
                })

        for i, data in enumerate(lines_data):
            data['sequence'] = (i + 1) * 10
            self.env['ocr.document.line'].create(data)

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    @api.onchange('client_id')
    def _onchange_client_id(self):
        if self.client_id:
            for line in self.line_ids:
                if not line.debit_account and self.client_id.default_debit_account:
                    line.debit_account = self.client_id.default_debit_account
                if not line.credit_account and self.client_id.default_credit_account:
                    line.credit_account = self.client_id.default_credit_account

    def action_create_bill(self):
        self.ensure_one()
        if self.state not in ('done', 'confirmed'):
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
            'seller_name': False, 'buyer_name': False, 'error_message': False,
        })

    def action_confirm(self):
        to_confirm = self.filtered(lambda r: r.state == 'done')
        if not to_confirm:
            raise UserError('没有可确认的票据（需要状态为"已识别"）')

        # Learn from user corrections before confirming
        for doc in to_confirm:
            doc._learn_from_corrections()

        to_confirm.write({'state': 'confirmed'})
        if len(to_confirm) > 1:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'message': f'已确认 {len(to_confirm)} 张票据',
                    'type': 'success',
                    'sticky': False,
                },
            }

    def _learn_from_corrections(self):
        """Compare current accounts vs OCR snapshot, create/update rules."""
        if not self.client_id:
            return
        Rule = self.env['ocr.account.rule']
        now = fields.Datetime.now()

        for line in self.line_ids:
            if not line.name:
                continue

            debit_changed = line.debit_account and line.debit_account != line.ocr_debit_account
            credit_changed = line.credit_account and line.credit_account != line.ocr_credit_account

            if not debit_changed and not credit_changed:
                continue

            # --- Item-level rule (exact name match) ---
            self._upsert_rule(Rule, 'item', line.name,
                              line.debit_account if debit_changed else False,
                              line.credit_account if credit_changed else False,
                              now)

            # --- Seller-level rule ---
            if self.seller_name:
                self._upsert_rule(Rule, 'seller', self.seller_name,
                                  line.debit_account if debit_changed else False,
                                  line.credit_account if credit_changed else False,
                                  now)

    def _upsert_rule(self, Rule, match_type, match_value, debit, credit, now):
        """Create or update a learning rule."""
        existing = Rule.search([
            ('client_id', '=', self.client_id.id),
            ('match_type', '=', match_type),
            ('match_value', '=', match_value),
        ], limit=1)

        vals = {'last_used': now}
        if debit:
            vals['debit_account'] = debit
        if credit:
            vals['credit_account'] = credit

        if existing:
            vals['hit_count'] = existing.hit_count + 1
            existing.write(vals)
        else:
            vals.update({
                'client_id': self.client_id.id,
                'match_type': match_type,
                'match_value': match_value,
                'hit_count': 1,
            })
            Rule.create(vals)

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
