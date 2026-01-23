# -*- coding: utf-8 -*-
# Part of BrowseInfo. See LICENSE file for full copyright and licensing details.
{
    'name': 'HR Payroll Community Edition',
    "version" : "18.0.0.1",
    'category': 'Human Resources',
    'license': 'OPL-1',
    'summary': 'Odoo HR Payroll Community Payroll with Japan localization support for social insurance and withholding tax calculation',
    'description' :"""

        Manage your employee payroll records in odoo,
        HR Payroll module in odoo,
        Easy to create employee payslip in odoo,
        Manage your employee payroll or payslip records in odoo,
        Generating payroll in odoo,
        Each employee should be defined with contracts with salary structure in odoo,

        Japan Payroll Features:
        - 47 Prefecture-based health insurance rates
        - Standard monthly remuneration grades (50 grades)
        - Withholding tax table lookup
        - Employee dependant management
        - Care insurance calculation (ages 40-65)

    """,
    "author": "BROWSEINFO",
    "website" : "https://www.browseinfo.com/demo-request?app=bi_hr_payroll&version=18&edition=Community",
    'depends': [
        'hr_contract',
        'hr_holidays',
    ],
    'data': [
        'security/hr_payroll_security.xml',
        'security/ir.model.access.csv',
        'wizard/hr_payroll_payslips_by_employees_views.xml',
        'views/hr_contract_views.xml',
        'views/hr_salary_rule_views.xml',
        'views/hr_payslip_views.xml',
        'views/hr_employee_views.xml',
        'data/hr_payroll_sequence.xml',
        'views/hr_payroll_report.xml',
        'data/hr_payroll_data.xml',
        'wizard/hr_payroll_contribution_register_report_views.xml',
        'views/res_config_settings_views.xml',
        'views/report_contributionregister_templates.xml',
        'views/report_payslip_templates.xml',
        'views/report_payslipdetails_templates.xml',
        # Japan Payroll Data
        'data/hr_insurance_prefecture_data.xml',
        'data/hr_insurance_rate_data.xml',
        'data/hr_insurance_grade_data.xml',
        'data/hr_withholding_tax_data.xml',
        # Japan Payroll Views
        'views/hr_insurance_prefecture_views.xml',
        'views/hr_insurance_rate_views.xml',
        'views/hr_insurance_grade_views.xml',
        'views/hr_withholding_tax_views.xml',
        'views/res_company_views.xml',
        'views/japan_menu_views.xml',
        'wizard/hr_insurance_rate_import_views.xml',
    ],
    'demo': ['data/hr_payroll_demo.xml'],
    'auto_install': True,
    "installable": True,
    "live_test_url": 'https://www.browseinfo.com/demo-request?app=bi_hr_payroll&version=18&edition=Community',
    "images":['static/description/Banner.gif'],

}
