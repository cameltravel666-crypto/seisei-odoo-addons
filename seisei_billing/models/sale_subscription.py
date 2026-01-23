import logging

from odoo import api, fields, models

_logger = logging.getLogger(__name__)


class SaleOrder(models.Model):
    """Extend sale.order to add tenant linkage for subscription orders."""
    _inherit = 'sale.order'

    seisei_tenant_id = fields.Many2one(
        'seisei.tenant',
        string='Seisei Tenant',
        index=True,
        tracking=True,
        help='The tenant this subscription belongs to',
    )

    @api.model_create_multi
    def create(self, vals_list):
        """Override create to trigger entitlement push when subscription is created."""
        orders = super().create(vals_list)
        # Only push for subscription orders
        subscriptions = orders.filtered(lambda o: o.is_subscription)
        self._trigger_entitlement_push(subscriptions)
        return orders

    def write(self, vals):
        """Override write to trigger entitlement push on relevant changes."""
        # Track fields that affect entitlements
        entitlement_fields = {'subscription_state', 'date_order', 'seisei_tenant_id', 'order_line'}
        should_push = bool(entitlement_fields & set(vals.keys()))

        # If tenant is being changed, we need to push to both old and new tenants
        old_tenants = set()
        if 'seisei_tenant_id' in vals:
            old_tenants = set(self.filtered('is_subscription').mapped('seisei_tenant_id'))

        result = super().write(vals)

        if should_push:
            # Push to current tenants (only for subscription orders)
            subscriptions = self.filtered(lambda o: o.is_subscription)
            self._trigger_entitlement_push(subscriptions)
            # Push to old tenants if tenant was changed
            for tenant in old_tenants:
                if tenant:
                    tenant._push_entitlements_single()

        return result

    def _trigger_entitlement_push(self, orders):
        """Trigger entitlement push for affected tenants."""
        tenants = orders.mapped('seisei_tenant_id')
        for tenant in tenants:
            if tenant:
                try:
                    tenant._push_entitlements_single()
                except Exception as e:
                    _logger.exception(f"Failed to push entitlements for tenant {tenant.tenant_code}: {e}")

    def action_confirm(self):
        """Override confirm to push entitlements for subscriptions."""
        result = super().action_confirm()
        subscriptions = self.filtered(lambda o: o.is_subscription)
        self._trigger_entitlement_push(subscriptions)
        return result
