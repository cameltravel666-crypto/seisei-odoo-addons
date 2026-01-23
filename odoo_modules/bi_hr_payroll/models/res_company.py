# -*- coding: utf-8 -*-
# Part of BrowseInfo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields


class ResCompany(models.Model):
    """Company extension for Japanese payroll settings"""
    _inherit = 'res.company'

    default_insurance_prefecture_id = fields.Many2one(
        'hr.insurance.prefecture',
        string='Default Insurance Prefecture',
        help='Default insurance prefecture for employees without individual setting',
    )
    employment_insurance_rate = fields.Float(
        string='Employment Insurance Rate',
        digits=(6, 5),
        default=0.006,
        help='Employee portion of employment insurance rate (default 0.6%)',
    )
