# -*- coding: utf-8 -*-
{
    'name': 'Accounting Report Excel Export',
    'version': '18.0.1.0.0',
    'category': 'Accounting',
    'summary': 'Export accounting reports to Excel format',
    'description': '''
        This module adds Excel export functionality to accounting reports.
        - Profit and Loss Excel export
        - Balance Sheet Excel export
        - General Ledger Excel export
        - Trial Balance Excel export
    ''',
    'author': 'Seisei ERP',
    'website': 'https://seisei.co.jp',
    'license': 'LGPL-3',
    'depends': ['base_accounting_kit'],
    'external_dependencies': {
        'python': ['xlsxwriter'],
    },
    'data': [
        'views/financial_report_views.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
}
