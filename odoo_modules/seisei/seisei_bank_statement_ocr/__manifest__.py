{
    'name': 'AI銀行明細解析 / Bank Statement AI',
    'version': '18.0.1.12.0',
    'category': 'Accounting',
    'summary': 'AI-powered import for scanned bank statements (PDF/Image)',
    'description': """
        Scan paper bank statements using AI (Gemini 2.0 Flash) and import
        them as electronic bank statements for automatic reconciliation.

        Features:
        - Upload PDF or image scans of bank statements
        - AI-powered extraction of transactions
        - Review and edit extracted data before import
        - Automatic partner matching
        - Balance integrity verification
        - Batch upload support
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'depends': ['base', 'account', 'mail', 'odoo_ocr_final', 'base_accounting_kit'],
    'data': [
        'security/ir.model.access.csv',
        'views/bank_statement_ocr_views.xml',
        'views/account_journal_views.xml',
        'views/wizard_views.xml',
    ],
    'external_dependencies': {'python': []},
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
