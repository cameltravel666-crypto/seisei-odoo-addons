from odoo import fields, models


class MessagingChannelBridge(models.Model):
    """Extend messaging channel with helpdesk integration fields."""
    _inherit = 'seisei.messaging.channel'

    helpdesk_team_id = fields.Many2one(
        'seisei.helpdesk.team',
        string='Default Helpdesk Team',
        help='Team for auto-created tickets from this channel.',
    )
    auto_create_ticket = fields.Boolean(
        string='Auto Create Ticket',
        help='Automatically create helpdesk tickets from new conversations.',
    )
