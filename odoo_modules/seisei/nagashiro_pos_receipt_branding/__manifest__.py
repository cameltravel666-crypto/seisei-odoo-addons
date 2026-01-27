# -*- coding: utf-8 -*-
{
    'name': 'Nagashiro POS Receipt Branding',
    'version': '18.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Replace "由 Odoo 提供支持" with "由 Nagashiro 提供支持" in POS receipt',
    'description': """
        Nagashiro POS Receipt Branding
        ==============================
        
        This module replaces the "由 Odoo 提供支持" (Powered by Odoo) text 
        in POS receipt footer with "由 Nagashiro 提供支持" (Powered by Nagashiro).
        
        Features:
        - Template inheritance approach (no core module modification)
        - Compatible with Chinese interface
        - Works with Odoo 18 POS receipt template
    """,
    'author': 'Nagashiro',
    'website': 'https://seisei.tokyo',
    'depends': ['point_of_sale'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'nagashiro_pos_receipt_branding/static/src/xml/receipt_branding.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}

