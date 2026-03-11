from odoo import fields, models


class MessagingChannelCRM(models.Model):
    """Extend messaging channel with CRM integration fields."""
    _inherit = 'seisei.messaging.channel'

    crm_team_id = fields.Many2one(
        'crm.team',
        string='Sales Team',
        help='Default sales team for auto-created leads from this channel.',
    )
    auto_create_lead = fields.Boolean(
        string='Auto Create Lead',
        help='Automatically create CRM leads from new conversations.',
    )
