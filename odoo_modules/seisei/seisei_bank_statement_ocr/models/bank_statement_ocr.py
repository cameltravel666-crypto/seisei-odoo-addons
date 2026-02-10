import json
import logging

from odoo import models, fields, api, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class SeiseiBankStatementOcr(models.Model):
    _name = 'seisei.bank.statement.ocr'
    _description = 'Bank Statement OCR Record'
    _order = 'create_date desc'

    name = fields.Char(
        'Name', compute='_compute_name', store=True,
    )
    journal_id = fields.Many2one(
        'account.journal', 'Bank Account', required=True,
        domain=[('type', '=', 'bank')],
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
    ], default='draft', string='State')

    # OCR extracted header (all editable)
    bank_name = fields.Char('Bank Name')
    branch_name = fields.Char('Branch')
    account_number = fields.Char('Account No.')
    account_holder = fields.Char('Holder')
    statement_date = fields.Date('Statement Date')
    statement_period = fields.Char('Period')
    balance_start = fields.Float('Opening Balance', digits=(16, 0))
    balance_end = fields.Float('Closing Balance', digits=(16, 0))

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
        readonly=True,
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

        try:
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
        # Sort by date for multi-page merge
        transactions.sort(key=lambda t: t.get('date', ''))

        OcrLine = self.env['seisei.bank.statement.ocr.line']
        for i, txn in enumerate(transactions):
            OcrLine.create({
                'ocr_id': self.id,
                'sequence': (i + 1) * 10,
                'date': txn.get('date'),
                'description': txn.get('description', ''),
                'withdrawal': txn.get('withdrawal', 0),
                'deposit': txn.get('deposit', 0),
                'balance': txn.get('balance') or 0,
                'reference': txn.get('reference', ''),
                'partner_name': txn.get('description', ''),
            })

        self._auto_match_partners()

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
