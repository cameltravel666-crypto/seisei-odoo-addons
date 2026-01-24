# -*- coding: utf-8 -*-
from odoo import api, fields, models


class HrInsurancePrefecture(models.Model):
    """Japanese Prefectures for Social Insurance"""
    _name = 'hr.insurance.prefecture'
    _description = 'Insurance Prefecture'
    _order = 'sequence, code'

    sequence = fields.Integer(string='Sequence', default=10)
    code = fields.Char(string='Code', required=True, size=2)
    name = fields.Char(string='Name', required=True, translate=True)
    active = fields.Boolean(string='Active', default=True)

    # Related insurance rates
    rate_ids = fields.One2many(
        'hr.insurance.rate',
        'prefecture_id',
        string='Insurance Rates'
    )

    _sql_constraints = [
        ('code_unique', 'unique(code)', 'Prefecture code must be unique!'),
    ]

    def name_get(self):
        result = []
        for record in self:
            name = f"[{record.code}] {record.name}" if record.code else record.name
            result.append((record.id, name))
        return result
