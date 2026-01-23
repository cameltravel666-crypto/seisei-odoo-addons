# -*- coding: utf-8 -*-
{
    'name': 'Seisei AR/AP Netting',
    'version': '18.0.1.0.0',
    'category': 'Accounting/Accounting',
    'summary': 'Net receivables and payables for the same partner',
    'description': """
Seisei AR/AP Netting (应收应付核销)
===================================

This module allows netting of receivables and payables for partners who are
both customers and suppliers.

Features:
- Smart button on partner form to access netting wizard
- Preview of open receivables and payables
- Create netting journal entry
- Automatic reconciliation of netted items
- Support for partial netting
- Multi-currency restriction (same currency only)
- Audit trail with memo

Compliance Note:
- Netting requires a designated clearing journal and account
- All netting entries include clear documentation of the source invoices
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'depends': [
        'account',
        'sale',
        'purchase',
    ],
    'data': [
        'security/ir.model.access.csv',
        'wizard/ar_ap_netting_wizard_views.xml',
        'views/res_partner_views.xml',
        'views/account_move_views.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
    'license': 'LGPL-3',
}
