# -*- coding: utf-8 -*-
{
    'name': 'Seisei Google Doc Import',
    'version': '18.0.1.0.0',
    'category': 'Technical',
    'summary': 'Import data from Google Docs templates',
    'description': """
Seisei Google Doc Import
========================

Import initial data from Google Docs templates into Odoo.

Features:
- Configure Google Doc templates with Doc ID
- Parse tables from Google Docs
- Preview and validate data before import
- Import partners, products, and other data
- Full audit trail with import logs
- Idempotent imports (upsert by key fields)

Supported Data Types:
- Customers/Suppliers (res.partner)
- Products (product.template)
- Payment Terms (account.payment.term)
- Bank Accounts (res.partner.bank)

Configuration:
- seisei.gdoc.enabled: Enable/disable Google Doc import
- seisei.gdoc.service_account_json: Service account credentials (JSON)
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'depends': [
        'base',
        'base_setup',
        'contacts',
        'product',
        'account',
    ],
    'external_dependencies': {
        'python': ['google-api-python-client', 'google-auth'],
    },
    'data': [
        'security/ir.model.access.csv',
        'views/gdoc_template_views.xml',
        'views/gdoc_import_run_views.xml',
        'views/res_config_settings_views.xml',
        'views/menu.xml',
        'wizard/gdoc_import_wizard_views.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
    'license': 'LGPL-3',
}
