{
    'name': 'Intelligent OCR Recognition',
    'version': '18.0.5.1.0',
    'category': 'Accounting',
    'summary': 'AI-powered batch recognition of invoices, receipts, and purchase orders',
    'description': '''
        Intelligent OCR Recognition
        ===========================
        Features:
        - Batch upload document images
        - One-click batch recognition
        - Auto-extract invoice numbers, amounts, dates, line items
        - Supports Japanese retail receipts, qualified invoices, Chinese VAT invoices
        - Create accounting entries from OCR results
        - Multi-client management with per-client document assignment
        - Yayoi accounting format export
    ''',
    'author': 'Seisei Inc.',
    'depends': ['base', 'account'],
    'data': [
        'security/ir.model.access.csv',
        'data/ocr_account_data.xml',
        'data/cron.xml',
        'wizard/ocr_batch_import_views.xml',
        'wizard/yayoi_export_wizard_views.xml',
        'wizard/batch_credit_account_views.xml',
        'views/ocr_views.xml',
        'views/ocr_audit_views.xml',
        'views/menu_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'invoice_ocr/static/src/css/ocr_form.css',
        ],
    },
    'pre_init_hook': '_pre_init_migrate_accounts',
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}
