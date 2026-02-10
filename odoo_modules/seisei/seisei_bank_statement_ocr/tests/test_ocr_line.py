from odoo.tests.common import TransactionCase


class TestBankStatementOcrLine(TransactionCase):
    """Test seisei.bank.statement.ocr.line — amount computation & balance warning."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Create a bank journal
        cls.bank_journal = cls.env['account.journal'].search(
            [('type', '=', 'bank')], limit=1
        )
        if not cls.bank_journal:
            cls.bank_journal = cls.env['account.journal'].create({
                'name': 'Test Bank',
                'type': 'bank',
                'code': 'TBNK',
            })
        # Create an OCR record
        cls.ocr_record = cls.env['seisei.bank.statement.ocr'].create({
            'journal_id': cls.bank_journal.id,
            'balance_start': 1000000,
            'balance_end': 1250000,
        })

    def _create_line(self, vals):
        defaults = {
            'ocr_id': self.ocr_record.id,
            'date': '2024-01-15',
            'description': 'テスト取引',
        }
        defaults.update(vals)
        return self.env['seisei.bank.statement.ocr.line'].create(defaults)

    # ---- amount computation tests ----

    def test_deposit_only(self):
        """Deposit of 50000 → amount = +50000."""
        line = self._create_line({'deposit': 50000, 'withdrawal': 0})
        self.assertEqual(line.amount, 50000)

    def test_withdrawal_only(self):
        """Withdrawal of 30000 → amount = -30000."""
        line = self._create_line({'deposit': 0, 'withdrawal': 30000})
        self.assertEqual(line.amount, -30000)

    def test_zero_amounts(self):
        """Both zero → amount = 0."""
        line = self._create_line({'deposit': 0, 'withdrawal': 0})
        self.assertEqual(line.amount, 0)

    def test_large_amount(self):
        """Large JPY amount (10M yen)."""
        line = self._create_line({'deposit': 10000000, 'withdrawal': 0})
        self.assertEqual(line.amount, 10000000)

    # ---- balance_warning tests ----

    def test_no_warning_first_line(self):
        """First line should never have balance_warning."""
        line = self._create_line({
            'sequence': 10,
            'deposit': 50000,
            'withdrawal': 0,
            'balance': 1050000,
        })
        self.assertFalse(line.balance_warning)

    def test_no_warning_consistent_balance(self):
        """Consistent balances → no warning."""
        self._create_line({
            'sequence': 10,
            'deposit': 50000,
            'withdrawal': 0,
            'balance': 1050000,
        })
        line2 = self._create_line({
            'sequence': 20,
            'deposit': 0,
            'withdrawal': 30000,
            'balance': 1020000,
        })
        self.assertFalse(line2.balance_warning)

    def test_warning_inconsistent_balance(self):
        """Inconsistent balance → balance_warning = True."""
        self._create_line({
            'sequence': 10,
            'deposit': 50000,
            'withdrawal': 0,
            'balance': 1050000,
        })
        line2 = self._create_line({
            'sequence': 20,
            'deposit': 0,
            'withdrawal': 30000,
            'balance': 999999,  # wrong! should be 1020000
        })
        self.assertTrue(line2.balance_warning)

    def test_no_warning_when_balance_is_zero(self):
        """If balance is 0 (not extracted), no warning."""
        self._create_line({
            'sequence': 10,
            'deposit': 50000,
            'withdrawal': 0,
            'balance': 1050000,
        })
        line2 = self._create_line({
            'sequence': 20,
            'deposit': 0,
            'withdrawal': 30000,
            'balance': 0,  # not extracted
        })
        self.assertFalse(line2.balance_warning)
