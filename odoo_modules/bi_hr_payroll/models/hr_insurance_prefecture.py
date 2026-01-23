# -*- coding: utf-8 -*-

from odoo import models, fields, api


class HrInsurancePrefecture(models.Model):
    """Insurance Prefecture Master"""
    _name = 'hr.insurance.prefecture'
    _description = 'Insurance Prefecture'
    _order = 'sequence, name'

    name = fields.Char(
        string='Prefecture Name',
        required=True,
        translate=True,
    )
    code = fields.Char(
        string='Code',
        required=True,
    )
    sequence = fields.Integer(
        string='Sequence',
        default=10,
    )
    active = fields.Boolean(
        string='Active',
        default=True,
    )
    rate_ids = fields.One2many(
        'hr.insurance.rate',
        'prefecture_id',
        string='Insurance Rates',
    )

    _sql_constraints = [
        ('code_uniq', 'unique(code)', 'Prefecture code must be unique!'),
    ]

    def name_get(self):
        result = []
        for record in self:
            result.append((record.id, record.name))
        return result

    def get_current_rate(self, target_date=None):
        """Get the current applicable insurance rate for this prefecture"""
        self.ensure_one()
        if not target_date:
            target_date = fields.Date.today()

        rate = self.env['hr.insurance.rate'].search([
            ('prefecture_id', '=', self.id),
            ('effective_date', '<=', target_date),
            '|',
            ('expiry_date', '=', False),
            ('expiry_date', '>=', target_date),
            ('active', '=', True)
        ], order='effective_date desc', limit=1)

        return rate
