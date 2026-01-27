# -*- coding: utf-8 -*-
{
    'name': 'Seisei Admin Gate',
    'version': '18.0.1.0.0',
    'category': 'Technical',
    'summary': 'Restrict Odoo web client access to admin@seisei.tokyo only',
    'description': """
Seisei Admin Gate
=================

This module restricts access to the Odoo web client on *.erp.seisei.tokyo domains.

Features:
- Only admin@seisei.tokyo can log in to *.erp.seisei.tokyo
- Other users are redirected to a denial page
- Works as the second gate (Traefik is the first gate)

Configuration:
- Set ADMIN_EMAIL via ir.config_parameter or environment variable
- Default: admin@seisei.tokyo

This is part of the three-chain isolation architecture:
1. TENANT - BizNexus user operations
2. TRY_OCR - Public OCR demo
3. ADMIN - Backend access (this module)
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'depends': ['base', 'web'],
    'data': [
        'views/access_denied_template.xml',
        'data/ir_config_parameter.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
    'license': 'LGPL-3',
}
