# -*- coding: utf-8 -*-
{
    'name': 'Seisei Feature Gate',
    'version': '18.0.1.0.0',
    'category': 'Technical',
    'summary': 'Feature access control with trial period and entitlement checking',
    'description': '''
        Seisei Feature Gate
        ====================
        Intercepts key operations across Seisei modules and checks feature
        entitlements before allowing execution.

        - 30-day trial period for new tenants (all features unlocked)
        - After trial: requires active entitlement per feature
        - Integrates with seisei_entitlements for entitlement lookup
    ''',
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'depends': [
        'seisei_entitlements',
        'odoo_ocr_final',
        'ocr_file',
        'seisei_bank_statement_ocr',
        'qr_ordering',
        'seisei_account_reports',
        'seisei_print_manager',
        # 'bi_hr_payroll_jp',  # TODO: re-enable when installed
        # 'ai_companion',      # TODO: re-enable when installed
    ],
    'data': [
        'data/feature_gate_data.xml',
    ],
    'post_init_hook': '_post_init_hook',
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
