# -*- coding: utf-8 -*-
{
    'name': 'Seisei HR Menu Restructure',
    'version': '18.0.1.1.0',
    'category': 'Human Resources',
    'summary': 'Restructure HR/Payroll menus for better UX',
    'description': """
HR/Payroll Menu Restructure
===========================
This module restructures the HR and Payroll menus into 4 top-level categories:

1. Personnel (人事): Employee and organizational management
   - Employees
   - Organization (Departments)
   - Contracts

2. Payroll (薪資): Daily payroll operations
   - Payslips
   - Batches
   - Japan: Social & Tax (insurance, withholding tax)

3. Reports (報表): HR and Payroll reports
   - HR Reports
   - Payroll Reports

4. Settings (設置): Configuration (admin only)
   - General Settings
   - Basic Data (Work Locations, Departure Reasons)
   - Payroll Configuration (Salary Structures, Rules, Categories)
   - Recruitment (Job Positions)

Permission Groups:
- group_seisei_store_manager: Can see Personnel + Reports
- group_seisei_hr_manager: Can see Personnel + Payroll (daily) + Reports
- group_seisei_hr_admin: Full access including Settings

Rollback:
- Simply uninstall this module to restore original menu structure
    """,
    'author': 'Seisei',
    'website': 'https://seisei.io',
    'license': 'LGPL-3',
    'depends': [
        'hr',
        'hr_contract',
        'bi_hr_payroll',
    ],
    'data': [
        'security/security.xml',
        'views/menu.xml',
        'views/menu_hide_legacy.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
