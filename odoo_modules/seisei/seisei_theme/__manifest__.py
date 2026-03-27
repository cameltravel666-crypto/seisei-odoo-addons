# -*- coding: utf-8 -*-
{
    'name': 'Seisei Theme',
    'version': '18.0.2.0.0',
    'category': 'Theme',
    'summary': 'Seisei branding theme - blue color scheme + Odoo debranding',
    'description': """
        Seisei Theme - White Label + Color Customization
        =================================================
        - Blue color scheme (#2563eb) matching company website
        - Remove Odoo branding (title, footer, logos)
        - Replace with Seisei branding
    """,
    'author': 'Seisei',
    'depends': ['web'],
    'data': [
        'views/webclient_templates.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
    'assets': {
        'web.assets_backend': [
            'seisei_theme/static/src/css/seisei_theme.css',
        ],
        'web.assets_frontend': [
            'seisei_theme/static/src/css/seisei_theme.css',
        ],
    },
}

