import logging

from odoo import api, fields, models, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class HelpdeskTicketMessaging(models.Model):
    """Extend ticket with messaging conversation link and reply capability."""
    _inherit = 'seisei.helpdesk.ticket'

    source_conversation_id = fields.Many2one(
        'seisei.messaging.conversation',
        string='Source Conversation',
    )
    conversation_message_count = fields.Integer(
        related='source_conversation_id.message_count',
    )

    # ------------------------------------------------------------------
    # Reply from ticket to messaging channel
    # ------------------------------------------------------------------

    def action_reply_via_channel(self):
        """Open the send message wizard for the linked conversation."""
        self.ensure_one()
        if not self.source_conversation_id:
            raise UserError(_('No messaging conversation linked to this ticket.'))
        return {
            'type': 'ir.actions.act_window',
            'name': _('Reply via Channel'),
            'res_model': 'seisei.messaging.send.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_conversation_id': self.source_conversation_id.id,
            },
        }

    def action_view_conversation(self):
        """Open the linked conversation."""
        self.ensure_one()
        if not self.source_conversation_id:
            raise UserError(_('No messaging conversation linked to this ticket.'))
        return {
            'type': 'ir.actions.act_window',
            'name': _('Conversation'),
            'res_model': 'seisei.messaging.conversation',
            'res_id': self.source_conversation_id.id,
            'view_mode': 'form',
            'target': 'current',
        }
