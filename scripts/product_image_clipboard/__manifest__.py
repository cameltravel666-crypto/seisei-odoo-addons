{
    'name': 'Product Image Clipboard',
    'version': '18.0.1.0.0',
    'category': 'Sales/Sales',
    'summary': 'Paste images from clipboard to product',
    'description': '''
Product Image Clipboard
=======================

Paste images directly from clipboard to set as product image.

Features:
- Ctrl+V to paste image from clipboard
- Drag & drop image support
- Click to upload
- Auto-compress large images
- Visual feedback with upload zone
    ''',
    'author': 'Seisei',
    'website': 'https://seisei.co.jp',
    'depends': ['product', 'sale'],
    'data': [],
    'assets': {
        'web.assets_backend': [
            'product_image_clipboard/static/src/css/product_image_clipboard.css',
            'product_image_clipboard/static/src/js/product_image_clipboard.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
