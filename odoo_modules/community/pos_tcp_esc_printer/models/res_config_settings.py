# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    escpos_print = fields.Boolean(compute='_compute_escpos_print', store=True, readonly=False)
    escpos_printer_ip = fields.Char(compute='_compute_escpos_printer_ip', store=True, readonly=False)    
    escpos_print_cashdrawer = fields.Boolean(compute='_compute_escpos_print_cashdrawer', store=True, readonly=False)

    def set_values(self):
        super(ResConfigSettings, self).set_values()
        
        self.pos_config_id.write({
            'escpos_print': self.escpos_print or False,
            'escpos_printer_ip': self.escpos_printer_ip or '',
            'escpos_print_cashdrawer': self.escpos_print_cashdrawer or False
        })

    @api.depends('pos_config_id')
    def _compute_escpos_print(self):
        for res_config in self:
            res_config.escpos_print = res_config.pos_config_id.escpos_print

    @api.depends('pos_config_id')
    def _compute_escpos_printer_ip(self):
        for res_config in self:
            res_config.escpos_printer_ip = res_config.pos_config_id.escpos_printer_ip

    @api.depends('pos_config_id')
    def _compute_escpos_print_cashdrawer(self):
        for res_config in self:
            res_config.escpos_print_cashdrawer = res_config.pos_config_id.escpos_print_cashdrawer
