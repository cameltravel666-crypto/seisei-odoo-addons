import logging

from odoo import api, fields, models, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class SendMessageWizard(models.TransientModel):
    _name = 'seisei.messaging.send.wizard'
    _description = 'Send Message Wizard'

    conversation_id = fields.Many2one(
        'seisei.messaging.conversation', required=True,
    )
    channel_id = fields.Many2one(
        related='conversation_id.channel_id', readonly=True,
    )
    message = fields.Text(required=True, string='Message')
    message_type = fields.Selection([
        ('text', 'Text'),
    ], default='text', required=True)

    def action_send(self):
        """Send the message via the channel adapter."""
        self.ensure_one()
        channel = self.conversation_id.channel_id
        adapter = channel._get_adapter()

        if not adapter:
            raise UserError(
                _('No adapter configured for channel type: %s')
                % channel.channel_type
            )

        try:
            result = adapter.send_text(
                channel, self.conversation_id, self.message,
            )
        except NotImplementedError:
            raise UserError(
                _('Sending not yet implemented for %s.')
                % channel.channel_type
            )
        except Exception as e:
            _logger.exception('Failed to send message: %s', e)
            raise UserError(_('Failed to send message: %s') % str(e))

        # Record outgoing message
        self.env['seisei.messaging.message'].create({
            'conversation_id': self.conversation_id.id,
            'direction': 'out',
            'message_type': self.message_type,
            'content': self.message,
            'external_msg_id': result.get('external_msg_id', ''),
            'delivery_status': result.get('delivery_status', 'sent'),
            'timestamp': fields.Datetime.now(),
        })

        return {'type': 'ir.actions.act_window_close'}
