# -*- coding: utf-8 -*-
# seisei.entitlement.log model - Logs for entitlement operations

from odoo import api, fields, models


class SeiseiEntitlementLog(models.Model):
    _name = 'seisei.entitlement.log'
    _description = 'Seisei Entitlement Log'
    _order = 'received_at desc'

    received_at = fields.Datetime(
        string='Received At',
        default=fields.Datetime.now,
        required=True,
        index=True,
    )
    tenant_code = fields.Char(
        string='Tenant Code',
        index=True,
    )
    source = fields.Char(
        string='Source',
    )
    features_received = fields.Text(
        string='Features Received',
        help='JSON list of features received',
    )
    features_activated = fields.Text(
        string='Features Activated',
    )
    features_deactivated = fields.Text(
        string='Features Deactivated',
    )
    features_created = fields.Text(
        string='Features Created',
    )
    total_active = fields.Integer(
        string='Total Active Features',
    )
    status = fields.Selection([
        ('success', 'Success'),
        ('failed', 'Failed'),
    ], string='Status', default='success')
    error_message = fields.Text(
        string='Error Message',
    )
    request_ip = fields.Char(
        string='Request IP',
    )
    api_key_name = fields.Char(
        string='API Key Used',
    )

    def name_get(self):
        result = []
        for log in self:
            name = f"{log.tenant_code or 'Unknown'} - {log.received_at}"
            result.append((log.id, name))
        return result
