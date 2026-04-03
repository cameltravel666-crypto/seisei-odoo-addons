import base64
import csv
import io
import logging
from collections import defaultdict

from odoo import models, fields, api, _
from odoo.exceptions import UserError

from ..utils.yayoi import (
    to_halfwidth_kana,
    truncate_yayoi,
)

_logger = logging.getLogger(__name__)


def _account_yayoi_name(account, fallback='雑費'):
    """Get Yayoi export name from an ocr.account record."""
    if not account:
        return fallback
    return account.yayoi_name or account.name or fallback


class YayoiExportWizard(models.TransientModel):
    _name = 'ocr.yayoi.export'
    _description = 'Yayoi Export Wizard'

    client_id = fields.Many2one(
        'ocr.client', 'Client', required=True,
    )
    date_from = fields.Date('Date From')
    date_to = fields.Date('Date To')
    export_mode = fields.Selection([
        ('summary', 'Summary (one row per document)'),
        ('detail', 'Detail (one row per line item)'),
    ], string='Export Mode', default='summary')
    document_ids = fields.Many2many(
        'ocr.document', string='Preview Documents', readonly=True,
    )
    document_count = fields.Integer('Document Count', compute='_compute_documents')
    line_count = fields.Integer('Line Count', compute='_compute_documents')
    total_amount = fields.Float('Total Amount', compute='_compute_documents')

    export_data = fields.Binary('Export File', readonly=True)
    export_filename = fields.Char('Filename')

    @api.depends('client_id', 'date_from', 'date_to')
    def _compute_documents(self):
        for rec in self:
            docs = rec._get_documents()
            rec.document_ids = docs
            rec.document_count = len(docs)
            rec.line_count = sum(len(d.line_ids) for d in docs)
            rec.total_amount = sum(d.amount for d in docs)

    def _get_documents(self):
        domain = [
            ('client_id', '=', self.client_id.id),
            ('state', 'in', ('done', 'reviewed')),
        ]
        if self.date_from:
            domain.append(('invoice_date', '>=', self.date_from))
        if self.date_to:
            domain.append(('invoice_date', '<=', self.date_to))
        return self.env['ocr.document'].search(domain, order='invoice_date, id')

    # ------------------------------------------------------------------
    # Memo / 摘要 rules
    # ------------------------------------------------------------------

    @staticmethod
    def _build_summary_memo(seq, doc):
        """No.{seq}--{MM/DD}-{seller}"""
        date_part = ''
        if doc.invoice_date:
            date_part = f'{doc.invoice_date.month}/{doc.invoice_date.day}'
        seller = doc.seller_name or ''
        return f'No.{seq:04d}--{date_part}-{seller}'

    # ------------------------------------------------------------------
    # Tax helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _line_tax_rate_int(line):
        """Get integer tax rate from line.tax_rate selection."""
        try:
            return int(line.tax_rate or '0')
        except (ValueError, TypeError):
            return 0

    @staticmethod
    def _tax_category(rate):
        if rate == 10:
            return '課対仕入込10%'
        if rate == 8:
            return '課対仕入込軽減8%'
        return '対象外'

    # ------------------------------------------------------------------
    # CSV row builder (25 columns)
    # ------------------------------------------------------------------

    def _build_row(self, seq, date_str, debit_name, debit_tax_cat,
                   amount, tax_amount, credit_name, memo, filename=''):
        t = truncate_yayoi
        h = to_halfwidth_kana
        return [
            '2000',                         # Col1: 識別フラグ
            seq,                            # Col2: 伝票番号
            '',                             # Col3: 決算
            date_str,                       # Col4: 取引日付
            t(debit_name, 24),              # Col5: 借方勘定科目
            '',                             # Col6: 借方補助科目
            '',                             # Col7: 借方部門
            debit_tax_cat,                  # Col8: 借方税区分
            int(amount),                    # Col9: 借方金額
            int(tax_amount),                # Col10: 借方税金額
            t(credit_name, 24),             # Col11: 貸方勘定科目
            '',                             # Col12: 貸方補助科目
            '',                             # Col13: 貸方部門
            '対象外',                        # Col14: 貸方税区分
            int(amount),                    # Col15: 貸方金額
            0,                              # Col16: 貸方税金額
            t(h(memo), 64),                 # Col17: 摘要
            '',                             # Col18: 番号
            '',                             # Col19: 期日
            0,                              # Col20: タイプ (0=仕訳)
            '',                             # Col21: 生成元
            t(h(filename), 64),             # Col22: 仕訳メモ → 文件名
            '0',                            # Col23: 付箋1
            '0',                            # Col24: 付箋2
            'no',                           # Col25: 調整
        ]

    # ------------------------------------------------------------------
    # Export: summary mode (per-document, split by tax rate)
    # ------------------------------------------------------------------

    def _export_summary(self, docs, writer, client):
        default_credit_name = _account_yayoi_name(client.default_credit_account, '現金')
        default_debit_name = _account_yayoi_name(client.default_debit_account, '仕入高')

        seq = 0
        for doc in docs:
            if not doc.invoice_date:
                _logger.warning('Yayoi export: skipping doc %s (no date)', doc.name)
                continue
            seq += 1

            d = doc.invoice_date
            date_str = f'{d.year}/{d.month}/{d.day}'

            memo = self._build_summary_memo(seq, doc)
            doc.summary = memo
            credit_name = default_credit_name

            # Aggregate line amounts by tax rate
            rate_amounts = defaultdict(float)
            rate_taxes = defaultdict(float)
            for line in doc.line_ids:
                if not line.debit_account:
                    continue
                rate = self._line_tax_rate_int(line)
                rate_amounts[rate] += line.gross_amount
                rate_taxes[rate] += line.tax_amount

            # Fallback: entire document amount as 10%
            if not rate_amounts and doc.amount:
                rate_amounts[10] = doc.amount

            # Determine majority debit account
            debit_name = default_debit_name
            if doc.line_ids:
                acct_totals = defaultdict(float)
                for line in doc.line_ids:
                    if line.debit_account:
                        acct_totals[line.debit_account.id] += line.gross_amount
                if acct_totals:
                    top_id = max(acct_totals, key=acct_totals.get)
                    top_acct = self.env['ocr.account'].browse(top_id)
                    debit_name = _account_yayoi_name(top_acct, default_debit_name)

            # Write rows: one per tax rate bucket
            for rate in sorted(rate_amounts.keys()):
                amount = rate_amounts[rate]
                if amount <= 0:
                    continue
                tax_cat = self._tax_category(rate)
                tax_amt = rate_taxes.get(rate, 0)
                writer.writerow(self._build_row(
                    seq, date_str, debit_name, tax_cat,
                    amount, tax_amt, credit_name, memo,
                    filename=doc.image_filename or doc.name or '',
                ))

    # ------------------------------------------------------------------
    # Export: detail mode (per-line)
    # ------------------------------------------------------------------

    def _export_detail(self, docs, writer, client):
        default_credit_name = _account_yayoi_name(client.default_credit_account, '現金')

        seq = 0
        for doc in docs:
            if not doc.invoice_date:
                _logger.warning('Yayoi export: skipping doc %s (no date)', doc.name)
                continue
            d = doc.invoice_date
            date_str = f'{d.year}/{d.month}/{d.day}'

            # Collect lines first to determine first_seq for memo
            lines_data = []
            first_seq = None
            for line in doc.line_ids.sorted(lambda l: (l.sequence, l.id)):
                if not line.debit_account:
                    continue
                seq += 1
                if first_seq is None:
                    first_seq = seq
                lines_data.append((seq, line))

            if not lines_data:
                continue

            memo = self._build_summary_memo(first_seq, doc)
            doc.summary = memo

            for line_seq, line in lines_data:
                debit_name = _account_yayoi_name(line.debit_account, '雑費')
                credit_name = _account_yayoi_name(
                    line.credit_account, default_credit_name)
                rate = self._line_tax_rate_int(line)
                tax_cat = self._tax_category(rate)

                writer.writerow(self._build_row(
                    line_seq, date_str, debit_name, tax_cat,
                    line.gross_amount, line.tax_amount, credit_name, memo,
                    filename=doc.image_filename or doc.name or '',
                ))

    # ------------------------------------------------------------------
    # Main export action
    # ------------------------------------------------------------------

    def action_export(self):
        self.ensure_one()
        docs = self._get_documents()
        if not docs:
            raise UserError(_('No recognized documents matching criteria.'))

        client = self.client_id

        output = io.BytesIO()
        wrapper = io.TextIOWrapper(output, encoding='cp932', newline='')
        writer = csv.writer(wrapper, quoting=csv.QUOTE_NONNUMERIC)

        if self.export_mode == 'summary':
            self._export_summary(docs, writer, client)
        else:
            self._export_detail(docs, writer, client)

        wrapper.flush()
        wrapper.detach()

        client_code = client.code or client.name
        mode_tag = 'sum' if self.export_mode == 'summary' else 'det'
        filename = f'yayoi_{client_code}_{mode_tag}_{fields.Date.today().strftime("%Y%m%d")}.txt'

        self.write({
            'export_data': base64.b64encode(output.getvalue()),
            'export_filename': filename,
        })

        return {
            'type': 'ir.actions.act_url',
            'url': (
                f'/web/content?model={self._name}'
                f'&id={self.id}'
                f'&field=export_data'
                f'&filename_field=export_filename'
                f'&download=true'
            ),
            'target': 'self',
        }
