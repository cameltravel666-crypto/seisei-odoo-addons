{
    'name': 'POS 売上ダッシュボード / POS Sales Dashboard',
    'version': '18.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'POS日次・月次売上KPIダッシュボード',
    'description': '''
POS Sales Dashboard
===================

POS backend menu に売上KPIダッシュボードを追加します。

機能:
- 日次/月次売上金額・注文件数・客単価
- フード/ドリンク別売上
- 前日/前月比較（増減率）
- 商品売上ランキング Top 10
- POS設定別フィルタ
- 日付ピッカー
    ''',
    'author': 'Seisei',
    'website': 'https://seisei.co.jp',
    'license': 'LGPL-3',
    'depends': [
        'point_of_sale',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/dashboard_action.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'pos_sales_dashboard/static/src/dashboard/pos_sales_dashboard.js',
            'pos_sales_dashboard/static/src/dashboard/pos_sales_dashboard.xml',
            'pos_sales_dashboard/static/src/dashboard/pos_sales_dashboard.scss',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
