{
    'name': 'Financial OCR Integration',
    'version': '18.0.11.2.0',
    'category': 'Accounting',
    'summary': 'AI-powered OCR for Purchase Orders, Invoices, and Expenses',
    'description': '''
Financial OCR Integration Module
================================

AI-powered document recognition using Gemini/GPT:
- Upload images or PDFs via drag & drop or paste
- PDF automatically converted to images
- Automatic product matching and line creation
- Tax-inclusive (内税) price support
- Per-user usage tracking and billing

Features:
- Purchase order OCR scanning
- Invoice OCR scanning (supports Japanese receipts)
- Customer invoice OCR (out_invoice)
- Expense receipt OCR scanning
- Automatic vendor matching with tax_id (登録番号)
- Automatic product creation
- 8% / 10% tax rate detection
- Chatter-integrated upload zone
- Auto-compress images to 100KB
    ''',
    'author': 'Seisei',
    'website': 'https://seisei.co.jp',
    'depends': ['base', 'account', 'purchase', 'mail', 'hr_expense'],
    'data': [
        'security/ir.model.access.csv',
        'data/server_actions.xml',
        'views/account_move_views.xml',
        'views/purchase_order_views.xml',
        'wizard/ocr_data_wizard_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'custom_ocr_finance/static/src/css/ocr_chatter_upload.css',
            'custom_ocr_finance/static/src/js/ocr_chatter_upload.js',
        ],
    },
    'external_dependencies': {
        'python': ['PyMuPDF', 'requests'],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
