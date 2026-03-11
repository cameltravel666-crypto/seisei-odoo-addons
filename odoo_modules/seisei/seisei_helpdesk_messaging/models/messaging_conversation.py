from odoo import api, fields, models, _


class MessagingConversationBridge(models.Model):
    """Extend conversation with ticket link."""
    _inherit = 'seisei.messaging.conversation'

    ticket_ids = fields.One2many(
        'seisei.helpdesk.ticket', 'source_conversation_id',
        string='Tickets',
    )
    ticket_count = fields.Integer(compute='_compute_ticket_count')

    def _compute_ticket_count(self):
        for conv in self:
            conv.ticket_count = len(conv.ticket_ids)

    def action_create_ticket(self):
        """Manually create a helpdesk ticket from this conversation."""
        self.ensure_one()
        channel = self.channel_id
        team = channel.helpdesk_team_id
        if not team:
            from odoo.exceptions import UserError
            raise UserError(
                _('No helpdesk team configured for channel "%s".') % channel.name
            )

        # Get last message as description
        last_msgs = self.message_ids_rel.filtered(
            lambda m: m.direction == 'in'
        ).sorted('timestamp', reverse=True)[:5]
        description = '<br/>'.join(
            '%s: %s' % (m.timestamp, m.content or '') for m in last_msgs
        )

        channel_type_map = {
            'wechat_work': 'wechat',
            'line': 'line',
            'whatsapp': 'whatsapp',
        }

        ticket = self.env['seisei.helpdesk.ticket'].create({
            'name': _('Chat: %s') % (self.name or self.external_id),
            'description': description,
            'team_id': team.id,
            'partner_id': self.partner_id.id if self.partner_id else False,
            'partner_name': self.name,
            'channel_type': channel_type_map.get(self.channel_type, 'chat'),
            'source_conversation_id': self.id,
        })

        return {
            'type': 'ir.actions.act_window',
            'name': _('Ticket'),
            'res_model': 'seisei.helpdesk.ticket',
            'res_id': ticket.id,
            'view_mode': 'form',
            'target': 'current',
        }
