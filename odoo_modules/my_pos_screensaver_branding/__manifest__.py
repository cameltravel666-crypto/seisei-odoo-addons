# -*- coding: utf-8 -*-
{
    'name': 'My POS Screensaver Branding',
    'version': '18.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Replace Odoo logo with custom logo in POS screensaver',
    'description': """
        My POS Screensaver Branding
        ===========================
        
        This module replaces the Odoo logo in POS screensaver/idle screen
        with a custom Nagashiro logo.
        
        Features:
        - Template inheritance approach (no core module modification)
        - Replaces logo in POS idle/screensaver screen
        - Custom logo: Nagashiro.png
    """,
    'author': 'Nagashiro',
    'website': 'https://seisei.tokyo',
    'depends': ['point_of_sale'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'my_pos_screensaver_branding/static/src/xml/screen_saver.xml',
            'my_pos_screensaver_branding/static/src/css/screen_saver.css',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}

