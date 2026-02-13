"""Tests for Reiwa era date normalization in bank statement OCR.

Imports the functions directly from llm_ocr.py to avoid triggering Odoo
package imports via models/__init__.py.
"""
import importlib.util
import os
import sys
import unittest

# Load llm_ocr module directly (bypass models/__init__.py which imports Odoo)
_llm_ocr_path = os.path.join(os.path.dirname(__file__), '..', 'models', 'llm_ocr.py')
_spec = importlib.util.spec_from_file_location('llm_ocr', _llm_ocr_path)
_llm_ocr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_llm_ocr)

_normalize_reiwa_date = _llm_ocr._normalize_reiwa_date
_normalize_bank_transactions = _llm_ocr._normalize_bank_transactions


class TestNormalizeReiwaDate(unittest.TestCase):

    def test_reiwa_7_converts(self):
        self.assertEqual(_normalize_reiwa_date('7-11-28'), '2025-11-28')

    def test_reiwa_7_zero_padded(self):
        self.assertEqual(_normalize_reiwa_date('0007-11-28'), '2025-11-28')

    def test_western_year_passthrough(self):
        self.assertEqual(_normalize_reiwa_date('2025-11-28'), '2025-11-28')

    def test_gemini_prepended_20_to_reiwa_7(self):
        """Gemini outputs 2007 instead of 7 for Reiwa 7."""
        self.assertEqual(_normalize_reiwa_date('2007-11-28'), '2025-11-28')

    def test_gemini_prepended_20_to_reiwa_6(self):
        self.assertEqual(_normalize_reiwa_date('2006-03-15'), '2024-03-15')

    def test_gemini_prepended_20_to_reiwa_1(self):
        self.assertEqual(_normalize_reiwa_date('2001-05-01'), '2019-05-01')

    def test_western_2019_passthrough(self):
        """2019+ are valid western years, should not be converted."""
        self.assertEqual(_normalize_reiwa_date('2019-01-15'), '2019-01-15')

    def test_empty_string(self):
        self.assertEqual(_normalize_reiwa_date(''), '')

    def test_reiwa_6(self):
        self.assertEqual(_normalize_reiwa_date('6-3-15'), '2024-03-15')

    def test_reiwa_1(self):
        self.assertEqual(_normalize_reiwa_date('1-5-1'), '2019-05-01')

    def test_slash_separator(self):
        self.assertEqual(_normalize_reiwa_date('7/11/28'), '2025-11-28')

    def test_invalid_date_passthrough(self):
        self.assertEqual(_normalize_reiwa_date('7-13-32'), '7-13-32')

    def test_none_returns_none(self):
        self.assertIsNone(_normalize_reiwa_date(None))

    def test_non_date_string_passthrough(self):
        self.assertEqual(_normalize_reiwa_date('abc'), 'abc')

    def test_whitespace_stripped(self):
        self.assertEqual(_normalize_reiwa_date('  7-11-28  '), '2025-11-28')


class TestNormalizeBankTransactions(unittest.TestCase):

    def test_normalizes_dates_in_transactions(self):
        txns = [
            {'date': '7-11-28', 'description': 'test', 'withdrawal': 0, 'deposit': 1000},
            {'date': '7-12-01', 'description': 'test2', 'withdrawal': 500, 'deposit': 0},
        ]
        result = _normalize_bank_transactions(txns)
        self.assertEqual(result[0]['date'], '2025-11-28')
        self.assertEqual(result[1]['date'], '2025-12-01')

    def test_preserves_western_dates(self):
        txns = [{'date': '2025-01-15', 'description': 'ok'}]
        result = _normalize_bank_transactions(txns)
        self.assertEqual(result[0]['date'], '2025-01-15')

    def test_handles_missing_date(self):
        txns = [{'description': 'no date'}]
        result = _normalize_bank_transactions(txns)
        self.assertNotIn('date', result[0])


if __name__ == '__main__':
    unittest.main()
