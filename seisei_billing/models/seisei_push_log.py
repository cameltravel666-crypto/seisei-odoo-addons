from odoo import fields, models


class SeiseiPushLog(models.Model):
    _name = 'seisei.push.log'
    _description = 'Entitlement Push Log'
    _order = 'push_date desc'

    tenant_id = fields.Many2one(
        'seisei.tenant',
        string='Tenant',
        required=True,
        ondelete='cascade',
        index=True,
    )
    push_date = fields.Datetime(
        string='Push Date',
        required=True,
        default=fields.Datetime.now,
    )
    status = fields.Selection([
        ('success', 'Success'),
        ('failed', 'Failed'),
    ], string='Status', required=True)
    endpoint = fields.Char(string='Endpoint URL')
    payload = fields.Text(string='Request Payload')
    response_code = fields.Integer(string='Response Code')
    response_body = fields.Text(string='Response Body')
    error_message = fields.Text(string='Error Message')

    def name_get(self):
        return [(rec.id, f"{rec.tenant_id.tenant_code} - {rec.push_date}") for rec in self]
