{
    'name': 'Seisei Messaging - LINE',
    'version': '18.0.1.0.0',
    'category': 'Services/Messaging',
    'summary': 'LINE Messaging API connector',
    'description': """
Seisei Messaging - LINE Connector
===================================
- LINE Messaging API adapter
- Webhook verification
- Reply and push messaging
- Rich content support
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'license': 'LGPL-3',
    'depends': [
        'seisei_messaging',
    ],
    'external_dependencies': {
        'python': ['linebot'],
    },
    'installable': True,
    'auto_install': False,
}
