{
    'name': 'Seisei AI Usage Billing (Odoo 19)',
    'version': '18.0.1.0.0',
    'category': 'Accounting',
    'summary': 'Report AI usage directly to Odoo 19 for centralized billing',
    'description': '''
Seisei AI Usage Billing
==================

Reports AI usage from Odoo 18 directly to Odoo 19's vendor.ops.tenant model
via the AI webhook endpoint. This enables centralized AI billing management
for direct-login tenants that bypass BizNexus.

Features:
- Hook into AI completion events (odoo_ocr_final + ocr_file)
- Report AI usage to Odoo 19 webhook in background thread (non-blocking)
- Auto-detect tenant code from database name
- Month-reset support for AI usage counters
- Configurable via ir.config_parameter
    ''',
    'author': 'Seisei',
    'website': 'https://seisei.co.jp',
    'depends': ['base', 'account', 'odoo_ocr_final'],
    'data': [
        'data/ir_config_parameter.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
