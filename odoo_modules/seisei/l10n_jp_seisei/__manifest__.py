# -*- coding: utf-8 -*-
{
    'name': 'Japan - Seisei Custom Chart of Accounts',
    'version': '18.0.1.0.0',
    'category': 'Accounting/Localizations/Account Charts',
    'description': """
Japan - Seisei Custom Chart of Accounts
========================================

This module provides a complete chart of accounts for Japanese businesses
with multilingual support (Japanese, English, Chinese).

Features:
---------
* Complete chart of accounts compliant with Japanese Small Business Accounting Standards
* 332 accounts covering all business needs
* Multilingual support:
  - Japanese (日本語) - Standard accounting terminology
  - English (UK) - Original terminology preserved
  - Simplified Chinese (简体中文) - Standard Chinese accounting terms

Account Categories:
-------------------
* Current Assets (流動資産)
* Fixed Assets (固定資産)
* Current Liabilities (流動負債)
* Non-current Liabilities (固定負債)
* Equity (純資産)
* Revenue (収益)
* Expenses (費用)

Special Features:
-----------------
* Tax accounting support (繰延税金資産・負債)
* Asset retirement obligations (資産除去債務)
* Goodwill and intangible assets (のれん・無形固定資産)
* Comprehensive expense accounts (販管費)
* Special gains/losses (特別損益)

Created by: Seisei ERP Team
Last Updated: 2026-02-04
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'depends': ['account'],
    'data': [
        'data/account.account.csv',
    ],
    'demo': [],
    'installable': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
