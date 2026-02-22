{
    'name': 'Yayoi Import (Excel → TXT)',
    'version': '18.0.1.1.0',
    'category': 'Accounting',
    'summary': 'Upload Excel receipt list and export Yayoi Accounting TXT file',
    'description': '''
Yayoi Import Module
===================

Upload an Excel receipt spreadsheet (領収書整理) and export
a Yayoi Accounting compatible TXT file.

Features:
- Parse Excel file (領収書2 sheet) with receipt data
- Preview parsed lines before export
- Configurable debit/credit accounts
- Tax rate detection (非課税 / 8% / 10%)
- Export 25-column Yayoi TXT (cp932, QUOTE_NONNUMERIC)
    ''',
    'author': 'Seisei',
    'website': 'https://seisei.co.jp',
    'depends': ['account'],
    'data': [
        'security/ir.model.access.csv',
        'views/yayoi_import_wizard_views.xml',
    ],
    'external_dependencies': {
        'python': ['openpyxl'],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
