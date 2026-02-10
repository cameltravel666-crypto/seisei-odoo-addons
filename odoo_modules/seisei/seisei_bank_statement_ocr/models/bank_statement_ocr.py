import json
import logging

from odoo import models, fields, api
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class SeiseiBankStatementOcr(models.Model):
    _name = 'seisei.bank.statement.ocr'
    _description = 'Bank Statement OCR Record'
    _order = 'create_date desc'

    name = fields.Char(
        '名称', compute='_compute_name', store=True,
    )
    journal_id = fields.Many2one(
        'account.journal', '銀行口座', required=True,
        domain=[('type', '=', 'bank')],
    )
    attachment_ids = fields.Many2many('ir.attachment', string='スキャン画像/PDF')

    state = fields.Selection([
        ('draft', '下書き'),
        ('processing', 'OCR処理中'),
        ('review', '確認待ち'),
        ('done', 'インポート済み'),
        ('failed', 'エラー'),
    ], default='draft', string='状態')

    # OCR extracted header (all editable)
    bank_name = fields.Char('銀行名')
    branch_name = fields.Char('支店名')
    account_number = fields.Char('口座番号')
    account_holder = fields.Char('口座名義')
    statement_date = fields.Date('対账単日付')
    statement_period = fields.Char('対象期間')
    balance_start = fields.Float('期首残高', digits=(16, 0))
    balance_end = fields.Float('期末残高', digits=(16, 0))

    # OCR raw data
    ocr_raw_data = fields.Text('OCR Raw JSON')
    ocr_pages = fields.Integer('ページ数')
    ocr_error_message = fields.Text('エラーメッセージ')
    ocr_processed_at = fields.Datetime('OCR処理日時')

    # Transaction lines
    line_ids = fields.One2many(
        'seisei.bank.statement.ocr.line', 'ocr_id', '取引明細',
    )

    # Import result
    statement_id = fields.Many2one(
        'account.bank.statement', '生成された対账単', readonly=True,
    )

    # Balance integrity check
    balance_check_ok = fields.Boolean(
        '残高整合', compute='_compute_balance_check', store=True,
    )
    balance_diff = fields.Float(
        '差額', compute='_compute_balance_check', store=True, digits=(16, 0),
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

    # ---- OCR processing (Phase 2) ----

    def action_process_ocr(self):
        """Trigger OCR processing on attached files."""
        self.ensure_one()
        if not self.attachment_ids:
            raise UserError('ファイルが添付されていません。')

        self.state = 'processing'
        # Clear previous results
        self.line_ids.unlink()

        try:
            import base64 as b64
            from odoo.addons.odoo_ocr_final.models.llm_ocr import process_bank_statement

            # Process first attachment (primary statement file)
            attachment = self.attachment_ids[0]
            file_data = b64.b64decode(attachment.datas)
            mimetype = attachment.mimetype or 'application/pdf'

            result = process_bank_statement(
                file_data, mimetype, tenant_id=self.env.cr.dbname,
            )

            if result.get('success'):
                extracted = result['extracted']
                self.ocr_pages = result.get('pages', 1)
                self.ocr_processed_at = fields.Datetime.now()
                self._apply_ocr_result(extracted)
                self.state = 'review'
            else:
                self.ocr_error_message = result.get('error', 'Unknown error')
                self.state = 'failed'

            # Track OCR usage
            OcrUsage = self.env['ocr.usage'].sudo()
            if hasattr(OcrUsage, 'increment_usage'):
                OcrUsage.increment_usage(pages=self.ocr_pages or 1)

        except ImportError:
            self.ocr_error_message = 'odoo_ocr_final モジュールが見つかりません。'
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

        # Deduplicate transactions
        transactions = self._deduplicate_transactions(
            extracted.get('transactions', [])
        )

        # Create lines
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
        """Remove duplicate transactions based on (date, description, withdrawal, deposit)."""
        seen = set()
        unique = []
        for txn in transactions:
            key = (
                txn.get('date', ''),
                txn.get('description', ''),
                txn.get('withdrawal', 0),
                txn.get('deposit', 0),
            )
            if key not in seen:
                seen.add(key)
                unique.append(txn)
        return unique

    # ---- Partner matching (Phase 3) ----

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

    # ---- Import to statement (Phase 3) ----

    def action_confirm_import(self):
        """Create official account.bank.statement from reviewed OCR data."""
        self.ensure_one()
        if self.state != 'review':
            raise UserError('確認待ち状態でのみ取り込み可能です。')

        stmt_vals = {
            'name': f"OCR {self.bank_name or ''} {self.statement_period or ''}".strip(),
            'date': self.statement_date or fields.Date.today(),
            'balance_start': self.balance_start,
            'balance_end_real': self.balance_end,
            'journal_id': self.journal_id.id,
            'line_ids': [],
        }

        for line in self.line_ids.sorted('date'):
            unique_id = f"OCR-{self.id}-{line.id}-{line.date}-{line.amount}"
            stmt_vals['line_ids'].append((0, 0, {
                'date': line.date,
                'payment_ref': line.description,
                'amount': line.amount,
                'partner_id': line.partner_id.id if line.partner_id else False,
                'partner_name': line.partner_name or line.description,
                'unique_import_id': unique_id,
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
