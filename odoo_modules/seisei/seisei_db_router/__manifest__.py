{
    'name': 'Seisei Database Router',
    'version': '18.0.1.1.0',
    'category': 'Technical',
    'summary': 'Auto-select database based on subdomain',
    'description': '''
        Routes requests to the correct database based on subdomain.
        Example: 00000001.erp.seisei.tokyo -> ten_00000001

        Also fixes login form visibility issue by removing d-none class.
    ''',
    'author': 'Seisei',
    'depends': ['base', 'web'],
    'data': [
        'views/login_templates.xml',
    ],
    'installable': True,
    'auto_install': True,
    'license': 'LGPL-3',
}
