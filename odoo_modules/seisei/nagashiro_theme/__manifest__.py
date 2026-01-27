# -*- coding: utf-8 -*-
{
    'name': 'Nagashiro Theme',
    'version': '18.0.1.0.0',
    'category': 'Theme',
    'summary': 'Nagashiro white-label theme for Odoo',
    'description': """
        Nagashiro Theme - White Label Customization
        ============================================
        
        This module customizes Odoo to remove branding and apply Nagashiro branding:
        - Custom Logo
        - Custom Favicon
        - Custom Title
        - Custom CSS Styling
        - Remove Odoo branding
        - Remove Odoo.com account menu item
    """,
    'author': 'Nagashiro',
    'website': 'https://seisei.tokyo',
    'depends': ['web', 'base', 'point_of_sale'],
    'data': [
        'views/webclient_templates.xml',
        'views/pos_receipt_templates.xml',
        'data/ir_config_parameter.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'nagashiro_theme/static/src/css/custom.css',
            # Temporarily disabled ALL JS to fix loading issues
            # 'nagashiro_theme/static/src/js/custom.js',
            # 'nagashiro_theme/static/src/js/user_menu_patch.js',
        ],
        'web.assets_frontend': [
            'nagashiro_theme/static/src/css/custom.css',
        ],
        'point_of_sale._assets_pos': [
            'nagashiro_theme/static/src/xml/pos_navbar.xml',
            'nagashiro_theme/static/src/css/custom.css',
            'nagashiro_theme/static/src/js/pos_logo_simple.js',
            'nagashiro_theme/static/src/js/pos_receipt_patch.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
