from odoo.tests.common import TransactionCase
from odoo.fields import Command


class TestReportEngine(TransactionCase):
    """Test the account report computation engine."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # Create test accounts
        cls.account_revenue = cls.env['account.account'].create({
            'name': 'Test Revenue',
            'code': '400001',
            'account_type': 'income',
        })
        cls.account_expense = cls.env['account.account'].create({
            'name': 'Test Expense',
            'code': '600001',
            'account_type': 'expense',
        })
        cls.account_receivable = cls.env['account.account'].create({
            'name': 'Test Receivable',
            'code': '110001',
            'account_type': 'asset_receivable',
        })
        cls.account_bank = cls.env['account.account'].create({
            'name': 'Test Bank',
            'code': '100001',
            'account_type': 'asset_cash',
        })
        cls.account_payable = cls.env['account.account'].create({
            'name': 'Test Payable',
            'code': '200001',
            'account_type': 'liability_payable',
        })
        cls.account_equity = cls.env['account.account'].create({
            'name': 'Test Equity',
            'code': '300001',
            'account_type': 'equity',
        })

        # Create a misc journal
        cls.journal = cls.env['account.journal'].search(
            [('type', '=', 'general')], limit=1
        )
        if not cls.journal:
            cls.journal = cls.env['account.journal'].create({
                'name': 'Test Journal',
                'type': 'general',
                'code': 'TGEN',
            })

        # Create test journal entries
        # Revenue entry: 50,000
        cls.move_revenue = cls.env['account.move'].create({
            'journal_id': cls.journal.id,
            'date': '2025-06-15',
            'line_ids': [
                Command.create({
                    'account_id': cls.account_receivable.id,
                    'debit': 50000,
                    'credit': 0,
                    'name': 'Test Revenue',
                }),
                Command.create({
                    'account_id': cls.account_revenue.id,
                    'debit': 0,
                    'credit': 50000,
                    'name': 'Test Revenue',
                }),
            ],
        })
        cls.move_revenue.action_post()

        # Expense entry: 30,000
        cls.move_expense = cls.env['account.move'].create({
            'journal_id': cls.journal.id,
            'date': '2025-06-20',
            'line_ids': [
                Command.create({
                    'account_id': cls.account_expense.id,
                    'debit': 30000,
                    'credit': 0,
                    'name': 'Test Expense',
                }),
                Command.create({
                    'account_id': cls.account_bank.id,
                    'debit': 0,
                    'credit': 30000,
                    'name': 'Test Expense',
                }),
            ],
        })
        cls.move_expense.action_post()

        # Get the P&L report
        cls.pl_report = cls.env.ref('seisei_account_reports.profit_and_loss')
        cls.bs_report = cls.env.ref('seisei_account_reports.balance_sheet')

    def _get_options(self, report, date_from='2025-01-01', date_to='2025-12-31'):
        """Get report options with specific dates."""
        options = report.get_options(previous_options={
            'date': {
                'date_from': date_from,
                'date_to': date_to,
            },
        })
        return options

    # ---- P&L Tests ----

    def test_profit_and_loss_revenue(self):
        """Revenue should show 50,000."""
        options = self._get_options(self.pl_report)
        info = self.pl_report.get_report_information(options)
        lines = info['lines']

        # Find Revenue line
        revenue_line = next(
            (l for l in lines if 'Revenue' in l.get('name', '') and l.get('level') == 1),
            None,
        )
        self.assertIsNotNone(revenue_line, "Revenue line should exist")
        # Revenue is -sum (negated), so positive means income
        balance = revenue_line['columns'][0]['no_format']
        self.assertAlmostEqual(balance, 50000, places=0,
                               msg="Revenue should be 50,000")

    def test_profit_and_loss_expense(self):
        """Operating expenses should show 30,000."""
        options = self._get_options(self.pl_report)
        info = self.pl_report.get_report_information(options)
        lines = info['lines']

        expense_line = next(
            (l for l in lines if 'Operating Expenses' in l.get('name', '')),
            None,
        )
        self.assertIsNotNone(expense_line, "Operating Expenses line should exist")
        balance = expense_line['columns'][0]['no_format']
        self.assertAlmostEqual(balance, 30000, places=0,
                               msg="Operating Expenses should be 30,000")

    def test_profit_and_loss_net_profit(self):
        """Net Profit = Revenue - Expenses = 50,000 - 30,000 = 20,000."""
        options = self._get_options(self.pl_report)
        info = self.pl_report.get_report_information(options)
        lines = info['lines']

        net_line = next(
            (l for l in lines if 'Net Profit' in l.get('name', '')),
            None,
        )
        self.assertIsNotNone(net_line, "Net Profit line should exist")
        balance = net_line['columns'][0]['no_format']
        self.assertAlmostEqual(balance, 20000, places=0,
                               msg="Net Profit should be 20,000")

    # ---- Balance Sheet Tests ----

    def test_balance_sheet_has_assets(self):
        """Balance sheet should have Assets line."""
        options = self._get_options(self.bs_report)
        info = self.bs_report.get_report_information(options)
        lines = info['lines']

        assets_line = next(
            (l for l in lines if l.get('name') == 'Assets'),
            None,
        )
        self.assertIsNotNone(assets_line, "Assets line should exist")

    def test_balance_sheet_liabilities_equity(self):
        """Balance Sheet: Liabilities + Equity line should exist."""
        options = self._get_options(self.bs_report)
        info = self.bs_report.get_report_information(options)
        lines = info['lines']

        le_line = next(
            (l for l in lines if 'Liabilities + Equity' in l.get('name', '')),
            None,
        )
        self.assertIsNotNone(le_line, "Liabilities + Equity line should exist")

    def test_balance_sheet_balanced(self):
        """Assets should equal Liabilities + Equity."""
        options = self._get_options(self.bs_report)
        info = self.bs_report.get_report_information(options)
        lines = info['lines']

        assets_line = next(
            (l for l in lines if l.get('name') == 'Assets'), None
        )
        le_line = next(
            (l for l in lines if 'Liabilities + Equity' in l.get('name', '')), None
        )

        if assets_line and le_line:
            assets_val = assets_line['columns'][0]['no_format']
            le_val = le_line['columns'][0]['no_format']
            self.assertAlmostEqual(assets_val, le_val, places=0,
                                   msg="Assets should equal Liabilities + Equity")

    # ---- Expand/Fold Tests ----

    def test_expand_line(self):
        """Expanding a foldable line should return child lines."""
        options = self._get_options(self.pl_report)
        info = self.pl_report.get_report_information(options)
        lines = info['lines']

        # Find Revenue line (it's foldable with groupby)
        revenue_line = next(
            (l for l in lines if l.get('name') == 'Revenue'),
            None,
        )
        if revenue_line and revenue_line.get('unfoldable'):
            result = self.pl_report.get_expanded_lines(
                options, revenue_line['id']
            )
            # Should return lines (may be empty if no data matches groupby)
            self.assertIn('lines', result)

    # ---- Audit Cell Tests ----

    def test_audit_cell(self):
        """Clicking a cell value should return an action to show journal items."""
        options = self._get_options(self.pl_report)
        info = self.pl_report.get_report_information(options)
        lines = info['lines']

        # Find a line with auditable column
        for line in lines:
            for col in line.get('columns', []):
                if col.get('auditable') and not col.get('is_zero'):
                    params = {
                        'report_line_id': col['report_line_id'],
                        'expression_label': col['expression_label'],
                        'calling_line_dict_id': line['id'],
                    }
                    result = self.pl_report.action_audit_cell(options, params)
                    self.assertEqual(result.get('type'), 'ir.actions.act_window')
                    self.assertEqual(result.get('res_model'), 'account.move.line')
                    return

    # ---- Hide Zero Lines Tests ----

    def test_hide_zero_lines(self):
        """Lines with zero balance should be hidden when hide_0_lines is True."""
        options = self._get_options(self.pl_report)
        options['hide_0_lines'] = True
        info = self.pl_report.get_report_information(options)
        lines = info['lines']

        # Depreciation should be hidden (no entries)
        dep_line = next(
            (l for l in lines if l.get('name') == 'Depreciation'),
            None,
        )
        self.assertIsNone(dep_line,
                          "Depreciation line should be hidden when zero")

    # ---- Filter Tests ----

    def test_filter_draft(self):
        """Draft entries should be excluded by default."""
        # Create a draft entry
        move_draft = self.env['account.move'].create({
            'journal_id': self.journal.id,
            'date': '2025-06-25',
            'line_ids': [
                Command.create({
                    'account_id': self.account_revenue.id,
                    'debit': 0,
                    'credit': 10000,
                    'name': 'Draft Revenue',
                }),
                Command.create({
                    'account_id': self.account_receivable.id,
                    'debit': 10000,
                    'credit': 0,
                    'name': 'Draft Revenue',
                }),
            ],
        })
        # Don't post — keep as draft

        # Without draft
        options = self._get_options(self.pl_report)
        options['all_entries'] = False
        info = self.pl_report.get_report_information(options)
        lines_no_draft = info['lines']

        # With draft
        options['all_entries'] = True
        # Need to recompute
        info_with_draft = self.pl_report.get_report_information(options)
        lines_with_draft = info_with_draft['lines']

        # Revenue should be higher with draft included
        rev_no_draft = next(
            (l for l in lines_no_draft if l.get('name') == 'Revenue'), None
        )
        rev_with_draft = next(
            (l for l in lines_with_draft if l.get('name') == 'Revenue'), None
        )

        if rev_no_draft and rev_with_draft:
            val_no_draft = rev_no_draft['columns'][0]['no_format']
            val_with_draft = rev_with_draft['columns'][0]['no_format']
            self.assertGreater(val_with_draft, val_no_draft,
                               "Revenue should be higher with draft entries")

    def test_report_information_structure(self):
        """get_report_information should return expected keys."""
        options = self._get_options(self.pl_report)
        info = self.pl_report.get_report_information(options)

        self.assertIn('lines', info)
        self.assertIn('column_headers_render_data', info)
        self.assertIn('options', info)
        self.assertIn('report', info)
        self.assertIn('buttons', info)
        self.assertIn('filters', info)
