from odoo.tests.common import TransactionCase


class TestPartnerMatching(TransactionCase):
    """Test _auto_match_partners logic."""

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
        # Create known partners
        cls.partner_yamada = cls.env['res.partner'].create({
            'name': 'ヤマダタロウ',
        })
        cls.partner_abc = cls.env['res.partner'].create({
            'name': 'カブシキガイシャABC',
        })
        cls.ocr_record = cls.env['seisei.bank.statement.ocr'].create({
            'journal_id': cls.bank_journal.id,
            'balance_start': 1000000,
            'balance_end': 1250000,
        })

    def _create_line(self, description, **kwargs):
        vals = {
            'ocr_id': self.ocr_record.id,
            'date': '2024-01-15',
            'description': description,
            'deposit': 50000,
            'withdrawal': 0,
        }
        vals.update(kwargs)
        return self.env['seisei.bank.statement.ocr.line'].create(vals)

    def test_match_by_exact_name(self):
        """Description exactly matches partner name."""
        line = self._create_line('カブシキガイシャABC')
        self.ocr_record._auto_match_partners()
        self.assertEqual(line.partner_id, self.partner_abc)

    def test_match_by_furikomi_prefix(self):
        """'振込 ヤマダタロウ' → matches partner ヤマダタロウ."""
        line = self._create_line('振込 ヤマダタロウ')
        self.ocr_record._auto_match_partners()
        self.assertEqual(line.partner_id, self.partner_yamada)

    def test_match_by_furikomi_zenkaku_space(self):
        """'振込　ヤマダタロウ' (full-width space) → matches."""
        line = self._create_line('振込　ヤマダタロウ')
        self.ocr_record._auto_match_partners()
        self.assertEqual(line.partner_id, self.partner_yamada)

    def test_no_match_unknown(self):
        """Unknown description → partner_id stays empty."""
        line = self._create_line('ATM引出し')
        self.ocr_record._auto_match_partners()
        self.assertFalse(line.partner_id)

    def test_skip_already_matched(self):
        """If partner_id already set, don't overwrite."""
        other = self.env['res.partner'].create({'name': 'Other'})
        line = self._create_line('振込 ヤマダタロウ', partner_id=other.id)
        self.ocr_record._auto_match_partners()
        self.assertEqual(line.partner_id, other)
