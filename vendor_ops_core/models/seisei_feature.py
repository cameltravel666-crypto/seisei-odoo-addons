# -*- coding: utf-8 -*-
# seisei.feature model - Feature definitions for entitlement management

from odoo import api, fields, models


class SeiseiFeature(models.Model):
    _name = 'seisei.feature'
    _description = 'Seisei Feature'
    _order = 'sequence, name'

    name = fields.Char(
        string='Feature Name',
        required=True,
        help='Human-readable name of the feature',
    )
    key = fields.Char(
        string='Feature Key',
        required=True,
        index=True,
        help='Unique identifier used in API calls (e.g., module_inventory)',
    )
    description = fields.Text(
        string='Description',
        help='Detailed description of what this feature provides',
    )
    sequence = fields.Integer(
        string='Sequence',
        default=10,
        help='Display order',
    )
    active = fields.Boolean(
        string='Active',
        default=True,
    )

    # Related mappings
    product_feature_map_ids = fields.One2many(
        'seisei.product.feature.map',
        'feature_id',
        string='Product Mappings',
    )

    _sql_constraints = [
        models.Constraint(
            'UNIQUE(key)',
            'Feature key must be unique!',
        ),
    ]
