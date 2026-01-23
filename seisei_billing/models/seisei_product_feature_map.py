from odoo import api, fields, models
from odoo.models import Constraint


class SeiseiProductFeatureMap(models.Model):
    _name = 'seisei.product.feature.map'
    _description = 'Product to Feature Mapping'
    _order = 'product_id, feature_id'

    product_id = fields.Many2one(
        'product.product',
        string='Subscription Product',
        required=True,
        domain=[('recurring_invoice', '=', True)],
        ondelete='cascade',
        index=True,
    )
    feature_id = fields.Many2one(
        'seisei.feature',
        string='Feature',
        required=True,
        ondelete='cascade',
        index=True,
    )
    quantity_dependent = fields.Boolean(
        string='Quantity Dependent',
        default=False,
        help='If checked, the feature entitlement depends on the subscription line quantity',
    )
    note = fields.Text(string='Notes')

    _constraints = [
        Constraint(
            'UNIQUE(product_id, feature_id)',
            'This product is already mapped to this feature!',
        ),
    ]

    def name_get(self):
        return [(rec.id, f"{rec.product_id.name} -> {rec.feature_id.key}") for rec in self]
