from odoo.tests.common import TransactionCase
from odoo.fields import Command


class TestGeneralLedger(TransactionCase):
    """Test the General Ledger report."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # Create test accounts
        cls.account_revenue = cls.env['account.account'].create({
            'name': 'GL Test Revenue',
            'code': '401001',
            'account_type': 'income',
        })
        cls.account_receivable = cls.env['account.account'].create({
            'name': 'GL Test Receivable',
            'code': '111001',
            'account_type': 'asset_receivable',
        })

        # Journal
        cls.journal = cls.env['account.journal'].search(
            [('type', '=', 'general')], limit=1
        )
        if not cls.journal:
            cls.journal = cls.env['account.journal'].create({
                'name': 'GL Test Journal',
                'type': 'general',
                'code': 'TGLJ',
            })

        # Create multiple entries for GL testing
        for i, (date, amount) in enumerate([
            ('2025-03-01', 10000),
            ('2025-03-10', 20000),
            ('2025-03-20', 15000),
        ]):
            move = cls.env['account.move'].create({
                'journal_id': cls.journal.id,
                'date': date,
                'line_ids': [
                    Command.create({
                        'account_id': cls.account_receivable.id,
                        'debit': amount,
                        'credit': 0,
                        'name': f'GL Test Entry {i+1}',
                    }),
                    Command.create({
                        'account_id': cls.account_revenue.id,
                        'debit': 0,
                        'credit': amount,
                        'name': f'GL Test Entry {i+1}',
                    }),
                ],
            })
            move.action_post()

        cls.gl_report = cls.env.ref('seisei_account_reports.general_ledger_report')

    def _get_options(self, date_from='2025-01-01', date_to='2025-12-31'):
        """Get GL report options."""
        options = self.gl_report.get_options(previous_options={
            'date': {
                'date_from': date_from,
                'date_to': date_to,
            },
        })
        return options

    def test_gl_has_account_lines(self):
        """GL should show account header lines."""
        options = self._get_options()
        info = self.gl_report.get_report_information(options)
        lines = info['lines']

        # Should have at least 2 account headers (revenue + receivable)
        account_headers = [l for l in lines if l.get('level') == 0]
        self.assertGreaterEqual(len(account_headers), 2,
                                "GL should have at least 2 account headers")

    def test_gl_account_grouping(self):
        """Lines should be grouped by account."""
        options = self._get_options()
        info = self.gl_report.get_report_information(options)
        lines = info['lines']

        # Find our test account
        revenue_header = next(
            (l for l in lines if '401001' in l.get('name', '')),
            None,
        )
        self.assertIsNotNone(revenue_header,
                             "Revenue account header should be in GL")

    def test_gl_unfold_account(self):
        """Expanding an account should show move lines."""
        options = self._get_options()
        # Unfold all to see detail lines
        options['unfold_all'] = True

        info = self.gl_report.get_report_information(options)
        lines = info['lines']

        # Should have detail lines (level 2)
        detail_lines = [l for l in lines if l.get('level') == 2
                        and not l.get('load_more')
                        and 'Initial Balance' not in l.get('name', '')]
        self.assertGreater(len(detail_lines), 0,
                           "GL should have detail move lines when unfolded")

    def test_gl_accumulated_balance(self):
        """Detail lines should show cumulative balance."""
        options = self._get_options()
        options['unfold_all'] = True

        info = self.gl_report.get_report_information(options)
        lines = info['lines']

        # Find detail lines under the receivable account
        recv_header = next(
            (l for l in lines if '111001' in l.get('name', '')),
            None,
        )
        if recv_header:
            recv_detail = [
                l for l in lines
                if l.get('parent_id') == recv_header['id']
                and l.get('level') == 2
                and not l.get('load_more')
                and 'Initial Balance' not in l.get('name', '')
            ]
            if len(recv_detail) >= 2:
                # Balance should increase cumulatively
                bal1 = recv_detail[0]['columns'][-1]['no_format']
                bal2 = recv_detail[1]['columns'][-1]['no_format']
                self.assertGreater(bal2, bal1,
                                   "Cumulative balance should increase")

    def test_gl_debit_credit(self):
        """Detail lines should have debit and credit values."""
        options = self._get_options()
        options['unfold_all'] = True

        info = self.gl_report.get_report_information(options)
        lines = info['lines']

        # Find a detail line
        detail_line = next(
            (l for l in lines if l.get('level') == 2
             and not l.get('load_more')
             and 'Initial Balance' not in l.get('name', '')),
            None,
        )
        if detail_line:
            # Should have 6 columns: Date, Communication, Partner, Debit, Credit, Balance
            self.assertEqual(len(detail_line['columns']), 6,
                             "GL detail line should have 6 columns")

    def test_gl_report_information(self):
        """get_report_information should return valid structure."""
        options = self._get_options()
        info = self.gl_report.get_report_information(options)

        self.assertIn('lines', info)
        self.assertIsInstance(info['lines'], list)
        self.assertIn('column_headers_render_data', info)
