{
    'name': 'Seisei Messaging - WeChat Work',
    'version': '18.0.1.0.0',
    'category': 'Services/Messaging',
    'summary': 'WeChat Work (Enterprise WeChat) connector for messaging',
    'description': """
Seisei Messaging - WeChat Work Connector
==========================================
- WeChat Work external contact messaging adapter
- Callback URL verification (AES decryption)
- Access token refresh cron (every 2 hours)
- Inbound/outbound: text, image, video, file messages
- External contact -> res.partner sync
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'license': 'LGPL-3',
    'depends': [
        'seisei_messaging',
    ],
    'data': [
        'data/ir_cron_data.xml',
    ],
    'external_dependencies': {
        'python': ['wechatpy'],
    },
    'installable': True,
    'auto_install': False,
}
