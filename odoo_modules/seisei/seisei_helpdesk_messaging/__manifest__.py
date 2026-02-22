{
    'name': 'Seisei Helpdesk - Messaging Bridge',
    'version': '18.0.1.0.0',
    'category': 'Services/Helpdesk',
    'summary': 'Bridge between helpdesk tickets and messaging conversations',
    'description': """
Seisei Helpdesk Messaging Bridge
==================================
- Auto-create tickets from incoming conversations
- AI auto-reply via ai_companion Dify integration
- Human takeover flow (AI stops when agent claims conversation)
- Reply from ticket -> messaging channel
- Conversation transcript embedded in ticket chatter
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'license': 'LGPL-3',
    'depends': [
        'seisei_helpdesk',
        'seisei_messaging',
        'ai_companion',
    ],
    'data': [
        'views/messaging_channel_views.xml',
        'views/helpdesk_ticket_views.xml',
        'views/messaging_conversation_views.xml',
    ],
    'installable': True,
    'auto_install': False,
}
