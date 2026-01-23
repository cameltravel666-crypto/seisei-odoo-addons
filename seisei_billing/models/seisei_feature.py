from odoo import api, fields, models
from odoo.models import Constraint


class SeiseiFeature(models.Model):
    _name = 'seisei.feature'
    _description = 'Seisei Feature Module'
    _order = 'key'

    key = fields.Char(
        string='Feature Key',
        required=True,
        index=True,
        help='Unique identifier for this feature (e.g., pos, inventory, crm)',
    )
    name = fields.Char(string='Feature Name', required=True)
    description = fields.Text(string='Description')
    active = fields.Boolean(default=True)
    product_map_ids = fields.One2many(
        'seisei.product.feature.map',
        'feature_id',
        string='Product Mappings',
    )

    _constraints = [
        Constraint(
            'UNIQUE(key)',
            'Feature key must be unique!',
        ),
    ]

    def name_get(self):
        return [(rec.id, f"[{rec.key}] {rec.name}") for rec in self]

    @api.model
    def _name_search(self, name, args=None, operator='ilike', limit=100, order=None, name_get_uid=None):
        args = args or []
        domain = []
        if name:
            domain = ['|', ('key', operator, name), ('name', operator, name)]
        return self._search(domain + args, limit=limit, order=order, access_rights_uid=name_get_uid)
