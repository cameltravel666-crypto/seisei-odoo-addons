# -*- coding: utf-8 -*-
{
    'name': 'Seisei Theme',
    'version': '18.0.1.0.3',
    'category': 'Theme',
    'summary': 'Custom theme for Seisei - Blue color scheme matching company website',
    'description': """
        This module customizes Odoo's color scheme to match Seisei's company website.
        Changes the default purple theme to blue (#2563eb) to maintain brand consistency.
    """,
    'author': 'Seisei',
    'depends': ['web', 'mail'],
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
    'assets': {
        'web.assets_backend': [
            'seisei_theme/static/src/css/seisei_theme.css',
        ],
    },
}

