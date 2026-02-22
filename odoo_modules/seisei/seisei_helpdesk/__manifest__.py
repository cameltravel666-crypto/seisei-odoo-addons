{
    'name': 'Seisei Helpdesk',
    'version': '18.0.1.1.0',
    'category': 'Services/Helpdesk',
    'summary': 'Smart helpdesk with team management, ticket pipeline, and auto-assignment',
    'description': """
Seisei Helpdesk
===============
Core helpdesk module providing:
- Multi-team ticket management with Kanban pipeline
- Assignment algorithms: manual, round-robin, balanced, skill/tag-based
- Email-to-ticket via mail.alias
- Customer satisfaction rating
- Dashboard with key metrics
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'license': 'LGPL-3',
    'depends': [
        'base',
        'mail',
        'rating',
        'resource',
        'portal',
    ],
    'data': [
        'security/helpdesk_security.xml',
        'security/ir.model.access.csv',
        'data/ir_sequence_data.xml',
        'data/helpdesk_data.xml',
        'data/mail_template_data.xml',
        'views/helpdesk_stage_views.xml',
        'views/helpdesk_tag_views.xml',
        'views/helpdesk_ticket_views.xml',
        'views/helpdesk_team_views.xml',
        'views/helpdesk_dashboard_action.xml',
        'views/helpdesk_menu.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'seisei_helpdesk/static/src/dashboard/helpdesk_dashboard.js',
            'seisei_helpdesk/static/src/dashboard/helpdesk_dashboard.xml',
            'seisei_helpdesk/static/src/dashboard/helpdesk_dashboard.scss',
        ],
    },
    'installable': True,
    'application': True,
    'auto_install': False,
    'sequence': 90,
}
