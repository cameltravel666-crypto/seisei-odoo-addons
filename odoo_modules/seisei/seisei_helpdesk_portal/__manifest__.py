{
    'name': 'Seisei Helpdesk - Portal',
    'version': '18.0.1.0.0',
    'category': 'Services/Helpdesk',
    'summary': 'Customer self-service portal for helpdesk tickets',
    'description': """
Seisei Helpdesk Portal
=======================
- Customer ticket submission form
- View own tickets with status
- Ticket detail with comments
- Portal access via secure tokens
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'license': 'LGPL-3',
    'depends': [
        'seisei_helpdesk',
        'portal',
    ],
    'data': [
        'views/portal_templates.xml',
    ],
    'installable': True,
    'auto_install': False,
}
