{
    'name': 'Seisei Helpdesk - SLA',
    'version': '18.0.1.0.0',
    'category': 'Services/Helpdesk',
    'summary': 'SLA policies, deadline tracking, and escalation for helpdesk',
    'description': """
Seisei Helpdesk SLA
====================
- SLA policy definitions per team
- Per-ticket SLA status with deadline calculation using working calendars
- Breach detection cron (every 15 minutes)
- Escalation via mail.activity
- SLA badges on Kanban cards
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'license': 'LGPL-3',
    'depends': [
        'seisei_helpdesk',
        'resource',
    ],
    'data': [
        'security/ir.model.access.csv',
        'data/ir_cron_data.xml',
        'views/helpdesk_sla_views.xml',
        'views/helpdesk_ticket_views.xml',
        'views/helpdesk_team_views.xml',
    ],
    'installable': True,
    'auto_install': False,
}
