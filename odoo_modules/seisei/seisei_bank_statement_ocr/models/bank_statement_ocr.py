import base64
import csv
import io
import json
import logging
import re
from datetime import date as pydate

from odoo import models, fields, api, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


def _era_to_western(era_year):
    """Convert Japanese era short year to Western year.

    Default: Reiwa (令和). Falls back to Heisei if result is in the future.
    Reiwa 1 = 2019, so western = era_year + 2018
    Heisei 1 = 1989, so western = era_year + 1988
    """
    reiwa = era_year + 2018
    if reiwa <= pydate.today().year + 1:
        return reiwa
    # Too far in future → probably Heisei
    return era_year + 1988


def _parse_passbook_date(raw_date, fallback=None):
    """Parse Japanese bank passbook date formats into YYYY-MM-DD.

    Japanese passbooks use era year (令和/平成). E.g.:
      - "07-1225"  → 令和7年12月25日 → 2025-12-25
      - "08-1-5"   → 令和8年1月5日   → 2026-01-05
      - "08-113"   → 令和8年1月13日  → 2026-01-13
      - "0.8-1-19" → OCR artifact    → 2026-01-19
      - "2025-12-08" → ISO standard  → pass through
    """
    if not raw_date:
        return fallback or pydate.today().isoformat()

    s = str(raw_date).strip()

    # Already valid ISO date
    if re.match(r'^\d{4}-\d{2}-\d{2}$', s):
        return s

    # Clean OCR artifacts: dots in numbers (e.g. "0.8" -> "08")
    s = re.sub(r'(\d)\.(\d)', r'\1\2', s)

    # Format: YY-MMDD (compact, 4 digits after dash) e.g. "07-1225"
    m = re.match(r'^(\d{1,2})-(\d{4})$', s)
    if m:
        y = _era_to_western(int(m.group(1)))
        rest = m.group(2)
        mo, d = int(rest[:2]), int(rest[2:])
        try:
            return pydate(y, mo, d).isoformat()
        except ValueError:
            pass

    # Format: YY-MDD (compact, 3 digits after dash) e.g. "08-113" → month=1, day=13
    m = re.match(r'^(\d{1,2})-(\d{3})$', s)
    if m:
        y = _era_to_western(int(m.group(1)))
        rest = m.group(2)
        mo, d = int(rest[0]), int(rest[1:])
        try:
            return pydate(y, mo, d).isoformat()
        except ValueError:
            pass

    # Format: YY-M-D or YY-MM-DD (dashed) e.g. "08-1-5", "07-12-29"
    m = re.match(r'^(\d{1,4})[/-](\d{1,2})[/-](\d{1,2})$', s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y = _era_to_western(y)
        try:
            return pydate(y, mo, d).isoformat()
        except ValueError:
            pass

    # Compact format like "071225" (YYMMDD)
    m = re.match(r'^(\d{2})(\d{2})(\d{2})$', s)
    if m:
        y = _era_to_western(int(m.group(1)))
        mo, d = int(m.group(2)), int(m.group(3))
        try:
            return pydate(y, mo, d).isoformat()
        except ValueError:
            pass

    _logger.warning(f'[BankStmtOCR] Could not parse date: {raw_date!r}, using fallback')
    return fallback or pydate.today().isoformat()


class SeiseiBankStatementOcr(models.Model):
    _name = 'seisei.bank.statement.ocr'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'Bank Statement OCR Record'
    _order = 'create_date desc'

    name = fields.Char(
        'Name', compute='_compute_name', store=True,
    )
    journal_id = fields.Many2one(
        'account.journal', 'Bank Account', required=True,
        domain=[('type', '=', 'bank')], tracking=True,
    )
    attachment_ids = fields.Many2many(
        'ir.attachment', string='Scan Files',
    )

    state = fields.Selection([
        ('draft', 'Draft'),
        ('processing', 'Processing'),
        ('review', 'Review'),
        ('done', 'Done'),
        ('failed', 'Error'),
    ], default='draft', string='State', tracking=True)

    # OCR extracted header (all editable)
    bank_name = fields.Char('Bank Name', tracking=True)
    branch_name = fields.Char('Branch')
    account_number = fields.Char('Account No.')
    account_holder = fields.Char('Holder')
    statement_date = fields.Date('Statement Date')
    statement_period = fields.Char('Period')
    balance_start = fields.Float('Opening Balance', digits=(16, 0), tracking=True)
    balance_end = fields.Float('Closing Balance', digits=(16, 0), tracking=True)

    # OCR raw data
    ocr_raw_data = fields.Text('OCR Raw JSON')
    ocr_pages = fields.Integer('Pages')
    ocr_error_message = fields.Text('Error')
    ocr_processed_at = fields.Datetime('Processed At')

    # Transaction lines
    line_ids = fields.One2many(
        'seisei.bank.statement.ocr.line', 'ocr_id',
        'Transactions',
    )

    # Import result
    statement_id = fields.Many2one(
        'account.bank.statement', 'Generated Statement',
        readonly=True, tracking=True,
    )

    # Balance integrity check
    balance_check_ok = fields.Boolean(
        'Balance OK',
        compute='_compute_balance_check', store=True,
    )
    balance_diff = fields.Float(
        'Difference',
        compute='_compute_balance_check', store=True, digits=(16, 0),
    )

    @api.depends('bank_name', 'statement_period', 'journal_id')
    def _compute_name(self):
        for rec in self:
            parts = [p for p in [rec.bank_name, rec.statement_period] if p]
            rec.name = ' '.join(parts) if parts else f'OCR #{rec.id or "new"}'

    @api.depends('balance_start', 'balance_end', 'line_ids.deposit', 'line_ids.withdrawal')
    def _compute_balance_check(self):
        for rec in self:
            total_in = sum(rec.line_ids.mapped('deposit'))
            total_out = sum(rec.line_ids.mapped('withdrawal'))
            expected_end = rec.balance_start + total_in - total_out
            rec.balance_diff = rec.balance_end - expected_end
            rec.balance_check_ok = abs(rec.balance_diff) < 1  # JPY tolerance

    # ---- OCR processing ----

    def action_process_ocr(self):
        """Process all attached files as pages, merge into one result."""
        self.ensure_one()
        if not self.attachment_ids:
            raise UserError(_('Please attach files first.'))

        self.state = 'processing'
        self.line_ids.unlink()
        self.env.flush_all()

        try:
            with self.env.cr.savepoint():
                import base64 as b64
                from odoo.addons.odoo_ocr_final.models.llm_ocr import process_bank_statement

                all_transactions = []
                first_header = {}
                last_header = {}
                total_pages = 0
                errors = []

                for attachment in self.attachment_ids:
                    file_data = b64.b64decode(attachment.datas)
                    mimetype = attachment.mimetype or 'application/pdf'

                    result = process_bank_statement(
                        file_data, mimetype, tenant_id=self.env.cr.dbname,
                    )

                    if result.get('success'):
                        extracted = result['extracted']
                        pages = result.get('pages', 1)
                        total_pages += pages
                        txns = extracted.get('transactions', [])
                        # Offset seq for multi-attachment merge
                        offset = len(all_transactions)
                        for t in txns:
                            t['seq'] = offset + t.get('seq', 1)
                        all_transactions.extend(txns)
                        if not first_header:
                            first_header = extracted
                        last_header = extracted
                    else:
                        errors.append(f'{attachment.name}: {result.get("error", "unknown")}')

                if not all_transactions and errors:
                    self.ocr_error_message = '; '.join(errors)
                    self.state = 'failed'
                    return True

                # Merge: header from first file, balance_end from last file
                merged = {
                    'bank_name': first_header.get('bank_name', ''),
                    'branch_name': first_header.get('branch_name', ''),
                    'account_number': first_header.get('account_number', ''),
                    'account_holder': first_header.get('account_holder', ''),
                    'statement_period': first_header.get('statement_period', ''),
                    'balance_start': first_header.get('balance_start', 0),
                    'balance_end': last_header.get('balance_end', 0),
                    'transactions': all_transactions,
                }

                self.ocr_pages = total_pages
                self.ocr_processed_at = fields.Datetime.now()
                if errors:
                    self.ocr_error_message = '; '.join(errors)
                self._apply_ocr_result(merged)
                self.state = 'review'

                # Link scan attachments to this record so they appear in Chatter
                self.attachment_ids.write({
                    'res_model': self._name,
                    'res_id': self.id,
                })

                self.message_post(
                    body=_(
                        'OCR completed: %(pages)s pages, %(txns)s transactions extracted.',
                        pages=total_pages,
                        txns=len(merged['transactions']),
                    ),
                    attachment_ids=self.attachment_ids.ids,
                )

                OcrUsage = self.env['ocr.usage'].sudo()
                if hasattr(OcrUsage, 'increment_usage'):
                    OcrUsage.increment_usage(pages=total_pages or 1)

        except ImportError:
            self.ocr_error_message = 'odoo_ocr_final module not found.'
            self.state = 'failed'
        except Exception as e:
            _logger.exception(f'[BankStmtOCR] Processing error: {e}')
            self.ocr_error_message = str(e)
            self.state = 'failed'

        return True

    def _apply_ocr_result(self, extracted):
        """Apply OCR extraction result to this record."""
        self.bank_name = extracted.get('bank_name', '')
        self.branch_name = extracted.get('branch_name', '')
        self.account_number = extracted.get('account_number', '')
        self.account_holder = extracted.get('account_holder', '')
        self.balance_start = extracted.get('balance_start', 0)
        self.balance_end = extracted.get('balance_end', 0)
        self.statement_period = extracted.get('statement_period', '')
        self.ocr_raw_data = json.dumps(extracted, ensure_ascii=False)

        transactions = self._deduplicate_transactions(
            extracted.get('transactions', [])
        )
        # Sort by seq (passbook print order) — do NOT sort by date
        transactions.sort(key=lambda t: t.get('seq', 9999))

        OcrLine = self.env['seisei.bank.statement.ocr.line']
        for i, txn in enumerate(transactions):
            fallback_date = str(self.statement_date) if self.statement_date else None
            txn_date = _parse_passbook_date(txn.get('date'), fallback=fallback_date)
            txn_desc = txn.get('description') or _('(No description)')
            OcrLine.create({
                'ocr_id': self.id,
                'sequence': i + 1,
                'date': txn_date,
                'description': txn_desc,
                'withdrawal': txn.get('withdrawal', 0),
                'deposit': txn.get('deposit', 0),
                'balance': txn.get('balance') or 0,
                'reference': txn.get('reference', ''),
                'partner_name': txn_desc,
            })

        self._fix_transaction_directions()
        self._fill_running_balances()
        self._auto_match_partners()

    def _fix_transaction_directions(self):
        """Fix deposit/withdrawal direction errors using anchor balances.

        OCR sometimes puts the amount in the wrong column (deposit vs
        withdrawal).  By comparing the running balance against printed
        anchor balances, we can detect and correct such errors using a
        greedy flip algorithm.
        """
        lines = self.line_ids.sorted('sequence')
        if not lines:
            return

        running = self.balance_start or 0
        segment_start = running
        segment_lines = []
        total_flipped = 0

        for line in lines:
            segment_lines.append(line)

            if not line.balance:
                continue

            # Reached an anchor — check if segment is consistent
            computed = segment_start
            for sl in segment_lines:
                computed += (sl.deposit or 0) - (sl.withdrawal or 0)

            error = computed - line.balance
            if abs(error) <= 1:
                # Segment matches anchor
                segment_start = line.balance
                segment_lines = []
                continue

            # Mismatch — try greedy flipping to reduce error
            candidates = [
                (sl, 2 * ((sl.withdrawal or 0) - (sl.deposit or 0)))
                for sl in segment_lines
                if (sl.deposit or 0) != (sl.withdrawal or 0)
            ]
            candidates.sort(key=lambda x: abs(x[1]), reverse=True)

            flips = []
            remaining = error
            for sl, effect in candidates:
                if abs(remaining + effect) < abs(remaining):
                    flips.append(sl)
                    remaining += effect

            # Accept if flipping reduces error by > 95%
            if flips and abs(remaining) < abs(error) * 0.05:
                for sl in flips:
                    sl.deposit, sl.withdrawal = sl.withdrawal, sl.deposit
                total_flipped += len(flips)

            segment_start = line.balance
            segment_lines = []

        if total_flipped:
            _logger.info(
                '[BankStmtOCR] Fixed direction of %d transactions using anchor balances',
                total_flipped,
            )

    def _fill_running_balances(self):
        """Fill missing balances by computing running balance.

        Passbooks only print balance on some lines.  For lines where OCR
        returned 0 (meaning no printed balance), compute:
            balance = previous_balance + deposit - withdrawal
        Lines that already have a non-zero balance are kept as-is and
        become the new anchor for subsequent calculations.
        """
        lines = self.line_ids.sorted('sequence')
        if not lines:
            return

        running = self.balance_start or 0
        filled = 0
        for line in lines:
            if line.balance:
                # OCR provided a printed balance — use it as anchor
                running = line.balance
            else:
                # No printed balance — compute from running
                running = running + (line.deposit or 0) - (line.withdrawal or 0)
                line.balance = running
                filled += 1

        if filled:
            _logger.info('[BankStmtOCR] Filled %d/%d missing balances', filled, len(lines))

        # Warn if computed final balance doesn't match OCR balance_end
        if self.balance_end and lines:
            final = lines[-1].balance
            if abs(final - self.balance_end) > 0.01:
                _logger.warning(
                    '[BankStmtOCR] Balance mismatch for #%s: computed %.2f, expected %.2f',
                    self.id, final, self.balance_end,
                )

    @staticmethod
    def _deduplicate_transactions(transactions):
        """Remove duplicate transactions based on (date, desc, withdrawal, deposit, balance).

        Balance is included so that legitimate same-day, same-amount
        transactions (e.g. multiple 振込手数料 495) are preserved while
        true cross-page boundary duplicates (same balance) are removed.
        """
        seen = set()
        unique = []
        for txn in transactions:
            key = (
                txn.get('date', ''),
                txn.get('description', ''),
                txn.get('withdrawal', 0),
                txn.get('deposit', 0),
                txn.get('balance', 0),
            )
            if key not in seen:
                seen.add(key)
                unique.append(txn)
        return unique

    # ---- Partner matching ----

    def _auto_match_partners(self):
        """Try to match partners from transaction descriptions."""
        Partner = self.env['res.partner']
        for line in self.line_ids:
            if line.partner_id:
                continue
            desc = line.description or ''
            partner = Partner.search([('name', 'ilike', desc)], limit=1)
            if not partner:
                for prefix in ['振込 ', '振込　', 'ﾌﾘｺﾐ ', '入金 ']:
                    if desc.startswith(prefix):
                        name = desc[len(prefix):].strip()
                        if name:
                            partner = Partner.search(
                                [('name', 'ilike', name)], limit=1,
                            )
                            if partner:
                                break
            if partner:
                line.partner_id = partner.id

    # ---- Import to statement ----

    def action_confirm_import(self):
        """Create official account.bank.statement from reviewed OCR data."""
        self.ensure_one()
        if self.state != 'review':
            raise UserError(_('Can only import in Review state.'))

        stmt_vals = {
            'name': f"OCR {self.bank_name or ''} {self.statement_period or ''}".strip(),
            'date': self.statement_date or fields.Date.today(),
            'balance_start': self.balance_start,
            'balance_end_real': self.balance_end,
            'journal_id': self.journal_id.id,
            'line_ids': [],
        }

        for line in self.line_ids.sorted('date'):
            stmt_vals['line_ids'].append((0, 0, {
                'date': line.date,
                'payment_ref': line.description,
                'amount': line.amount,
                'partner_id': line.partner_id.id if line.partner_id else False,
                'partner_name': line.partner_name or line.description,
            }))

        statement = self.env['account.bank.statement'].create(stmt_vals)
        self.statement_id = statement.id
        self.state = 'done'

        # Attach original scans to the bank statement for audit trail
        for att in self.attachment_ids:
            att.copy({
                'res_model': 'account.bank.statement',
                'res_id': statement.id,
            })

        self.message_post(
            body=_(
                'Imported as bank statement <a href="#" '
                'data-oe-model="account.bank.statement" data-oe-id="%(sid)s">'
                '%(sname)s</a> (%(count)s lines).',
                sid=statement.id,
                sname=statement.name,
                count=len(self.line_ids),
            ),
            attachment_ids=self.attachment_ids.ids,
        )

        return {
            'type': 'ir.actions.act_window',
            'res_model': 'account.bank.statement.line',
            'view_mode': 'list',
            'domain': [('statement_id', '=', statement.id)],
            'context': {'search_default_journal_id': self.journal_id.id},
        }

    def action_reset_to_draft(self):
        """Reset to draft and clear OCR data."""
        self.ensure_one()
        self.line_ids.unlink()
        self.write({
            'state': 'draft',
            'ocr_raw_data': False,
            'ocr_error_message': False,
            'bank_name': False,
            'branch_name': False,
            'account_number': False,
            'account_holder': False,
            'balance_start': 0,
            'balance_end': 0,
            'statement_period': False,
        })

    # ---- Export ----

    def _get_export_filename(self, extension):
        """Generate export filename: {bank_name}_{period}.{ext}"""
        parts = [p for p in [self.bank_name, self.statement_period] if p]
        name = '_'.join(parts) if parts else f'bank_statement_{self.id}'
        # Sanitize for filesystem
        name = name.replace('/', '-').replace('\\', '-')
        return f'{name}.{extension}'

    def action_export_xlsx(self):
        """Export statement to XLSX with formatted header and data rows."""
        self.ensure_one()

        try:
            import xlsxwriter
        except ImportError:
            raise UserError(_('xlsxwriter is not installed.'))

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        sheet = workbook.add_worksheet('Statement')

        # --- Styles ---
        title_fmt = workbook.add_format({
            'bold': True, 'font_size': 14,
        })
        info_fmt = workbook.add_format({'font_size': 10})
        header_fmt = workbook.add_format({
            'bold': True, 'font_size': 10, 'bottom': 1,
            'bg_color': '#f0f0f0',
        })
        header_right_fmt = workbook.add_format({
            'bold': True, 'font_size': 10, 'bottom': 1,
            'bg_color': '#f0f0f0', 'align': 'right',
        })
        text_fmt = workbook.add_format({'font_size': 10})
        date_fmt = workbook.add_format({
            'font_size': 10, 'num_format': 'yyyy-mm-dd',
        })
        num_fmt = workbook.add_format({
            'font_size': 10, 'num_format': '#,##0', 'align': 'right',
        })

        # --- Column widths ---
        sheet.set_column(0, 0, 12)   # Date
        sheet.set_column(1, 1, 30)   # Description
        sheet.set_column(2, 4, 15)   # Withdrawal / Deposit / Balance
        sheet.set_column(5, 5, 12)   # Reference

        # --- Header rows ---
        row = 0
        bank_title = ' '.join(
            p for p in [self.bank_name, self.branch_name] if p
        )
        sheet.write(row, 0, bank_title or 'Bank Statement', title_fmt)

        row = 1
        if self.account_number:
            parts = [f'口座番号: {self.account_number}']
            if self.account_holder:
                parts.append(f'名義: {self.account_holder}')
            sheet.write(row, 0, '  '.join(parts), info_fmt)

        row = 2
        if self.statement_period:
            sheet.write(row, 0, f'期間: {self.statement_period}', info_fmt)

        row = 3
        balance_info = f'期首残高: {self.balance_start:,.0f}  期末残高: {self.balance_end:,.0f}'
        sheet.write(row, 0, balance_info, info_fmt)

        # Row 4 = empty
        row = 5
        headers = ['日付', '摘要', '出金', '入金', '残高', '備考']
        for col, h in enumerate(headers):
            fmt = header_right_fmt if col in (2, 3, 4) else header_fmt
            sheet.write(row, col, h, fmt)

        # --- Data rows ---
        for line in self.line_ids.sorted('sequence'):
            row += 1
            sheet.write_datetime(
                row, 0,
                fields.Date.to_date(line.date) if isinstance(line.date, str) else line.date,
                date_fmt,
            )
            sheet.write(row, 1, line.description or '', text_fmt)
            sheet.write(row, 2, int(line.withdrawal), num_fmt)
            sheet.write(row, 3, int(line.deposit), num_fmt)
            sheet.write(row, 4, int(line.balance), num_fmt)
            sheet.write(row, 5, line.reference or '', text_fmt)

        workbook.close()

        filename = self._get_export_filename('xlsx')
        attachment = self.env['ir.attachment'].create({
            'name': filename,
            'type': 'binary',
            'datas': base64.b64encode(output.getvalue()),
            'res_model': self._name,
            'res_id': self.id,
            'mimetype': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })

        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/{attachment.id}?download=true',
            'target': 'self',
        }

    def action_export_csv(self):
        """Export statement to CSV with UTF-8 BOM for Excel compatibility."""
        self.ensure_one()

        output = io.BytesIO()
        output.write(b'\xef\xbb\xbf')  # UTF-8 BOM
        wrapper = io.TextIOWrapper(output, encoding='utf-8', newline='')
        writer = csv.writer(wrapper)

        writer.writerow(['日付', '摘要', '出金', '入金', '残高', '備考'])

        for line in self.line_ids.sorted('sequence'):
            writer.writerow([
                str(line.date) if line.date else '',
                line.description or '',
                int(line.withdrawal),
                int(line.deposit),
                int(line.balance),
                line.reference or '',
            ])

        wrapper.flush()
        wrapper.detach()  # Detach so closing BytesIO doesn't close wrapper

        filename = self._get_export_filename('csv')
        attachment = self.env['ir.attachment'].create({
            'name': filename,
            'type': 'binary',
            'datas': base64.b64encode(output.getvalue()),
            'res_model': self._name,
            'res_id': self.id,
            'mimetype': 'text/csv',
        })

        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/{attachment.id}?download=true',
            'target': 'self',
        }
