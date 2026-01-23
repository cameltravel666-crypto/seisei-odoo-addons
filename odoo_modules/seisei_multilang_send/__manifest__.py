# -*- coding: utf-8 -*-
{
    'name': 'Seisei Multi-Language Document Sending',
    'version': '18.0.1.0.0',
    'category': 'Sales/Sales',
    'summary': 'Select language when sending documents (SO/PO/Invoice)',
    'description': """
Seisei Multi-Language Document Sending
======================================

This module allows users to select the language when sending documents:
- Sales Orders / Quotations
- Purchase Orders / RFQs
- Invoices / Bills

Features:
- Language selection dropdown in send wizards
- Email templates rendered in selected language
- PDF reports rendered in selected language
- Default language from partner.lang
- Does NOT modify partner.lang permanently

Supported Languages:
- Japanese (ja_JP)
- English (en_US)
- Chinese Simplified (zh_CN)
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'depends': [
        'sale',
        'purchase',
        'account',
        'mail',
    ],
    'data': [
        'views/mail_compose_message_views.xml',
        'views/account_move_send_wizard_views.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
    'license': 'LGPL-3',
}
