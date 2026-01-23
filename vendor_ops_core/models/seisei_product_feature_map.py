# -*- coding: utf-8 -*-
# seisei.product.feature.map model - Maps products to features

from odoo import api, fields, models


class SeiseiProductFeatureMap(models.Model):
    _name = 'seisei.product.feature.map'
    _description = 'Product Feature Mapping'
    _order = 'product_id, feature_id'

    product_id = fields.Many2one(
        'product.product',
        string='Product',
        required=True,
        ondelete='cascade',
        help='Subscription product that grants access to features',
    )
    feature_id = fields.Many2one(
        'seisei.feature',
        string='Feature',
        required=True,
        ondelete='cascade',
        help='Feature granted by this product',
    )
    quantity_dependent = fields.Boolean(
        string='Quantity Dependent',
        default=False,
        help='If checked, feature value depends on subscription quantity',
    )
    note = fields.Char(
        string='Note',
        help='Additional notes about this mapping',
    )

    _sql_constraints = [
        models.Constraint(
            'UNIQUE(product_id, feature_id)',
            'A product can only be mapped to each feature once!',
        ),
    ]
