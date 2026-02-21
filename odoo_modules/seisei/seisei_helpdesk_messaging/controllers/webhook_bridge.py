import logging

from odoo import fields
from odoo.http import request

from odoo.addons.seisei_messaging.controllers.webhook import MessagingWebhookController

_logger = logging.getLogger(__name__)


class MessagingWebhookBridge(MessagingWebhookController):
    """Override webhook to add AI auto-reply and auto-ticket creation."""

    def _on_incoming_message(self, channel, conversation, message):
        """Called after each incoming message.

        Flow:
        1. If AI enabled and no human agent -> AI auto-reply
        2. If auto_create_ticket and no existing open ticket -> create ticket
        """
        super()._on_incoming_message(channel, conversation, message)

        # Skip non-text messages for AI
        if message.message_type != 'text' or not message.content:
            return

        # --- AI Auto-Reply ---
        if channel.ai_enabled and not conversation.assigned_user_id:
            self._handle_ai_reply(channel, conversation, message)

        # --- Auto Create Ticket ---
        if channel.auto_create_ticket:
            self._handle_auto_ticket(channel, conversation, message)

    def _handle_ai_reply(self, channel, conversation, message):
        """Send AI reply via Dify and record as outgoing message."""
        try:
            AIChatMessage = request.env['ai.chat.message'].sudo()
            ai_response = AIChatMessage._call_dify_api(message.content)

            if not ai_response:
                _logger.warning(
                    'Empty AI response for message %d', message.id,
                )
                return

            # Send reply via adapter
            adapter = channel._get_adapter()
            if not adapter:
                return

            result = adapter.send_text(channel, conversation, ai_response)

            # Record outgoing AI message
            request.env['seisei.messaging.message'].sudo().create({
                'conversation_id': conversation.id,
                'direction': 'out',
                'message_type': 'text',
                'content': ai_response,
                'external_msg_id': result.get('external_msg_id', ''),
                'delivery_status': result.get('delivery_status', 'sent'),
                'is_ai_reply': True,
                'timestamp': fields.Datetime.now(),
            })

            _logger.info(
                'AI reply sent for conversation %d (channel %d)',
                conversation.id, channel.id,
            )
        except Exception as e:
            _logger.exception(
                'AI reply failed for conversation %d: %s',
                conversation.id, e,
            )

    def _handle_auto_ticket(self, channel, conversation, message):
        """Auto-create a ticket if none exists for this conversation."""
        Ticket = request.env['seisei.helpdesk.ticket'].sudo()

        # Check if open ticket already exists
        existing = Ticket.search([
            ('source_conversation_id', '=', conversation.id),
            ('is_closed', '=', False),
        ], limit=1)

        if existing:
            # Post the message to the existing ticket's chatter
            existing.message_post(
                body='<b>[%s]</b> %s' % (
                    conversation.name or conversation.external_id,
                    message.content or '',
                ),
                message_type='comment',
                subtype_xmlid='mail.mt_note',
            )
            return

        team = channel.helpdesk_team_id
        if not team:
            return

        channel_type_map = {
            'wechat_work': 'wechat',
            'line': 'line',
            'whatsapp': 'whatsapp',
        }

        ticket = Ticket.create({
            'name': '%s: %s' % (
                conversation.name or conversation.external_id,
                (message.content or '')[:60],
            ),
            'description': message.content or '',
            'team_id': team.id,
            'partner_id': conversation.partner_id.id if conversation.partner_id else False,
            'partner_name': conversation.name,
            'channel_type': channel_type_map.get(channel.channel_type, 'chat'),
            'source_conversation_id': conversation.id,
        })

        _logger.info(
            'Auto-created ticket %s from conversation %d',
            ticket.number, conversation.id,
        )
