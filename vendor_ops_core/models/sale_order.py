# -*- coding: utf-8 -*-
# Extends sale.order to add tenant linkage for subscription management

from odoo import api, fields, models


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    vendor_ops_tenant_id = fields.Many2one(
        'vendor.ops.tenant',
        string='Tenant',
        help='The tenant this subscription belongs to',
        tracking=True,
    )

    @api.onchange('partner_id')
    def _onchange_partner_id_set_tenant(self):
        """Auto-fill tenant when partner changes if partner has a linked tenant."""
        if self.partner_id:
            tenant = self.env['vendor.ops.tenant'].search([
                ('partner_id', '=', self.partner_id.id),
                ('active', '=', True),
            ], limit=1)
            if tenant:
                self.vendor_ops_tenant_id = tenant.id
