# -*- coding: utf-8 -*-

{
    'name': 'Sheet Forge',
    'version': '18.0.1.0.0',
    'category': 'Tools',
    'license': 'LGPL-3',
    'summary': 'AI document processing with Excel template filling',
    'description': """
        Document AI File Module
        ===============

        This module provides AI-based document processing with Excel template filling.

        Features:
        - Upload Excel template and source document (image/PDF)
        - Extract data from documents using AI (via custom_ocr_finance)
        - Automatically fill Excel templates with extracted data
        - Edit extracted data before filling template
        - Download filled Excel files

        Workflow:
        1. Create a new AI task
        2. Upload your Excel template with placeholders like {{vendor_name}}, {{invoice_date}}
        3. Upload the source invoice/receipt image or PDF
        4. Click "Start AI" to process
        5. Review and edit extracted data
        6. Click "Fill Template" to generate output
        7. Download the filled Excel file
    """,
    'author': 'Seisei ERP',
    'website': 'https://seisei.co.jp',
    'depends': [
        'base',
        'mail',
    ],
    'external_dependencies': {
        'python': ['openpyxl'],
    },
    'data': [
        'security/ir.model.access.csv',
        'wizard/upload_wizard_views.xml',
        'views/ocr_file_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'ocr_file/static/src/js/multi_file_upload.js',
            'ocr_file/static/src/xml/multi_file_upload.xml',
        ],
    },
    'demo': [],
    'installable': True,
    'application': True,
    'auto_install': False,
    'images': ['static/description/icon.png'],
    'post_init_hook': '_post_init_fix_null_states',
}
