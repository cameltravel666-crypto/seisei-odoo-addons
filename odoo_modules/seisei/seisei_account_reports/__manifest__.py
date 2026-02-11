{
    'name': '財務報表 / Financial Reports',
    'version': '18.0.1.2.1',
    'category': 'Accounting',
    'summary': 'Interactive financial reports: P&L, Balance Sheet, General Ledger',
    'description': """
        Interactive financial reports for Odoo 18 Community Edition.
        Ported from Odoo 19 Enterprise account_reports.

        Features:
        - Profit & Loss statement
        - Balance Sheet
        - General Ledger
        - Expandable/collapsible drill-down
        - Click-through to journal items
        - PDF and XLSX export
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'depends': ['account'],
    'data': [
        'security/ir.model.access.csv',
        'views/report_template.xml',
        'data/profit_and_loss.xml',
        'data/balance_sheet.xml',
        'data/general_ledger.xml',
        'data/account_report_actions.xml',
        'data/menuitems.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'seisei_account_reports/static/src/js/util.js',
            'seisei_account_reports/static/src/components/account_report/**/*.js',
            'seisei_account_reports/static/src/components/account_report/**/*.xml',
            'seisei_account_reports/static/src/components/account_report/**/*.scss',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
