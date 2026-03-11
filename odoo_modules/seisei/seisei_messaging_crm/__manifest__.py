{
    'name': 'Seisei Messaging - CRM Bridge',
    'version': '18.0.1.0.0',
    'category': 'Sales/CRM',
    'summary': 'Bridge between CRM leads and messaging conversations',
    'description': """
Seisei Messaging CRM Bridge
==============================
- Auto-create CRM leads from incoming conversations
- Lead <-> Conversation bidirectional link
- Reply from lead -> messaging channel
- Conversation transcript visible in lead
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'license': 'LGPL-3',
    'depends': [
        'crm',
        'seisei_messaging',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/messaging_channel_views.xml',
        'views/messaging_conversation_views.xml',
        'views/crm_lead_views.xml',
    ],
    'installable': True,
    'auto_install': False,
}
