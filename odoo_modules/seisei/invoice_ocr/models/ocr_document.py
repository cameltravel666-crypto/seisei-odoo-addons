import requests
import base64
import json
import logging
import os
import re
import time

from odoo import models, fields, api
from odoo.exceptions import UserError

from ..utils.image import compress_image
from .ocr_document_line import _resolve_account

_logger = logging.getLogger(__name__)

OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://ocr:8868")
OCR_SERVICE_KEY = os.getenv("OCR_SERVICE_KEY", "")


class OcrDocument(models.Model):
    _name = 'ocr.document'
    _description = 'OCR Document'
    _order = 'create_date desc'

    name = fields.Char('Name', required=True, default='New Document')
    image = fields.Binary('Document Image', required=True)
    image_filename = fields.Char('Filename')

    doc_type = fields.Selection([
        ('retail_receipt', 'Retail Receipt'),
        ('qualified_invoice', 'Qualified Invoice'),
        ('vat_invoice', 'VAT Invoice'),
        ('other', 'Other'),
    ], string='Document Type', default='other')

    state = fields.Selection([
        ('draft', 'Pending'),
        ('processing', 'Processing'),
        ('done', 'Recognized'),
        ('reviewed', 'Reviewed'),
        ('confirmed', 'Confirmed'),
        ('error', 'Error'),
    ], string='Status', default='draft')

    ocr_result = fields.Text('OCR Raw Result')
    invoice_number = fields.Char('Invoice Number')
    invoice_date = fields.Date('Invoice Date')
    seller_name = fields.Char('Seller')
    buyer_name = fields.Char('Buyer')
    client_id = fields.Many2one('ocr.client', 'Client')

    # --- BPO operator tracking ---
    scan_operator_id = fields.Many2one(
        'res.users', 'Scanner',
        help='Operator who scanned the physical document',
    )
    scan_date = fields.Datetime('Scan Time')
    upload_operator_id = fields.Many2one(
        'res.users', 'Uploader',
        help='Operator who uploaded the file (recorded automatically)',
        default=lambda self: self.env.uid,
    )
    upload_date = fields.Datetime(
        'Upload Time', default=fields.Datetime.now, readonly=True,
    )
    review_operator_id = fields.Many2one(
        'res.users', 'Reviewer',
        help='Operator who reviewed and verified the OCR result',
    )
    review_date = fields.Datetime('Review Time')
    confirm_operator_id = fields.Many2one(
        'res.users', 'Approver',
        help='Operator who gave final approval (before export)',
    )
    confirm_date = fields.Datetime('Approval Time')
    has_correction = fields.Boolean(
        'Has Correction', default=False,
        help='Whether the OCR result was manually corrected during review',
    )

    line_ids = fields.One2many('ocr.document.line', 'document_id', 'Line Items')

    # Computed from lines
    amount = fields.Float('Total (Tax-incl.)', digits=(16, 2), compute='_compute_totals', store=True)
    tax_amount = fields.Float('Total Tax', digits=(16, 2), compute='_compute_totals', store=True)
    subtotal = fields.Float('Total (Tax-excl.)', digits=(16, 2), compute='_compute_totals', store=True)

    summary = fields.Char(
        'Summary', readonly=True, copy=False,
        help='摘要: No.{seq}--{MM/DD}-{seller}, assigned during Yayoi export',
    )

    # Multi-receipt splitting
    source_document_id = fields.Many2one(
        'ocr.document', 'Source (Multi-receipt)', readonly=True,
        ondelete='set null', copy=False,
    )
    split_document_ids = fields.One2many(
        'ocr.document', 'source_document_id', 'Split Documents',
    )
    receipt_index = fields.Integer('Receipt # on Page', readonly=True, default=0)

    account_move_id = fields.Many2one('account.move', 'Related Bill')
    process_time = fields.Float('Process Time (sec)')
    error_message = fields.Text('Error Message')

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('image'):
                vals['image'] = compress_image(
                    vals['image'], vals.get('image_filename', ''),
                )
        return super().create(vals_list)

    def write(self, vals):
        if vals.get('image'):
            fname = vals.get('image_filename') or (self[:1].image_filename if len(self) == 1 else '')
            vals['image'] = compress_image(vals['image'], fname)
        return super().write(vals)

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
        """Infer dominant tax rate from OCR data or text patterns.

        Cross-validates r8_gross/r10_gross against gross_amount to detect
        mislabeled tax rates (e.g., OCR reports r8_gross but items are 10%).
        """
        if ocr_data:
            # New unified format (v2.0+)
            r10_gross = self._safe_float(ocr_data.get('r10_gross'))
            r8_gross = self._safe_float(ocr_data.get('r8_gross'))
            total_gross = self._safe_float(
                ocr_data.get('gross_amount')
                or (ocr_data.get('totals_on_doc') or {}).get('total_gross')
            )

            if r10_gross > 0 or r8_gross > 0:
                # Cross-validate: if OCR says r8_gross but net*1.10 ≈ total_gross,
                # the items are actually 10% (OCR mislabeled)
                if r8_gross > 0 and r10_gross == 0 and total_gross > 0:
                    expected_at_8 = round(r8_gross * 1.08)
                    expected_at_10 = round(r8_gross * 1.10)
                    if (abs(expected_at_10 - total_gross) < abs(expected_at_8 - total_gross)
                            and abs(expected_at_10 - total_gross) <= max(3, total_gross * 0.005)):
                        _logger.info('Tax rate correction: r8_gross=%s but total=%s matches 10%%',
                                     r8_gross, total_gross)
                        return '10'
                return '10' if r10_gross >= r8_gross else '8'

            # Old structured format
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
                {'title': 'OCR Recognition', 'message': message, 'type': 'info', 'sticky': sticky},
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
                record.error_message = 'No document image'
                fail_count += 1
                continue

            if total > 1:
                record._notify_progress(f'Recognizing {idx}/{total}: {record.name}')

            start = time.time()
            try:
                image_b64 = record.image.decode() if isinstance(record.image, bytes) else record.image
                payload = {
                    'image_data': image_b64,
                    'mime_type': record._guess_mime_type(),
                    'output_level': 'accounting',
                    'tenant_id': self.env.cr.dbname,
                }
                # Send vendor hints for central learning context
                if record.seller_name:
                    payload['vendor_hint'] = record.seller_name
                if record.invoice_number:
                    payload['reg_no_hint'] = record.invoice_number
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
                    record.error_message = f'API error: {response.status_code}'
                    continue

                result = response.json()

                if not result.get('success'):
                    record.state = 'error'
                    record.error_message = result.get('error_code', 'Recognition failed')
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

                # Multi-receipt: if OCR returned receipts array with >1 items
                receipts = parsed.get('receipts') if parsed else None
                if receipts and len(receipts) > 1:
                    split_docs = record._split_multi_receipt(receipts)
                    done_count += 1
                elif receipts and len(receipts) == 1:
                    # Single receipt in new array format — unwrap
                    single = receipts[0]
                    record._apply_extracted(single)
                    record._post_ocr_audit(single)
                    record.state = 'done'

                    done_count += 1
                elif parsed and ('totals_on_doc' in parsed or 'issuer' in parsed):
                    # Old single-receipt format (backward compat)
                    record._apply_extracted(parsed)
                    record._post_ocr_audit(parsed)
                    record.state = 'done'

                    done_count += 1
                elif parsed and ('vendor_name' in parsed or 'gross_amount' in parsed):
                    # New unified OCR format (v2.0+)
                    record._apply_extracted(parsed)
                    record._post_ocr_audit(parsed)
                    record.state = 'done'

                    done_count += 1
                elif raw and isinstance(raw, str) and not raw.strip().startswith('{'):
                    texts = raw.split('\n')
                    record.doc_type = record._detect_doc_type(texts)
                    if record.doc_type == 'qualified_invoice':
                        record._extract_qualified_invoice(texts)
                    else:
                        record._extract_retail_receipt(texts)
                    record._post_ocr_audit({})
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
            msg = f'Recognition complete: {done_count} success'
            if fail_count:
                msg += f', {fail_count} failed'
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'Batch Recognition',
                    'message': msg,
                    'type': 'success' if fail_count == 0 else 'warning',
                    'sticky': False,
                    'next': {'type': 'ir.actions.act_window_close'},
                },
            }

    # ------------------------------------------------------------------
    # Multi-receipt splitting
    # ------------------------------------------------------------------

    def _split_multi_receipt(self, receipts):
        """Split a multi-receipt image into separate ocr.document records.

        The original document becomes a container (state='done') and
        new documents are created for each detected receipt.
        """
        self.ensure_one()
        created = self.env['ocr.document']

        # Sort by position (row, col) if available for left-right top-down order
        def _sort_key(r):
            pos = r.get('position') or {}
            return (pos.get('row', 99), pos.get('col', 99))
        receipts_sorted = sorted(receipts, key=_sort_key)

        for i, receipt_data in enumerate(receipts_sorted, 1):
            pos = receipt_data.get('position') or {}
            pos_label = f'R{pos["row"]}C{pos["col"]}' if pos.get('row') else f'#{i}'
            new_doc = self.env['ocr.document'].create({
                'name': f'{self.name} {pos_label}',
                'image': self.image,
                'image_filename': self.image_filename or '',
                'client_id': self.client_id.id if self.client_id else False,
                'source_document_id': self.id,
                'receipt_index': i,
                'scan_operator_id': self.scan_operator_id.id if self.scan_operator_id else False,
                'upload_operator_id': self.upload_operator_id.id if self.upload_operator_id else False,
                'upload_date': self.upload_date,
                'state': 'draft',
                'ocr_result': json.dumps(receipt_data, indent=2, ensure_ascii=False),
            })
            try:
                new_doc._apply_extracted(receipt_data)
                new_doc._post_ocr_audit(receipt_data)
                new_doc.state = 'done'
            except Exception as e:
                new_doc.state = 'error'
                new_doc.error_message = str(e)
                _logger.exception('Multi-receipt split error on #%d: %s', i, e)
            created |= new_doc

        # Mark original as container
        self.state = 'done'
        self.error_message = f'Multi-receipt: split into {len(receipts)} documents'
        return created

    # ------------------------------------------------------------------
    # Re-apply: regenerate lines from stored ocr_result
    # ------------------------------------------------------------------

    def action_reapply_ocr_data(self):
        """Re-generate line items from stored OCR result JSON.

        Useful when OCR result exists but lines were not created
        (e.g. due to earlier bugs or format changes).
        """
        count = 0
        for record in self:
            if not record.ocr_result:
                continue
            try:
                parsed = json.loads(record.ocr_result)
            except (ValueError, TypeError):
                continue
            if not isinstance(parsed, dict):
                continue
            # Handle multi-receipt format
            receipts = parsed.get('receipts')
            if receipts and len(receipts) > 1:
                record._split_multi_receipt(receipts)
                count += 1
            elif receipts and len(receipts) == 1:
                record._apply_extracted(receipts[0])
                record._post_ocr_audit(receipts[0])
                count += 1
            elif parsed.get('lines') or parsed.get('totals_on_doc') or parsed.get('issuer'):
                record._apply_extracted(parsed)
                record._post_ocr_audit(parsed)
                count += 1

        if len(self) > 1:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'message': f'Re-applied OCR data: {count}/{len(self)} documents updated',
                    'type': 'success',
                    'sticky': False,
                },
            }

    # ------------------------------------------------------------------
    # Central OCR structured data → lines
    # ------------------------------------------------------------------

    # Invalid invoice number patterns (OCR placeholders / failures)
    _INVALID_INV_PATTERNS = re.compile(
        r'^(0{5,}|N/?A|なし|ナシ|不明|該当なし|対象外|-+)$', re.IGNORECASE
    )

    @classmethod
    def _is_valid_invoice_number(cls, inv_no):
        """Check if invoice number is meaningful (not a placeholder)."""
        if not inv_no or not inv_no.strip():
            return False
        inv_no = inv_no.strip()
        if cls._INVALID_INV_PATTERNS.match(inv_no):
            return False
        # All same digit repeated (e.g. 0000000, 1111111)
        if len(set(inv_no)) == 1 and inv_no[0].isdigit():
            return False
        return True

    @staticmethod
    def _verify_corporate_number(t_number):
        """Verify Japanese T-number check digit (法人番号の検査用数字).

        T-number format: T + 13 digits where digit[0] is check digit.
        Check digit algorithm (MOD method per 法人番号の基本3法令):
          check = 9 - (sum of (P[i] * Q[i]) for i=1..12) % 9
          where P = [2,1,2,1,...] (even index from left gets 1, odd gets 2)
        Returns True if valid, False if invalid or wrong format.
        """
        if not t_number or not re.match(r'^T\d{13}$', t_number):
            return False
        digits = t_number[1:]  # remove T prefix
        check_digit = int(digits[0])
        body = [int(d) for d in digits[1:]]  # 12 digits
        weights = [2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1]
        total = sum(w * d for w, d in zip(weights, body))
        remainder = total % 9
        expected = 9 - remainder  # range: 1-9 (never 0)
        return check_digit == expected

    # ------------------------------------------------------------------
    # Post-OCR Audit
    # ------------------------------------------------------------------

    def _post_ocr_audit(self, ocr_data):
        """Run validation checks on OCR results and auto-correct where possible.

        Checks performed:
        0. Vendor rules (force tax rate, date era, amount correction)
        1. T-number check digit verification
        2. Date sanity (Reiwa year conversion, future date, too old)
        3. Tax math: gross = net + tax (±2 JPY)
        4. Seller name normalization via T-number registry (local cache)
        5. Amount sanity (negative, zero gross with lines)

        Returns list of audit findings (warnings/corrections applied).
        """
        self.ensure_one()
        findings = []

        # --- 0. Vendor rules ---
        vendor_rule = self._apply_vendor_rules(ocr_data, findings)

        # --- 1. T-number check digit ---
        if self.invoice_number and re.match(r'^T\d{13}$', self.invoice_number):
            if not self._verify_corporate_number(self.invoice_number):
                findings.append(f'T号校验码不通过: {self.invoice_number}')
                # Don't clear it — might still be useful for manual review
            else:
                # Valid T-number: normalize seller name from local registry
                self._normalize_seller_by_t_number(findings)

        # --- 2. Date sanity ---
        if self.invoice_date:
            from datetime import date as dt_date
            today = dt_date.today()
            d = self.invoice_date

            # Reiwa year misparse: year < 100 means likely Reiwa year
            if d.year < 100:
                reiwa_year = d.year + 2018  # Reiwa 1 = 2019
                if 2019 <= reiwa_year <= today.year + 1:
                    corrected = d.replace(year=reiwa_year)
                    findings.append(f'日期令和补正: {d} → {corrected}')
                    self.invoice_date = corrected
                else:
                    findings.append(f'日期异常(年份过小): {d}')

            elif d > today:
                # Allow up to 30 days in future (pre-dated invoices)
                from datetime import timedelta
                if d > today + timedelta(days=30):
                    findings.append(f'日期异常(未来): {d}')

            elif d.year < 2020:
                # Additional check: could be a misinterpreted Reiwa date
                # e.g. "7年" → Gemini guessed 2015 instead of 令和7=2025
                self._try_fix_era_date(d, today, vendor_rule, findings)

        # --- 3. Tax math verification ---
        totals = ocr_data.get('totals_on_doc') or {}
        ocr_gross = self._safe_float(totals.get('total_gross'))
        ocr_tax = self._safe_float(totals.get('total_tax'))
        if ocr_gross > 0 and self.amount > 0:
            if abs(self.amount - ocr_gross) > 2:
                findings.append(
                    f'金额偏差: OCR gross={ocr_gross} vs computed={self.amount}'
                )
        if self.subtotal > 0 and self.tax_amount > 0 and self.amount > 0:
            expected = self.subtotal + self.tax_amount
            if abs(self.amount - expected) > 2:
                findings.append(
                    f'税金计算不匹配: {self.amount} != {self.subtotal}+{self.tax_amount}={expected}'
                )

        # --- 4. Amount sanity ---
        if self.amount < 0:
            findings.append(f'金额为负: {self.amount}')
        if self.amount == 0 and self.line_ids:
            findings.append('金额为0但有明细行')

        # --- 5. Log findings ---
        if findings:
            audit_text = '\n'.join(f'• {f}' for f in findings)
            _logger.info('OCR audit [%s] %s:\n%s', self.id, self.name, audit_text)

        return findings

    def _apply_vendor_rules(self, ocr_data, findings):
        """Apply vendor-specific correction rules after OCR.

        Returns the matched vendor rule (or empty recordset).
        """
        VendorRule = self.env['ocr.vendor.rule']
        client_id = self.client_id.id if self.client_id else False
        rule = VendorRule.match_vendor(client_id, self.seller_name)
        if not rule:
            return rule

        findings.append(f'匹配供应商规则: {rule.vendor_pattern}')

        # --- Force tax rate ---
        if rule.force_tax_rate:
            forced_rate = rule.force_tax_rate
            changed = False
            for line in self.line_ids:
                if line.tax_rate != forced_rate:
                    old_rate = line.tax_rate
                    line.tax_rate = forced_rate
                    changed = True
            if changed:
                findings.append(f'税率强制修正: → {forced_rate}%')

        # --- Amount field correction (net→gross) ---
        if rule.force_tax_rate:
            rate = int(rule.force_tax_rate)
            should_fix = rule.amount_field_is == 'net'

            if rule.amount_field_is == 'auto':
                # Smart detection: check OCR totals for clues
                # If OCR returned both total_gross and total_net, compare with line sum
                # Also: 請求書 (monthly invoice) lines often named 納品額/合計
                should_fix = self._detect_net_as_gross(ocr_data, rate, findings)

            if should_fix:
                for line in self.line_ids:
                    net_val = line.gross_amount
                    true_gross = round(net_val * (100 + rate) / 100)
                    if abs(true_gross - net_val) > 1:
                        line.gross_amount = true_gross
                        findings.append(
                            f'金额税抜→税込修正: {net_val} → {true_gross} (+{rate}%)'
                        )

        return rule

    def _detect_net_as_gross(self, ocr_data, tax_rate, findings):
        """Detect if gross_amount field actually holds net (tax-excluded) value.

        Heuristic: compare OCR totals. If the OCR reported a total_gross that is
        larger than the line sum by ~tax_rate%, the lines hold net values.

        Also skip conversion for 請求書-style docs where line name suggests
        it's already a tax-inclusive summary (e.g. 納品額, 御請求額, 合計).
        """
        totals = ocr_data.get('totals_on_doc') or {}
        ocr_gross = self._safe_float(totals.get('total_gross'))
        ocr_net = self._safe_float(totals.get('total_net'))

        line_sum = sum(l.gross_amount for l in self.line_ids if l.gross_amount)
        if line_sum <= 0:
            return False

        # Check if line names suggest this is a monthly summary invoice (請求書)
        # These already have tax-inclusive amounts
        summary_keywords = ('納品額', '請求額', '御請求', '合計額')
        for line in self.line_ids:
            if line.name and any(kw in line.name for kw in summary_keywords):
                findings.append(f'請求書形式検出(品名="{line.name}"): 金額修正スキップ')
                return False

        # If OCR returned a larger total_gross, lines are probably net
        if ocr_gross > 0 and line_sum > 0:
            ratio = ocr_gross / line_sum
            expected_ratio = (100 + tax_rate) / 100  # e.g. 1.08
            if abs(ratio - expected_ratio) < 0.02:
                findings.append(f'金額分析: OCR_gross/line_sum={ratio:.3f}≈{expected_ratio} → 税抜と判定')
                return True

        # Default for 'auto': don't convert (safer)
        return False

    def _try_fix_era_date(self, d, today, vendor_rule, findings):
        """Try to fix dates that look like misinterpreted Japanese era years.

        Common patterns where Gemini misreads era years:
        - "7年10月18日" (令和7年=2025) → Gemini outputs 2015 or 2007
        - "6年3月" (令和6年=2024) → Gemini outputs 2006

        Strategy: try multiple Reiwa interpretations and pick the most plausible.
        """
        from datetime import date as dt_date

        era_hint = vendor_rule.date_era if vendor_rule else 'auto'

        # Build candidate Reiwa years from various Gemini misparse patterns
        candidates = set()

        # Pattern 1: year itself is the Reiwa number (e.g. 7 → R7=2025)
        # This is caught earlier by year<100, but just in case
        if d.year < 100:
            candidates.add(d.year + 2018)

        # Pattern 2: Gemini added 2000 (e.g. R7 → 2007)
        if 2001 <= d.year <= 2020:
            candidates.add((d.year - 2000) + 2018)

        # Pattern 3: Gemini did some other mapping (e.g. R7 → 2015)
        # Try reverse: what Reiwa year would give this date if we assume
        # the document was created recently (within last ~3 years)?
        # Brute force: check if any single-digit Reiwa year maps here
        for reiwa_n in range(1, 20):  # R1~R19 (2019~2037)
            western = reiwa_n + 2018
            if 2019 <= western <= today.year + 1:
                candidates.add(western)

        # If vendor explicitly says Reiwa, be aggressive:
        # These are recent business receipts, so year should be near today
        # Prefer past dates: try last year first, then current year
        if era_hint == 'reiwa':
            for try_year in [today.year - 1, today.year]:
                try:
                    corrected = d.replace(year=try_year)
                    # Accept if in the past or at most 30 days in the future
                    delta = (corrected - today).days
                    if -730 <= delta <= 30:
                        findings.append(f'日期年号修正(令和): {d} → {corrected}')
                        self.invoice_date = corrected
                        return
                except ValueError:
                    continue

        # Auto mode: only correct if pattern 2 gives a plausible recent year
        if 2001 <= d.year <= 2020:
            reiwa_guess = (d.year - 2000) + 2018
            if 2019 <= reiwa_guess <= today.year + 1:
                try:
                    corrected = d.replace(year=reiwa_guess)
                    findings.append(f'日期疑似令和误判: {d} → {corrected} (自动修正)')
                    self.invoice_date = corrected
                    return
                except ValueError:
                    pass

        # If none of the corrections apply, just flag it
        findings.append(f'日期异常(过旧): {d}')

    def _normalize_seller_by_t_number(self, findings):
        """If same T-number exists with a more complete seller name, use it."""
        if not self.invoice_number or not self.seller_name:
            return
        existing = self.search([
            ('invoice_number', '=', self.invoice_number),
            ('id', '!=', self.id),
            ('seller_name', '!=', False),
            ('state', 'in', ['done', 'confirmed']),
        ], limit=10)
        if not existing:
            return
        # Pick the longest (most complete) seller name
        names = [r.seller_name for r in existing if r.seller_name]
        if not names:
            return
        best = max(names, key=len)
        if len(best) > len(self.seller_name) and self.seller_name in best:
            findings.append(f'店名标准化: "{self.seller_name}" → "{best}"')
            self.seller_name = best

    def _apply_extracted(self, data):
        """Apply structured data from central OCR service into line items."""
        # --- Detect format: new unified (v2.0+) vs old structured ---
        is_new_format = 'vendor_name' in data or ('gross_amount' in data and 'issuer' not in data)

        # --- Issuer ---
        if is_new_format:
            self.seller_name = data.get('vendor_name') or ''
            raw_inv = data.get('invoice_reg_no') or ''
        else:
            issuer = data.get('issuer') or {}
            self.seller_name = issuer.get('issuer_name') or ''
            raw_inv = issuer.get('invoice_reg_no') or ''
        self.invoice_number = raw_inv if self._is_valid_invoice_number(raw_inv) else ''

        # --- Document ---
        if is_new_format:
            date_str = data.get('document_date') or ''
        else:
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

        if is_new_format:
            doc_type = data.get('document_category') or ''
        else:
            doc_type = doc.get('doc_type') or ''
        type_map = {
            'receipt': 'retail_receipt',
            'retail_receipt': 'retail_receipt',
            'qualified_invoice': 'qualified_invoice',
            'invoice': 'qualified_invoice',
            'vat_invoice': 'vat_invoice',
            # New unified format (v2.0+) document_category values
            'purchase': 'retail_receipt',
            'expense': 'retail_receipt',
            'sale': 'qualified_invoice',
        }
        self.doc_type = type_map.get(doc_type.lower(), 'other') if doc_type else 'other'

        # --- Default tax rate from document-level data ---
        default_rate = self._infer_tax_rate(data)

        # Detect if OCR line rates are uniformly wrong vs document-level rate
        # (e.g., all lines say 8% but document total proves 10%)
        _force_rate = False
        lines_preview = data.get('lines') or data.get('line_items') or []
        if lines_preview and default_rate:
            line_rates = set()
            for item in lines_preview:
                lr = str(item.get('tax_rate') or '').replace('%', '').strip()
                if lr in ('8', '10'):
                    line_rates.add(lr)
            # All lines have same rate but document-level says different
            if len(line_rates) == 1 and line_rates.pop() != default_rate:
                _force_rate = True

        # --- Account name → ocr.account id lookup ---
        OcrAccount = self.env['ocr.account']
        all_debit_accounts = OcrAccount.search([('account_type', '=', 'debit'), ('active', '=', True)])
        account_name_to_id = {a.name: a.id for a in all_debit_accounts}
        # Also support yayoi_name as alias
        for a in all_debit_accounts:
            if a.yayoi_name and a.yayoi_name not in account_name_to_id:
                account_name_to_id[a.yayoi_name] = a.id
        # Legacy hardcoded aliases
        _legacy_aliases = {'福利厚生費': '会議費'}
        for alias, target in _legacy_aliases.items():
            if alias not in account_name_to_id and target in account_name_to_id:
                account_name_to_id[alias] = account_name_to_id[target]

        # --- Line items ---
        # Filter out tax summary lines that Gemini sometimes includes as items
        _SUMMARY_PATTERNS = re.compile(
            r'^[\(（]?(小計|合計|税込合計|税抜金額|税抜対象|税抜御買上額|消費税|内税|外税|対象額|税額|税抜|'
            r'税率\s*\d.*|内消費税|\d+%税抜(金額|対象額?|合計)|\d+%税込(金額|対象額?|合計)|'
            r'\d+%対象(消費税|額)?|非課税対象|お預り|お釣り|釣銭額?|現計|'
            r'外\d+%|内\d+%|税合計|読取差額調整|'
            r'現金支払|現金預り|預り金?|つり銭|おつり)[\)）]?$'
        )
        # Payment method lines: skip only when there are other real item lines
        _PAYMENT_PATTERNS = re.compile(
            r'^(クレジット|現金|現金支払|電子マネー|PayPay|Suica|交通系IC|QR決済)$'
        )

        lines = data.get('lines') or data.get('line_items') or []
        if lines:
            self.line_ids.unlink()

            # Separate real items from summary/payment lines
            real_items = []
            payment_items = []
            for item in lines:
                name = item.get('name') or item.get('description') or ''
                if _SUMMARY_PATTERNS.match(name.strip()):
                    continue  # always skip tax subtotals
                if _PAYMENT_PATTERNS.match(name.strip()):
                    payment_items.append(item)
                else:
                    real_items.append(item)

            # If only payment lines remain (no real items), treat them as items
            items_to_create = real_items if real_items else payment_items

            seq = 0
            for item in items_to_create:
                name = item.get('name') or item.get('description') or ''
                seq += 1
                raw_rate = str(item.get('tax_rate') or '').replace('%', '').strip()
                if _force_rate:
                    tax_rate = default_rate
                else:
                    tax_rate = raw_rate if raw_rate in ('0', '8', '10') else default_rate

                suggested = item.get('suggested_account') or ''
                debit_id = account_name_to_id.get(suggested, False)

                vals = {
                    'document_id': self.id,
                    'sequence': seq * 10,
                    'name': name,
                    'quantity': self._safe_float(item.get('qty'), default=1),
                    'unit': item.get('unit') or '',
                    'gross_amount': self._safe_float(
                        item.get('gross_amount') or item.get('amount') or item.get('net_amount')
                    ),
                    'tax_rate': tax_rate,
                }
                if debit_id:
                    vals['debit_account'] = debit_id
                self.env['ocr.document.line'].create(vals)

            # Auto-detect: if line amounts are actually net (税抜/外税)
            # Compare line sum vs OCR total_gross to detect
            if self.line_ids:
                self._auto_fix_net_as_gross(data)
                # Reconcile: ensure line sum matches OCR total (add adjustment if needed)
                self._reconcile_total(data, default_rate)

        # Fallback: if no lines created (OCR had no lines, or all were filtered)
        if not self.line_ids:
            totals = data.get('totals_on_doc') or {}
            total_gross = self._safe_float(
                totals.get('total_gross') or data.get('gross_amount')
            )
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

    def _auto_fix_net_as_gross(self, data):
        """Auto-detect and fix when line gross_amount actually holds net (税抜) values.

        Common on Japanese receipts with 外税 (outside tax) pricing.

        Detection strategy (in order):
        1. line_sum vs ocr_total_gross: if line_sum × (1+rate) ≈ total_gross
        2. by_rate cross-check: if line_sum ≈ by_rate net sum but != by_rate gross sum
        3. Tax math: compute tax both ways, see which matches OCR tax better
        """
        totals = data.get('totals_on_doc') or {}
        by_rate = totals.get('by_rate') or {}

        line_sum = sum(l.gross_amount for l in self.line_ids if l.gross_amount)
        if line_sum <= 0:
            return

        # --- Strategy 1: line_sum vs total_gross (simple single-rate case) ---
        ocr_gross = self._safe_float(
            totals.get('total_gross') or data.get('gross_amount')
        )
        if ocr_gross > 0 and abs(line_sum - ocr_gross) > 2:
            for rate in (10, 8):
                expected_gross = round(line_sum * (100 + rate) / 100)
                if abs(expected_gross - ocr_gross) <= 2:
                    self._convert_lines_net_to_gross()
                    _logger.info('net→gross fix [%s] strategy=1: line_sum=%s, total_gross=%s',
                                 self.name, line_sum, ocr_gross)
                    return

        # --- Strategy 2: by_rate cross-check (handles mixed 8%+10%) ---
        if by_rate:
            by_rate_net_sum = 0
            by_rate_gross_sum = 0
            for rate_key, rate_data in by_rate.items():
                if rate_key in ('exempt', '0%'):
                    continue
                by_rate_net_sum += self._safe_float((rate_data or {}).get('net'))
                by_rate_gross_sum += self._safe_float((rate_data or {}).get('gross'))

            if by_rate_gross_sum > 0 and by_rate_net_sum > 0:
                # line_sum ≈ by_rate net sum → lines are net values
                # Tolerance: 1% of line_sum or min 20 yen (handles ポイント/レジ袋 差異)
                tol = max(20, line_sum * 0.01)
                if (abs(line_sum - by_rate_net_sum) <= tol
                        and abs(line_sum - by_rate_gross_sum) > tol):
                    self._convert_lines_net_to_gross()
                    _logger.info('net→gross fix [%s] strategy=2: line_sum=%s≈net=%s, gross=%s',
                                 self.name, line_sum, by_rate_net_sum, by_rate_gross_sum)
                    return

        # --- Strategy 3: tax math comparison (fallback) ---
        ocr_tax = self._safe_float(totals.get('total_tax'))
        if ocr_tax > 0:
            # Compute tax assuming lines are net vs gross
            tax_if_net = 0
            tax_if_gross = 0
            for line in self.line_ids:
                if line.gross_amount == 0:
                    continue
                rate = int(line.tax_rate or '0') if line.tax_rate in ('0', '8', '10') else 10
                if rate > 0:
                    tax_if_net += abs(line.gross_amount) * rate / 100
                    tax_if_gross += abs(line.gross_amount) * rate / (100 + rate)

            diff_net = abs(tax_if_net - ocr_tax)
            diff_gross = abs(tax_if_gross - ocr_tax)
            if diff_net < diff_gross and diff_net < 10:
                self._convert_lines_net_to_gross()
                _logger.info('net→gross fix [%s] strategy=3: tax_if_net=%.0f≈ocr_tax=%.0f',
                             self.name, tax_if_net, ocr_tax)

    def _convert_lines_net_to_gross(self):
        """Convert all line gross_amount from net (税抜) to gross (税込)."""
        for line in self.line_ids:
            if line.gross_amount == 0:
                continue
            rate = int(line.tax_rate or '0') if line.tax_rate in ('0', '8', '10') else 0
            if rate > 0:
                sign = 1 if line.gross_amount >= 0 else -1
                line.gross_amount = sign * round(abs(line.gross_amount) * (100 + rate) / 100)

    def _reconcile_total(self, data, default_rate):
        """Ensure line item sum matches OCR document total.

        When there's a small discrepancy (e.g. ±1~2 JPY from rounding),
        add a 'rounding adjustment' line so the document total matches
        the receipt exactly.
        """
        import math as _math
        totals = data.get('totals_on_doc') or {}
        ocr_gross = self._safe_float(
            totals.get('total_gross') or data.get('gross_amount')
        )
        if ocr_gross <= 0:
            return

        line_sum = sum(l.gross_amount for l in self.line_ids if l.gross_amount)
        diff = ocr_gross - line_sum

        if abs(diff) == 0:
            return  # perfect match

        line_count = len(self.line_ids)
        # Allow adjustment up to ±(line_count) JPY (rounding tolerance)
        # For larger diffs, OCR likely missed items — don't auto-adjust
        max_tolerance = max(line_count, 3)
        if abs(diff) > max_tolerance:
            _logger.info(
                'Total mismatch [%s]: OCR=%s, lines=%s, diff=%s (> tolerance %s, skipping)',
                self.name, ocr_gross, line_sum, diff, max_tolerance,
            )
            return

        # Add rounding adjustment line
        last_seq = max((l.sequence for l in self.line_ids), default=0)
        self.env['ocr.document.line'].create({
            'document_id': self.id,
            'sequence': last_seq + 10,
            'name': '読取差額調整',
            'quantity': 1,
            'gross_amount': diff,
            'tax_rate': default_rate,
        })
        _logger.info(
            'Total reconciled [%s]: OCR=%s, lines=%s, adjustment=%s',
            self.name, ocr_gross, line_sum, diff,
        )

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
        if self.state != 'reviewed':
            raise UserError('Please complete review first!')
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

    def action_review(self):
        """复核完成：自动分类未填科目 → 检测修正 → 标记为已复核。"""
        to_review = self.filtered(lambda r: r.state == 'done')
        if not to_review:
            raise UserError('No documents to review (status must be "Recognized")')

        # Auto-classify empty accounts before review
        for doc in to_review:
            for line in doc.line_ids:
                if not line.debit_account:
                    line.debit_account = line._guess_debit_account()
                if not line.credit_account:
                    line.credit_account = _resolve_account(
                        self.env, 'genkin', 'credit')

        # Detect if user made corrections (compare line amounts/accounts with OCR snapshot)
        for doc in to_review:
            doc._detect_corrections()
            doc._learn_from_corrections()
            doc._report_template_update()

        to_review.write({
            'state': 'reviewed',
            'review_operator_id': self.env.uid,
            'review_date': fields.Datetime.now(),
        })
        # Navigate to next pending document
        next_doc = self.search(
            [('state', '=', 'done'), ('client_id', '=', to_review[0].client_id.id)],
            order='create_date', limit=1,
        )
        if not next_doc:
            next_doc = self.search(
                [('state', '=', 'done')],
                order='create_date', limit=1,
            )
        if next_doc:
            return {
                'type': 'ir.actions.act_window',
                'res_model': 'ocr.document',
                'res_id': next_doc.id,
                'view_mode': 'form',
                'target': 'current',
            }
        # No more pending — back to list
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'ocr.document',
            'view_mode': 'list,form',
            'target': 'current',
            'context': {'search_default_done': 1},
        }

    def action_confirm(self):
        to_confirm = self.filtered(lambda r: r.state == 'reviewed')
        if not to_confirm:
            raise UserError('No documents to confirm (status must be "Reviewed")')

        for doc in to_confirm:
            doc._learn_from_corrections()
            doc._report_template_update()

        to_confirm.write({
            'state': 'confirmed',
            'confirm_operator_id': self.env.uid,
            'confirm_date': fields.Datetime.now(),
        })
        count = len(to_confirm)
        if count == 1:
            return {
                'type': 'ir.actions.act_window',
                'res_model': 'ocr.document',
                'res_id': to_confirm.id,
                'view_mode': 'form',
                'target': 'current',
            }
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': f'{count} documents confirmed',
                'type': 'success',
                'sticky': False,
            },
        }

    def _detect_corrections(self):
        """Check if user modified OCR results (for BPO quality tracking)."""
        for line in self.line_ids:
            if (line.debit_account != line.ocr_debit_account or
                    line.credit_account != line.ocr_credit_account):
                self.has_correction = True
                return
        # Could also check seller_name, date, amounts vs ocr_result
        # but account changes are the primary correction type

    def _learn_from_corrections(self):
        """Compare current accounts vs OCR snapshot, create/update rules.

        Item rules: created for every corrected line (exact name match).
        Seller rules: only created/updated when ALL corrected lines in the
        document agree on the same debit account. This prevents a single
        atypical item (e.g., fax at 7-11) from overwriting the seller rule.
        """
        if not self.client_id:
            return
        Rule = self.env['ocr.account.rule']
        now = fields.Datetime.now()

        central_corrections = []
        corrected_debit_accounts = set()

        for line in self.line_ids:
            if not line.name:
                continue

            debit_changed = line.debit_account and line.debit_account != line.ocr_debit_account
            credit_changed = line.credit_account and line.credit_account != line.ocr_credit_account

            if not debit_changed and not credit_changed:
                continue

            # --- Item-level rule (exact name match) — always learn ---
            self._upsert_rule(Rule, 'item', line.name,
                              line.debit_account if debit_changed else False,
                              line.credit_account if credit_changed else False,
                              now)

            if debit_changed and line.debit_account:
                corrected_debit_accounts.add(line.debit_account.id)

            # --- Collect for central learning ---
            if debit_changed and line.debit_account:
                central_corrections.append({
                    'correction_type': 'account',
                    'match_field': 'item_name',
                    'match_value': line.name,
                    'corrected_value': line.debit_account.name,
                })

        # --- Seller-level rule: only when all corrections agree ---
        if self.seller_name and len(corrected_debit_accounts) == 1:
            agreed_debit_id = corrected_debit_accounts.pop()
            agreed_debit = self.env['ocr.account'].browse(agreed_debit_id)
            self._upsert_rule(Rule, 'seller', self.seller_name,
                              agreed_debit, False, now)

        # --- Report to Central OCR Service ---
        if central_corrections and OCR_SERVICE_URL:
            self._report_to_central(central_corrections)

    def _report_to_central(self, corrections):
        """Report learning corrections to OCR Central Service."""
        try:
            payload = {
                'tenant_id': self.env.cr.dbname,
                'vendor_name': self.seller_name or None,
                'invoice_reg_no': self.invoice_number or None,
                'corrections': corrections,
            }
            headers = {'Content-Type': 'application/json'}
            if OCR_SERVICE_KEY:
                headers['x-service-key'] = OCR_SERVICE_KEY
            resp = requests.post(
                f"{OCR_SERVICE_URL}/corrections",
                json=payload,
                headers=headers,
                timeout=5,
            )
            if resp.status_code == 200:
                _logger.info('Central learning: reported %d corrections for %s',
                             len(corrections), self.seller_name)
            else:
                _logger.warning('Central learning failed: %s', resp.text[:200])
        except Exception as e:
            _logger.warning('Central learning error: %s', e)

    def _report_template_update(self):
        """Report confirmed document data to OCR Central for template learning."""
        if not OCR_SERVICE_URL or not self.seller_name:
            return
        try:
            # Build product list from confirmed line items
            products = []
            for line in self.line_ids:
                if line.name and len(line.name.strip()) >= 2:
                    prod = {'name': line.name.strip()}
                    if line.debit_account:
                        prod['account'] = line.debit_account.name
                    if hasattr(line, 'tax_rate') and line.tax_rate:
                        prod['tax_rate'] = line.tax_rate
                    products.append(prod)

            # Parse document category from OCR result
            category = None
            if self.ocr_result:
                try:
                    ocr = json.loads(self.ocr_result)
                    if 'document' in ocr:
                        category = ocr['document'].get('category')
                    elif 'document_category' in ocr:
                        category = ocr.get('document_category')
                except (json.JSONDecodeError, TypeError):
                    pass

            payload = {
                'tenant_id': self.env.cr.dbname,
                'vendor_name': self.seller_name,
                'invoice_reg_no': self.invoice_number or None,
                'document_category': category,
                'products': products[:50],
            }
            headers = {'Content-Type': 'application/json'}
            if OCR_SERVICE_KEY:
                headers['x-service-key'] = OCR_SERVICE_KEY
            resp = requests.post(
                f"{OCR_SERVICE_URL}/templates/update",
                json=payload,
                headers=headers,
                timeout=5,
            )
            if resp.status_code == 200:
                _logger.info('Template update: reported for %s', self.seller_name)
            else:
                _logger.warning('Template update failed: %s', resp.text[:200])
        except Exception as e:
            _logger.warning('Template update error: %s', e)

    def _upsert_rule(self, Rule, match_type, match_value, debit, credit, now):
        """Create or update a learning rule."""
        existing = Rule.search([
            ('client_id', '=', self.client_id.id),
            ('match_type', '=', match_type),
            ('match_value', '=', match_value),
        ], limit=1)

        vals = {'last_used': now}
        if debit:
            vals['debit_account'] = debit.id if hasattr(debit, 'id') else debit
        if credit:
            vals['credit_account'] = credit.id if hasattr(credit, 'id') else credit

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
                    line.credit_account = _resolve_account(
                        self.env, 'genkin', 'credit')
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {'message': f'Auto-classified {sum(len(r.line_ids) for r in self)} line items', 'type': 'success'}
        }

    def action_batch_credit_account(self):
        """Open the batch credit account wizard with selected documents."""
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'ocr.batch.credit.account',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_document_ids': self.ids,
                'default_scope': 'selected',
            },
        }

    # ------------------------------------------------------------------
    # Cron: background recognition queue
    # ------------------------------------------------------------------

    @api.model
    def _cron_recognize_queue(self, batch_size=20):
        """Process pending documents in background (called by ir.cron).

        Uses SELECT ... FOR UPDATE SKIP LOCKED to allow safe concurrent
        execution from multiple workers without duplicate processing.
        OCR HTTP calls are parallelized with ThreadPoolExecutor for throughput.
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed

        # Grab a batch with row-level locking (skip rows locked by other workers)
        self.env.cr.execute("""
            SELECT id FROM ocr_document
            WHERE state = 'draft'
            ORDER BY create_date
            LIMIT %s
            FOR UPDATE SKIP LOCKED
        """, (batch_size,))
        ids = [r[0] for r in self.env.cr.fetchall()]

        if not ids:
            return

        # Mark as processing and commit so other workers skip these
        self.env.cr.execute("""
            UPDATE ocr_document SET state = 'processing'
            WHERE id = ANY(%s)
        """, (ids,))
        self.env.cr.commit()

        docs = self.browse(ids)
        _logger.info('OCR queue: processing %d documents (IDs %s)', len(docs), ids[:3])

        # --- Phase 1: Parallel OCR HTTP calls (IO-bound) ---
        def _call_ocr(doc_id, image_b64, mime_type, tenant_id, vendor_hint, reg_no_hint):
            """Thread-safe OCR HTTP call (no ORM access)."""
            import time as _time
            payload = {
                'image_data': image_b64,
                'mime_type': mime_type,
                'output_level': 'accounting',
                'tenant_id': tenant_id,
            }
            if vendor_hint:
                payload['vendor_hint'] = vendor_hint
            if reg_no_hint:
                payload['reg_no_hint'] = reg_no_hint
            headers = {'Content-Type': 'application/json'}
            if OCR_SERVICE_KEY:
                headers['x-service-key'] = OCR_SERVICE_KEY

            start = _time.time()
            try:
                resp = requests.post(
                    f"{OCR_SERVICE_URL}/ocr/process",
                    json=payload, headers=headers, timeout=120,
                )
                elapsed = round(_time.time() - start, 2)
                return doc_id, resp.status_code, resp.json(), elapsed, None
            except Exception as e:
                elapsed = round(_time.time() - start, 2)
                return doc_id, 0, None, elapsed, str(e)

        # Prepare payloads (ORM reads — main thread only)
        tasks = []
        tenant_id = self.env.cr.dbname
        for doc in docs:
            if not doc.image:
                doc.state = 'error'
                doc.error_message = 'No document image'
                self.env.cr.commit()
                continue
            image_b64 = doc.image.decode() if isinstance(doc.image, bytes) else doc.image
            tasks.append((
                doc.id, image_b64, doc._guess_mime_type(),
                tenant_id, doc.seller_name or '', doc.invoice_number or '',
            ))

        # Fire parallel OCR calls (max 10 concurrent to respect API limits)
        max_workers = min(len(tasks), 10)
        ocr_results = {}
        if tasks:
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(_call_ocr, *t): t[0] for t in tasks}
                for future in as_completed(futures):
                    doc_id, status, result, elapsed, error = future.result()
                    ocr_results[doc_id] = (status, result, elapsed, error)

        _logger.info('OCR queue: %d HTTP calls completed', len(ocr_results))

        # --- Phase 2: Apply results sequentially (ORM writes — main thread) ---
        done = 0
        fail = 0
        for doc in docs:
            if doc.state == 'error':
                fail += 1
                continue
            ocr = ocr_results.get(doc.id)
            if not ocr:
                continue

            status, result, elapsed, error = ocr
            doc.process_time = elapsed

            try:
                if error:
                    doc.state = 'error'
                    doc.error_message = f'HTTP error: {error}'
                    fail += 1
                elif status != 200:
                    doc.state = 'error'
                    doc.error_message = f'API error: {status}'
                    fail += 1
                elif not result.get('success'):
                    doc.state = 'error'
                    doc.error_message = result.get('error_code', 'Recognition failed')
                    fail += 1
                else:
                    self._apply_ocr_result(doc, result)
                    if doc.state == 'done':
                        done += 1
                    else:
                        fail += 1
            except Exception as e:
                doc.state = 'error'
                doc.error_message = str(e)
                fail += 1
                _logger.exception('OCR queue error on doc %s: %s', doc.id, e)
            self.env.cr.commit()

        _logger.info('OCR queue complete: %d done, %d failed (batch=%d)', done, fail, len(ids))

    @api.model
    def _apply_ocr_result(self, record, result):
        """Apply a single OCR API result to a document record.
        Extracted from action_recognize for reuse in parallel cron.
        """
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

        # Multi-receipt: if OCR returned receipts array with >1 items
        receipts = parsed.get('receipts') if parsed else None
        if receipts and len(receipts) > 1:
            record._split_multi_receipt(receipts)
        elif receipts and len(receipts) == 1:
            single = receipts[0]
            record._apply_extracted(single)
            record._post_ocr_audit(single)
            record.state = 'done'
        elif parsed and ('totals_on_doc' in parsed or 'issuer' in parsed):
            record._apply_extracted(parsed)
            record._post_ocr_audit(parsed)
            record.state = 'done'
        elif parsed and ('vendor_name' in parsed or 'gross_amount' in parsed):
            record._apply_extracted(parsed)
            record._post_ocr_audit(parsed)
            record.state = 'done'
        elif raw and isinstance(raw, str) and not raw.strip().startswith('{'):
            texts = raw.split('\n')
            record.doc_type = record._detect_doc_type(texts)
            if record.doc_type == 'qualified_invoice':
                record._extract_qualified_invoice(texts)
            else:
                record._extract_retail_receipt(texts)
            record._post_ocr_audit({})
            record.state = 'done'

    @api.model
    def _recover_stuck_processing(self):
        """Reset documents stuck in 'processing' state for >15 minutes."""
        self.env.cr.execute("""
            UPDATE ocr_document SET state = 'draft'
            WHERE state = 'processing'
              AND write_date < now() - interval '15 minutes'
            RETURNING id
        """)
        recovered = self.env.cr.fetchall()
        if recovered:
            self.env.cr.commit()
            _logger.warning('OCR: recovered %d stuck processing docs', len(recovered))

    # ------------------------------------------------------------------
    # Server-side folder import
    # ------------------------------------------------------------------

    INBOX_DIR = '/var/lib/odoo/ocr_inbox'
    ARCHIVE_DIR = '/var/lib/odoo/ocr_inbox/_done'
    ALLOWED_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.pdf'}

    @api.model
    def _cron_scan_inbox(self):
        """Scan server inbox folder and import images as draft documents.

        Supported folder structures:
          /var/lib/odoo/ocr_inbox/
            客户名称/              ← auto-create ocr.client if not found
              2026-03/            ← optional month subfolder (ignored for matching)
                image1.jpg
              image2.png          ← files directly under client folder also work
            loose_image.jpg       ← no client assigned

        After import, files are moved to _done/ subfolder.
        """
        import pathlib
        import shutil

        inbox = pathlib.Path(self.INBOX_DIR)
        if not inbox.exists():
            inbox.mkdir(parents=True, exist_ok=True)
            _logger.info('OCR inbox created: %s', inbox)
            return

        archive = pathlib.Path(self.ARCHIVE_DIR)
        archive.mkdir(parents=True, exist_ok=True)

        Client = self.env['ocr.client']
        client_cache = {}  # folder_name -> ocr.client record
        count = 0

        for path in sorted(inbox.rglob('*')):
            if path.is_dir():
                continue
            if path.suffix.lower() not in self.ALLOWED_EXT:
                continue
            # Skip _done archive folder
            rel = path.relative_to(inbox)
            if '_done' in rel.parts:
                continue

            # Determine client from top-level subfolder name
            # Structure: inbox/client_name/[month/]file.jpg
            client = False
            parts = rel.parts  # e.g. ('永代商事', '2026-03', 'file.jpg')
            if len(parts) >= 2:
                client_folder = parts[0]
                if client_folder not in client_cache:
                    found = Client.search([
                        '|', ('code', '=', client_folder),
                        ('name', '=', client_folder),
                    ], limit=1)
                    if not found:
                        # Auto-create client from folder name
                        found = Client.create({'name': client_folder})
                        _logger.info('OCR inbox: auto-created client "%s"', client_folder)
                    client_cache[client_folder] = found
                client = client_cache[client_folder]

            # --- Dedup: skip if same filename + client already exists ---
            dup_domain = [('image_filename', '=', path.name)]
            if client:
                dup_domain.append(('client_id', '=', client.id))
            else:
                dup_domain.append(('client_id', '=', False))
            if self.search_count(dup_domain, limit=1):
                _logger.info('OCR inbox: skip duplicate %s (client=%s)',
                             path.name, client.name if client else 'none')
                # Still move to archive so it doesn't re-scan
                dest = archive / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(path), str(dest))
                continue

            try:
                raw = path.read_bytes()
                b64_data = base64.b64encode(raw)

                vals = {
                    'name': path.name,
                    'image': b64_data,
                    'image_filename': path.name,
                }
                if client:
                    vals['client_id'] = client.id

                self.create(vals)
                count += 1

                # Move to archive
                dest = archive / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(path), str(dest))

            except Exception as e:
                _logger.exception('OCR inbox import failed for %s: %s', path, e)

            # Commit every 10 files
            if count % 10 == 0:
                self.env.cr.commit()

        if count:
            self.env.cr.commit()
            _logger.info('OCR inbox: imported %d files', count)
