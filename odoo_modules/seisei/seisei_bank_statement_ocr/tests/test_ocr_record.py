from odoo.tests.common import TransactionCase
from odoo.exceptions import UserError


class TestBankStatementOcrRecord(TransactionCase):
    """Test seisei.bank.statement.ocr — state machine & balance check."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.bank_journal = cls.env['account.journal'].search(
            [('type', '=', 'bank')], limit=1
        )
        if not cls.bank_journal:
            cls.bank_journal = cls.env['account.journal'].create({
                'name': 'Test Bank',
                'type': 'bank',
                'code': 'TBNK',
            })

    def _create_ocr_record(self, **kwargs):
        vals = {
            'journal_id': self.bank_journal.id,
            'balance_start': 1000000,
            'balance_end': 1250000,
        }
        vals.update(kwargs)
        return self.env['seisei.bank.statement.ocr'].create(vals)

    def _add_lines(self, record):
        """Add the standard 4 test transactions that sum to +250000."""
        OcrLine = self.env['seisei.bank.statement.ocr.line']
        OcrLine.create({
            'ocr_id': record.id, 'sequence': 10, 'date': '2024-01-05',
            'description': '振込 ヤマダタロウ', 'deposit': 50000, 'withdrawal': 0,
            'balance': 1050000,
        })
        OcrLine.create({
            'ocr_id': record.id, 'sequence': 20, 'date': '2024-01-10',
            'description': 'カード引落し', 'deposit': 0, 'withdrawal': 30000,
            'balance': 1020000,
        })
        OcrLine.create({
            'ocr_id': record.id, 'sequence': 30, 'date': '2024-01-15',
            'description': '振込 カブシキガイシャABC', 'deposit': 300000, 'withdrawal': 0,
            'balance': 1320000,
        })
        OcrLine.create({
            'ocr_id': record.id, 'sequence': 40, 'date': '2024-01-20',
            'description': 'ATM引出し', 'deposit': 0, 'withdrawal': 70000,
            'balance': 1250000,
        })

    # ---- default state ----

    def test_default_state_is_draft(self):
        record = self._create_ocr_record()
        self.assertEqual(record.state, 'draft')

    # ---- balance check ----

    def test_balance_check_ok_when_balanced(self):
        """balance_start(1M) + deposits(350k) - withdrawals(100k) = 1.25M = balance_end."""
        record = self._create_ocr_record()
        self._add_lines(record)
        record.invalidate_recordset()
        self.assertTrue(record.balance_check_ok)
        self.assertAlmostEqual(record.balance_diff, 0, places=0)

    def test_balance_check_fails_when_unbalanced(self):
        """Wrong balance_end → balance_check_ok = False."""
        record = self._create_ocr_record(balance_end=9999999)
        self._add_lines(record)
        record.invalidate_recordset()
        self.assertFalse(record.balance_check_ok)
        self.assertNotAlmostEqual(record.balance_diff, 0, places=0)

    def test_balance_check_empty_lines(self):
        """No lines → balance_start should equal balance_end for check to pass."""
        record = self._create_ocr_record(balance_start=100, balance_end=100)
        record.invalidate_recordset()
        self.assertTrue(record.balance_check_ok)

    def test_balance_check_empty_lines_unbalanced(self):
        """No lines but start != end → fail."""
        record = self._create_ocr_record(balance_start=100, balance_end=200)
        record.invalidate_recordset()
        self.assertFalse(record.balance_check_ok)

    # ---- name computation ----

    def test_name_computed(self):
        record = self._create_ocr_record(
            bank_name='三菱UFJ銀行', statement_period='2024/01',
        )
        self.assertIn('三菱UFJ銀行', record.name)
