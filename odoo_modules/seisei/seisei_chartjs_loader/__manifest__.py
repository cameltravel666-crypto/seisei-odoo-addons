# -*- coding: utf-8 -*-
{
    'name': 'Seisei Chart.js Loader',
    'version': '18.0.1.0.0',
    'category': 'Technical',
    'summary': 'Ensures Chart.js library is loaded for accounting dashboards',
    'description': """
Seisei Chart.js Loader
======================

This module fixes the "Chart is not defined" error in accounting dashboards
by ensuring Chart.js is properly loaded in the web assets bundle.

Technical Details:
- In Odoo 18, Chart.js is not loaded by default
- The account module's JournalDashboardGraphField requires Chart.js
- This module adds Chart.js to web.assets_backend bundle
- Must be installed for accounting dashboard graphs to work

Reference: https://www.odoo.com/forum/help-1/how-can-i-render-graph-using-chartjs-247569
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'depends': ['web', 'account'],
    'assets': {
        'web.assets_backend': [
            # Ensure Chart.js is loaded before other dashboard widgets
            ('prepend', '/web/static/lib/Chart/Chart.js'),
        ],
    },
    'installable': True,
    'auto_install': True,  # Auto-install when account module is installed
    'application': False,
    'license': 'LGPL-3',
}
