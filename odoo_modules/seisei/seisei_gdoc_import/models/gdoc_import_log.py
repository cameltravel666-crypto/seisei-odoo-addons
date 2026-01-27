# -*- coding: utf-8 -*-
from odoo import fields, models


class GdocImportLog(models.Model):
    """Google Doc Import Log Entry."""
    _name = 'seisei.gdoc.import.log'
    _description = 'Google Doc Import Log'
    _order = 'create_date desc, id desc'

    run_id = fields.Many2one(
        'seisei.gdoc.import.run',
        string='Import Run',
        required=True,
        ondelete='cascade',
        index=True
    )
    level = fields.Selection([
        ('debug', 'Debug'),
        ('info', 'Info'),
        ('warning', 'Warning'),
        ('error', 'Error'),
    ], string='Level', default='info', required=True)

    model = fields.Char(string='Model')
    external_key = fields.Char(string='External Key')
    message = fields.Text(string='Message', required=True)
    payload_snippet = fields.Text(string='Payload')
