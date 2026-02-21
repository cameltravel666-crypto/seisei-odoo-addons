{
    'name': 'AI智能票据处理',
    'version': '18.0.1.0.0',
    'category': 'Accounting',
    'summary': 'AI 批量智能处理发票、收据、采购单',
    'description': '''
        AI智能票据处理模块
        ================
        功能：
        - 批量上传票据图片
        - 一键批量识别
        - 自动提取发票号、金额、日期、商品明细
        - 支持日本零售小票、适格请求书、中国增值税发票
        - 识别结果可直接创建账单
    ''',
    'author': 'Your Company',
    'depends': ['base', 'account'],
    'data': [
        'security/ir.model.access.csv',
        'wizard/ocr_batch_import_views.xml',
        'views/ocr_views.xml',
        'views/menu_views.xml',
    ],
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}
