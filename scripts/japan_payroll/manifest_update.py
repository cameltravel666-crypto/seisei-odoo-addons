# -*- coding: utf-8 -*-
# Part of BrowseInfo. See LICENSE file for full copyright and licensing details.
{
    'name': 'HR Payroll Community Edition',
    "version" : "18.0.0.1",
    'category': 'Human Resources',
    'license': 'OPL-1',
    'summary': 'Odoo HR Payroll with Japan Social Insurance and Tax calculations',
    'description' :"""

        Manage your employee payroll records in odoo,
        HR Payroll module in odoo with Japan-specific features:
        - Social Insurance calculation by prefecture
        - Insurance grades (等級) management
        - Withholding tax (源泉徴収) calculation
        - My Number (マイナンバー) management
        - Care insurance applicability

    """,
    "author": "BROWSEINFO, Seisei",
    "website" : "https://www.browseinfo.com/demo-request?app=bi_hr_payroll&version=18&edition=Community",
    'depends': [
        'hr_contract',
        'hr_holidays',
        'hr',
    ],
    'data': [
        # Security
        'security/hr_payroll_security.xml',
        'security/ir.model.access.csv',
        # Wizards
        'wizard/hr_payroll_payslips_by_employees_views.xml',
        # Views
        'views/hr_contract_views.xml',
        'views/hr_salary_rule_views.xml',
        'views/hr_payslip_views.xml',
        'views/hr_employee_views.xml',
        # Japan Payroll Views
        'views/hr_insurance_prefecture_views.xml',
        'views/hr_insurance_grade_views.xml',
        'views/hr_insurance_rate_views.xml',
        'views/hr_withholding_tax_views.xml',
        'views/hr_employee_japan_views.xml',
        'views/japan_payroll_menu.xml',
        # Data
        'data/hr_payroll_sequence.xml',
        'views/hr_payroll_report.xml',
        'data/hr_payroll_data.xml',
        'wizard/hr_payroll_contribution_register_report_views.xml',
        'views/res_config_settings_views.xml',
        'views/report_contributionregister_templates.xml',
        'views/report_payslip_templates.xml',
        'views/report_payslipdetails_templates.xml',
    ],
    'demo': ['data/hr_payroll_demo.xml'],
    'auto_install': True,
    "installable": True,
    "live_test_url": 'https://www.browseinfo.com/demo-request?app=bi_hr_payroll&version=18&edition=Community',
    "images":['static/description/Banner.gif'],

}
