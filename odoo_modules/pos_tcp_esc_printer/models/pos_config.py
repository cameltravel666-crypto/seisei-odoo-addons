# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    escpos_printer_ip = fields.Char(string='Printer IP',
                                    help="Local IP address of an receipt printer.")
    escpos_print = fields.Boolean()
    escpos_print_cashdrawer = fields.Boolean()
