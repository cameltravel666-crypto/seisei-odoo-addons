# -*- coding: utf-8 -*-
{
    'name': 'Vendor Ops Core',
    'version': '19.0.4.0.0',
    'category': 'Operations',
    'summary': 'Core Vendor Operations module - Tenant & Intake Batch management with Entitlement Billing',
    'description': '''
        Vendor Ops Core Module
        ======================
        Unified module for Vendor Operations including:
        - Tenant management with auto-generated code/subdomain/domain (8-digit)
        - Intake batch management with Notion integration
        - Bridge API integration (create batch, generate pack, pull)
        - Start Intake wizard from Tenant form
        - Pull from Notion functionality
        - Error tracking with last_error and traceId

        Entitlement Management (Seisei Billing):
        - Feature definitions and product-to-feature mappings
        - Subscription-based entitlement calculation
        - Push entitlements to business database via API
        - Push logs for audit trail
        - Cron job for periodic entitlement reconciliation

        OCR Usage Management:
        - Sync OCR usage from central OCR service
        - Track per-tenant OCR usage and costs
        - Free quota and billable tracking
        - Automatic sync via cron job (every 6 hours)
    ''',
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'depends': ['base', 'mail', 'sale_subscription', 'product'],
    'data': [
        'security/ir.model.access.csv',
        'data/intake_batch_sequence.xml',
        'data/vendor_ops_tenant_sequence.xml',
        'data/seisei_cron.xml',
        # Load intake batch views FIRST (defines action_vendor_ops_intake_batch)
        'views/vendor_ops_intake_batch_views.xml',
        # Load push log views BEFORE tenant views (tenant views reference push log action)
        'views/seisei_push_log_views.xml',
        # Load tenant views SECOND (references action_vendor_ops_intake_batch and push log action)
        'views/vendor_ops_tenant_views.xml',
        'views/vendor_ops_start_intake_wizard_views.xml',
        'views/seisei_feature_views.xml',
        'views/seisei_product_feature_map_views.xml',
        'views/menu_views.xml',
    ],
    'post_init_hook': '_post_init_align_sequences',
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
