# -*- coding: utf-8 -*-
{
    'name': 'Japan Payroll / 日本給与計算',
    'version': '18.0.1.0.0',
    'category': 'Human Resources/Payroll',
    'summary': 'Japanese payroll calculation with social insurance and tax',
    'description': """
日本給与計算モジュール
======================

機能:
- 都道府県別健康保険料率管理
- 標準報酬月額等級表
- 源泉徴収税額表（甲欄）
- 社会保険料自動計算（健康保険、介護保険、厚生年金、雇用保険）
- 所得税・住民税計算
- 年度別料率管理・インポート機能

Japanese Payroll Module
=======================

Features:
- Prefecture-based health insurance rates
- Standard monthly remuneration grade table
- Withholding tax table (Column A)
- Automatic social insurance calculation
- Income tax and resident tax calculation
- Annual rate management and import
    """,
    'author': 'Seisei ERP',
    'website': 'https://seisei.app',
    'license': 'LGPL-3',
    'depends': [
        'base',
        'hr',
        'hr_contract',
        'mail',
    ],
    'data': [
        # Security
        'security/ir.model.access.csv',
        # Data - load order matters
        'data/hr_insurance_prefecture_data.xml',
        'data/hr_insurance_grade_data.xml',
        'data/hr_insurance_rate_data.xml',
        'data/hr_withholding_tax_data.xml',
        # Views
        'views/hr_insurance_prefecture_views.xml',
        'views/hr_insurance_rate_views.xml',
        'views/hr_insurance_grade_views.xml',
        'views/hr_withholding_tax_views.xml',
        'views/hr_employee_views.xml',
        'views/res_company_views.xml',
        'views/menu_views.xml',
        # Wizards
        'wizard/hr_insurance_rate_import_views.xml',
    ],
    'demo': [],
    'installable': True,
    'auto_install': False,
    'application': False,
}
