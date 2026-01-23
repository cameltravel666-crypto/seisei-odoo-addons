{
    'name': 'Seisei Billing',
    'version': '19.0.1.0.0',
    'category': 'Sales/Subscriptions',
    'summary': 'Subscription billing and entitlement management for Seisei BizNexus',
    'description': """
Seisei Billing Module
=====================
- Tenant management with business database integration
- Feature/module definition and mapping to subscription products
- Automatic entitlement calculation based on active subscriptions
- API push to business database for entitlement synchronization
- Cron job for periodic entitlement reconciliation
    """,
    'author': 'Seisei',
    'website': 'https://seisei.com',
    'license': 'OPL-1',
    'depends': [
        'base',
        'mail',
        'sale_subscription',
        'account',
    ],
    'data': [
        'security/ir.model.access.csv',
        'data/cron.xml',
        'views/seisei_feature_views.xml',
        'views/seisei_product_feature_map_views.xml',
        'views/seisei_push_log_views.xml',
        'views/seisei_tenant_views.xml',
        'views/menu.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
