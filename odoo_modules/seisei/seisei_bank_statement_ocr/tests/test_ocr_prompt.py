import json
import os

from odoo.tests.common import TransactionCase


class TestOcrPromptParsing(TransactionCase):
    """Test _apply_ocr_result with mock OCR data."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.bank_journal = cls.env['account.journal'].search(
            [('type', '=', 'bank')], limit=1
        )
        if not cls.bank_journal:
            cls.bank_journal = cls.env['account.journal'].create({
                'name': 'Test Bank', 'type': 'bank', 'code': 'TBNK',
            })
        # Load sample OCR response
        test_data_dir = os.path.join(
            os.path.dirname(__file__), 'test_data',
        )
        with open(os.path.join(test_data_dir, 'sample_statement.json')) as f:
            cls.sample_response = json.load(f)

    def test_apply_result_fills_header(self):
        """OCR result populates bank_name, branch, account_number, balances."""
        record = self.env['seisei.bank.statement.ocr'].create({
            'journal_id': self.bank_journal.id,
        })
        record._apply_ocr_result(self.sample_response['extracted'])
        self.assertEqual(record.bank_name, '三菱UFJ銀行')
        self.assertEqual(record.branch_name, '新宿支店')
        self.assertEqual(record.account_number, '1234567')
        self.assertEqual(record.balance_start, 1000000)
        self.assertEqual(record.balance_end, 1250000)

    def test_apply_result_creates_lines(self):
        """4 transactions → 4 OCR lines."""
        record = self.env['seisei.bank.statement.ocr'].create({
            'journal_id': self.bank_journal.id,
        })
        record._apply_ocr_result(self.sample_response['extracted'])
        self.assertEqual(len(record.line_ids), 4)

    def test_apply_result_line_amounts(self):
        """Verify individual line amounts."""
        record = self.env['seisei.bank.statement.ocr'].create({
            'journal_id': self.bank_journal.id,
        })
        record._apply_ocr_result(self.sample_response['extracted'])
        lines = record.line_ids.sorted('sequence')
        self.assertEqual(lines[0].amount, 50000)   # deposit
        self.assertEqual(lines[1].amount, -30000)   # withdrawal
        self.assertEqual(lines[2].amount, 300000)   # deposit
        self.assertEqual(lines[3].amount, -70000)   # withdrawal

    def test_apply_result_stores_raw_json(self):
        """Raw OCR JSON should be stored."""
        record = self.env['seisei.bank.statement.ocr'].create({
            'journal_id': self.bank_journal.id,
        })
        record._apply_ocr_result(self.sample_response['extracted'])
        self.assertTrue(record.ocr_raw_data)
        parsed = json.loads(record.ocr_raw_data)
        self.assertEqual(parsed['bank_name'], '三菱UFJ銀行')

    def test_deduplication(self):
        """Duplicate transactions should be removed."""
        extracted = self.sample_response['extracted'].copy()
        # Duplicate the first transaction
        extracted['transactions'] = (
            extracted['transactions'] + [extracted['transactions'][0]]
        )
        record = self.env['seisei.bank.statement.ocr'].create({
            'journal_id': self.bank_journal.id,
        })
        record._apply_ocr_result(extracted)
        self.assertEqual(len(record.line_ids), 4, "Duplicate should be removed")

    def test_balance_check_after_apply(self):
        """After applying sample data, balance check should pass."""
        record = self.env['seisei.bank.statement.ocr'].create({
            'journal_id': self.bank_journal.id,
        })
        record._apply_ocr_result(self.sample_response['extracted'])
        record.invalidate_recordset()
        self.assertTrue(record.balance_check_ok)
