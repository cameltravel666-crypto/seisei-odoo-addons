import base64
import csv
import io
import logging

from odoo import models, fields, api, _
from odoo.exceptions import UserError

from ..utils.yayoi import (
    to_halfwidth_kana,
    truncate_yayoi,
    DEBIT_ACCOUNT_NAMES,
    CREDIT_ACCOUNT_NAMES,
)

_logger = logging.getLogger(__name__)


class YayoiExportWizard(models.TransientModel):
    _name = 'ocr.yayoi.export'
    _description = '弥生导出向导'

    client_id = fields.Many2one(
        'ocr.client', '客户', required=True,
    )
    date_from = fields.Date('开始日期')
    date_to = fields.Date('结束日期')
    document_ids = fields.Many2many(
        'ocr.document', string='预览票据', readonly=True,
    )
    document_count = fields.Integer('票据数', compute='_compute_documents')
    line_count = fields.Integer('明细行数', compute='_compute_documents')
    total_amount = fields.Float('合计金额', compute='_compute_documents')

    export_data = fields.Binary('导出文件', readonly=True)
    export_filename = fields.Char('文件名')

    @api.depends('client_id', 'date_from', 'date_to')
    def _compute_documents(self):
        for rec in self:
            docs = rec._get_documents()
            rec.document_ids = docs
            rec.document_count = len(docs)
            rec.line_count = sum(len(d.line_ids) for d in docs)
            rec.total_amount = sum(d.amount for d in docs)

    def _get_documents(self):
        """Get matching documents for the selected client and date range."""
        domain = [
            ('client_id', '=', self.client_id.id),
            ('state', '=', 'done'),
        ]
        if self.date_from:
            domain.append(('invoice_date', '>=', self.date_from))
        if self.date_to:
            domain.append(('invoice_date', '<=', self.date_to))
        return self.env['ocr.document'].search(domain, order='invoice_date, id')

    def action_preview(self):
        """Refresh preview."""
        self._compute_documents()
        return {
            'type': 'ir.actions.act_window',
            'res_model': self._name,
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }

    def action_export(self):
        """Export Yayoi-compatible TXT file."""
        self.ensure_one()
        docs = self._get_documents()
        if not docs:
            raise UserError(_('没有符合条件的已识别票据。'))

        t = truncate_yayoi
        h = to_halfwidth_kana

        # Client default accounts
        client = self.client_id
        default_credit_key = client.default_credit_account or 'genkin'
        default_credit_name = CREDIT_ACCOUNT_NAMES.get(default_credit_key, '現金')

        output = io.BytesIO()
        wrapper = io.TextIOWrapper(output, encoding='cp932', newline='')
        writer = csv.writer(wrapper, quoting=csv.QUOTE_NONNUMERIC)

        seq = 0
        for doc in docs:
            for line in doc.line_ids.sorted(lambda l: (l.sequence, l.id)):
                # Skip summary lines (合計) — they are not journal entries
                if not line.debit_account:
                    continue

                seq += 1

                # Date
                date_str = ''
                if doc.invoice_date:
                    d = doc.invoice_date
                    date_str = f'{d.year}/{d.month}/{d.day}'

                # Debit account
                debit_key = line.debit_account
                debit_name = DEBIT_ACCOUNT_NAMES.get(debit_key, '雑費')

                # Credit account: line > client default
                credit_key = line.credit_account or default_credit_key
                credit_name = CREDIT_ACCOUNT_NAMES.get(credit_key, default_credit_name)

                # Tax rate determination
                rate = 0
                if line.tax_rate:
                    try:
                        rate = int(line.tax_rate.replace('%', '').strip())
                    except (ValueError, AttributeError):
                        pass
                if rate == 0:
                    # Infer from document-level tax amounts
                    if doc.tax_amount_10 and doc.tax_amount_10 > 0:
                        rate = 10
                    elif doc.tax_amount_8 and doc.tax_amount_8 > 0:
                        rate = 8

                if rate == 10:
                    debit_tax_cat = '課対仕入込10%'
                elif rate == 8:
                    debit_tax_cat = '課対仕入込軽減8%'
                else:
                    debit_tax_cat = '対象外'

                credit_tax_cat = '対象外'

                # Tax amount for this line (estimate)
                if rate in (8, 10):
                    tax_amount = round(line.amount * rate / (100 + rate), 0)
                else:
                    tax_amount = 0

                # Memo: seller_name + item name
                memo_parts = []
                if doc.seller_name:
                    memo_parts.append(doc.seller_name)
                if line.name:
                    memo_parts.append(line.name)
                memo = ' '.join(memo_parts)

                row = [
                    '2000',                         # Col1: 識別フラグ
                    seq,                            # Col2: 伝票番号
                    '',                             # Col3: 決算
                    date_str,                       # Col4: 取引日付
                    t(debit_name, 24),              # Col5: 借方勘定科目
                    '',                             # Col6: 借方補助科目
                    '',                             # Col7: 借方部門
                    debit_tax_cat,                  # Col8: 借方税区分
                    line.amount,                    # Col9: 借方金額
                    tax_amount,                     # Col10: 借方税金額
                    t(credit_name, 24),             # Col11: 貸方勘定科目
                    '',                             # Col12: 貸方補助科目
                    '',                             # Col13: 貸方部門
                    credit_tax_cat,                 # Col14: 貸方税区分
                    line.amount,                    # Col15: 貸方金額
                    0,                              # Col16: 貸方税金額
                    t(h(memo), 64),                 # Col17: 摘要
                    '',                             # Col18: 番号
                    '',                             # Col19: 期日
                    0,                              # Col20: タイプ (0=仕訳)
                    '',                             # Col21: 生成元
                    t(h(memo), 64),                 # Col22: 仕訳メモ
                    '0',                            # Col23: 付箋1
                    '0',                            # Col24: 付箋2
                    'no',                           # Col25: 調整
                ]
                writer.writerow(row)

        wrapper.flush()
        wrapper.detach()

        client_code = client.code or client.name
        filename = f'yayoi_{client_code}_{fields.Date.today().strftime("%Y%m%d")}.txt'

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
