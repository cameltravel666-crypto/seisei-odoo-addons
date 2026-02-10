from odoo.tests.common import TransactionCase
from odoo.exceptions import UserError


class TestImportStatement(TransactionCase):
    """Test action_confirm_import → creates account.bank.statement."""

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

    def _create_reviewed_record(self):
        """Create an OCR record in 'review' state with 4 lines."""
        record = self.env['seisei.bank.statement.ocr'].create({
            'journal_id': self.bank_journal.id,
            'state': 'review',
            'bank_name': '三菱UFJ銀行',
            'statement_period': '2024/01',
            'statement_date': '2024-01-31',
            'balance_start': 1000000,
            'balance_end': 1250000,
        })
        OcrLine = self.env['seisei.bank.statement.ocr.line']
        OcrLine.create({
            'ocr_id': record.id, 'sequence': 10, 'date': '2024-01-05',
            'description': '振込 ヤマダタロウ', 'deposit': 50000, 'withdrawal': 0,
        })
        OcrLine.create({
            'ocr_id': record.id, 'sequence': 20, 'date': '2024-01-10',
            'description': 'カード引落し', 'deposit': 0, 'withdrawal': 30000,
        })
        OcrLine.create({
            'ocr_id': record.id, 'sequence': 30, 'date': '2024-01-15',
            'description': '振込 ABC', 'deposit': 300000, 'withdrawal': 0,
        })
        OcrLine.create({
            'ocr_id': record.id, 'sequence': 40, 'date': '2024-01-20',
            'description': 'ATM引出し', 'deposit': 0, 'withdrawal': 70000,
        })
        return record

    def test_creates_statement(self):
        """Confirm import creates an account.bank.statement."""
        record = self._create_reviewed_record()
        record.action_confirm_import()
        self.assertTrue(record.statement_id)
        self.assertEqual(record.state, 'done')

    def test_statement_has_correct_lines(self):
        """Statement should have 4 lines."""
        record = self._create_reviewed_record()
        record.action_confirm_import()
        stmt = record.statement_id
        self.assertEqual(len(stmt.line_ids), 4)

    def test_statement_balances(self):
        """Statement balance_start and balance_end_real should match."""
        record = self._create_reviewed_record()
        record.action_confirm_import()
        stmt = record.statement_id
        self.assertEqual(stmt.balance_start, 1000000)
        self.assertEqual(stmt.balance_end_real, 1250000)

    def test_line_amounts_correct(self):
        """First line: deposit 50000 → amount +50000."""
        record = self._create_reviewed_record()
        record.action_confirm_import()
        stmt = record.statement_id
        first_line = stmt.line_ids.sorted('date')[0]
        self.assertEqual(first_line.amount, 50000)
        self.assertEqual(first_line.payment_ref, '振込 ヤマダタロウ')

    def test_unique_import_ids(self):
        """Each line should have a unique_import_id."""
        record = self._create_reviewed_record()
        record.action_confirm_import()
        stmt = record.statement_id
        ids = stmt.line_ids.mapped('unique_import_id')
        self.assertEqual(len(ids), len(set(ids)), "unique_import_ids must be unique")

    def test_cannot_import_from_draft(self):
        """Should raise UserError if state != review."""
        record = self.env['seisei.bank.statement.ocr'].create({
            'journal_id': self.bank_journal.id,
            'state': 'draft',
        })
        with self.assertRaises(UserError):
            record.action_confirm_import()

    def test_cannot_import_twice(self):
        """After import (state=done), cannot import again."""
        record = self._create_reviewed_record()
        record.action_confirm_import()
        with self.assertRaises(UserError):
            record.action_confirm_import()
