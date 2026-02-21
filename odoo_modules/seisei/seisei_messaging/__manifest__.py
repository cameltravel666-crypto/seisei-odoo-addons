{
    'name': 'Seisei Messaging',
    'version': '18.0.1.0.0',
    'category': 'Services/Messaging',
    'summary': 'Multi-channel messaging layer with adapter pattern',
    'description': """
Seisei Messaging
================
Abstract messaging layer providing:
- Channel configuration (WeChat Work, LINE, WhatsApp)
- Conversation and message management
- Adapter pattern for channel implementations
- Webhook controller for incoming messages
- Outbound message wizard
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'license': 'LGPL-3',
    'depends': [
        'base',
        'mail',
    ],
    'data': [
        'security/messaging_security.xml',
        'security/ir.model.access.csv',
        'views/messaging_channel_views.xml',
        'views/messaging_conversation_views.xml',
        'views/messaging_message_views.xml',
        'views/messaging_menu.xml',
        'wizards/send_message_wizard_views.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
