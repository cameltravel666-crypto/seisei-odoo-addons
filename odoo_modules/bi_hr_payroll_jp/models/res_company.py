# -*- coding: utf-8 -*-

from odoo import models, fields


class ResCompany(models.Model):
    """Company extension for Japanese payroll settings"""
    _inherit = 'res.company'

    default_insurance_prefecture_id = fields.Many2one(
        'hr.insurance.prefecture',
        string='Default Insurance Prefecture / デフォルト保険支部',
        help='Default insurance prefecture for employees without individual setting',
    )
    
    employment_insurance_rate = fields.Float(
        string='Employment Insurance Rate / 雇用保険料率',
        default=0.006,
        help='Employee contribution rate for employment insurance (default: 0.6%)',
    )
