# -*- coding: utf-8 -*-
{
    'name': 'Nagashiro Theme',
    'version': '18.0.2.0.0',
    'category': 'Theme',
    'summary': 'Nagashiro white-label theme for Odoo',
    'description': """
        Nagashiro Theme - White Label Customization
        ============================================

        This module customizes Odoo to remove branding and apply Nagashiro branding:
        - Custom Logo
        - Custom Title
        - Custom CSS Styling
        - Remove Odoo branding from UI, menus, emails
        - Remove Odoo.com account / documentation / support menu items
        - Rename OdooBot to Seisei
    """,
    'author': 'Nagashiro',
    'website': 'https://seisei.tokyo',
    'depends': ['web', 'base', 'point_of_sale', 'mail'],
    'data': [
        'views/webclient_templates.xml',
        'views/pos_receipt_templates.xml',
        'views/mail_templates.xml',
        'data/ir_config_parameter.xml',
        'data/odoobot_rename.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'nagashiro_theme/static/src/css/custom.css',
            'nagashiro_theme/static/src/js/user_menu_patch.js',
            'nagashiro_theme/static/src/js/title_service_patch.js',
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
