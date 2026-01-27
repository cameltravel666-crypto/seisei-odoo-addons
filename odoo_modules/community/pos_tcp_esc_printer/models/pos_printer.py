# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api, _
from odoo.exceptions import ValidationError

class PosPrinter(models.Model):

    _inherit = 'pos.printer'

    printer_type = fields.Selection(selection_add=[('escpos_printer', 'Use an esc/pos printer')])
    escpos_printer_ip = fields.Char(string='Printer IP Address', help="Local IP address of an receipt printer.", default="0.0.0.0")

    @api.constrains('escpos_printer_ip')
    def _constrains_escpos_printer_ip(self):
        for record in self:
            if record.printer_type == 'escpos_printer' and not record.escpos_printer_ip:
                raise ValidationError(_("Printer IP Address cannot be empty."))

    @api.model
    def _load_pos_data_fields(self, config_id):
        params = super()._load_pos_data_fields(config_id)
        params += ['escpos_printer_ip']
        return params

