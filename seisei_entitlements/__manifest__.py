# -*- coding: utf-8 -*-
{
    'name': 'Seisei Entitlements',
    'version': '18.0.1.0.0',
    'category': 'Technical',
    'summary': 'Receive and manage entitlements from billing system',
    'description': '''
        Seisei Entitlements Module
        ==========================
        This module receives entitlements pushed from the billing system (Odoo 19)
        and manages feature access control for the business database.

        Features:
        - API endpoint to receive entitlements
        - Store and manage active features
        - API key authentication
        - Feature access checking utility
        - Entitlement history logging
    ''',
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'depends': ['base', 'mail'],
    'data': [
        'security/ir.model.access.csv',
        'data/seisei_config_data.xml',
        'views/seisei_entitlement_views.xml',
        'views/seisei_api_key_views.xml',
        'views/menu_views.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
