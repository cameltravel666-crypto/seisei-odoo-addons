# -*- coding: utf-8 -*-
{
    'name': 'Seisei HR Menu Restructure',
    'version': '18.0.1.0.0',
    'category': 'Human Resources',
    'summary': 'Restructure HR/Payroll menus for better UX',
    'description': """
HR/Payroll Menu Restructure
===========================
This module restructures the HR and Payroll menus into 4 top-level categories:
- Personnel (人事): Employee management
- Payroll (薪资): Daily payroll operations
- Reports (报表): HR and Payroll reports
- Settings (设置): Configuration (admin only)

Features:
- Role-based menu visibility
- Clean separation of daily operations and configuration
- Japan localization support (if bi_hr_payroll installed)
    """,
    'author': 'Seisei',
    'website': 'https://seisei.io',
    'license': 'LGPL-3',
    'depends': [
        'hr',
        'hr_contract',
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
