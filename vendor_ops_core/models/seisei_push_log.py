# -*- coding: utf-8 -*-
# seisei.push.log model - Logs for entitlement push operations

from odoo import api, fields, models


class SeiseiPushLog(models.Model):
    _name = 'seisei.push.log'
    _description = 'Seisei Entitlement Push Log'
    _order = 'push_date desc'

    tenant_id = fields.Many2one(
        'vendor.ops.tenant',
        string='Tenant',
        required=True,
        ondelete='cascade',
        index=True,
    )
    push_date = fields.Datetime(
        string='Push Date',
        required=True,
        default=fields.Datetime.now,
        index=True,
    )
    status = fields.Selection([
        ('success', 'Success'),
        ('failed', 'Failed'),
    ], string='Status', required=True, index=True)
    endpoint = fields.Char(
        string='Endpoint URL',
    )
    payload = fields.Text(
        string='Request Payload',
        help='JSON payload sent to the business database',
    )
    response_code = fields.Integer(
        string='Response Code',
        help='HTTP status code from the response',
    )
    response_body = fields.Text(
        string='Response Body',
        help='Response body from the business database',
    )
    error_message = fields.Text(
        string='Error Message',
        help='Error details if the push failed',
    )

    def name_get(self):
        result = []
        for log in self:
            name = f"{log.tenant_id.code or 'Unknown'} - {log.push_date}"
            result.append((log.id, name))
        return result
