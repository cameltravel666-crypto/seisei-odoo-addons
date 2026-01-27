# -*- coding: utf-8 -*-
{
    'name': 'POS All In One ESC/POS Printer | ESC/POS Printer | POS kitchen receipt printers | POS Order receipt printer | POS Restaurant receipt printers | POS Multi ESC/POS Printer Support',
    'summary': 'POS ESC/POS Printer, Print pos receipts using ESC/POS network printer,POS TCP ESC/POS Printer,IP Network Printer  Print POS orders and receipts by using network printers, POS NETWORK PRINTER, pos network printer, Odoo POS Network printer,ESC/POS network printer with Odoo POS, POS print receipt with network printer|POS order receipt|POS order receipt print|Add network printer to POS|Connect Network printer to POS|Install network printer with POS, Print POS Receipts & Tickets using ESCPOS IP network printer, pos printer without IoT Box,POS Printer Local Network, POS Network Printer | IP Network Printer Drivers | (ESC/POS) | Epson Standard Code for Printers | Point of sale network printer, POS Network Printer | IP Network Printer Drivers | (ESC/POS), IP-based ESC/POS printer,POS printer to the same network as your Odoo POS,Add network printer, escpos_network_printer, pos_network_printer, print receipts, pos network print,Retail Point Of Sale Solution Retail POS retail ,Multi ESC/POS Printer, multi printer pos print receipts, pos network printer, pos printer network, pos tcp printer,pos esc printer, pos epson printer, pos epson network printer, pos , pos_retail, pos all in one, pos direct printer, pos direct printer network,Print pos orders & receipts using ESCPOS IP network printer. Works without PosBox pos local network printing retail epson POS Network Printer Restaurant Network Printer Drivers | (ESC/POS) | Epson Standard Code for Printers | Point of sale network printer Restaurant POS Network Printer Restaurants| IP Network Printer Drivers | (ESC/POS) Works for both kitchen printers and regular order printer pos kitchen printer pos network printer pos printer ',
    'description': """Use Point of Sale TCP ESC/POS Printers Without an IoT Box""",
    'version': '18.0',
    'author': 'Khaled Hassan',
    'website': "https://apps.odoo.com/apps/modules/browse?search=Khaled+hassan",
    'license': 'OPL-1',
    'currency': 'EUR',
    'price': '103',
    "category": "Point of Sale",
    'depends': ['point_of_sale'],
    'data': [
        'views/pos_config_views.xml',
        'views/res_config_settings_views.xml',
        'views/pos_printer_views.xml',
    ],
    'images': ['static/description/main_screenshot.png'],
    'installable': True,
    'auto_install': False,
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_tcp_esc_printer/static/src/**/*',
        ],
    },
}
