import logging

from odoo.http import request

from odoo.addons.seisei_messaging.controllers.webhook import MessagingWebhookController

_logger = logging.getLogger(__name__)


class MessagingWebhookCRM(MessagingWebhookController):
    """Extend webhook to auto-create CRM leads from incoming messages."""

    def _on_incoming_message(self, channel, conversation, message):
        """Append CRM lead auto-creation after other hooks."""
        super()._on_incoming_message(channel, conversation, message)

        if not channel.auto_create_lead:
            return

        if message.message_type != 'text' or not message.content:
            return

        self._handle_auto_lead(channel, conversation, message)

    def _handle_auto_lead(self, channel, conversation, message):
        """Auto-create a CRM lead or append message to existing lead."""
        Lead = request.env['crm.lead'].sudo()

        # Check if open lead already exists for this conversation
        existing = Lead.search([
            ('source_conversation_id', '=', conversation.id),
            ('active', '=', True),
        ], limit=1)

        if existing:
            # Post the message to the existing lead's chatter
            existing.message_post(
                body='<b>[%s]</b> %s' % (
                    conversation.name or conversation.external_id,
                    message.content or '',
                ),
                message_type='comment',
                subtype_xmlid='mail.mt_note',
            )
            return

        team = channel.crm_team_id

        channel_label = dict(
            channel._fields['channel_type'].selection
        ).get(channel.channel_type, channel.channel_type)

        vals = {
            'name': '%s: %s' % (
                conversation.name or conversation.external_id,
                (message.content or '')[:60],
            ),
            'description': message.content or '',
            'partner_id': conversation.partner_id.id if conversation.partner_id else False,
            'contact_name': conversation.name,
            'source_conversation_id': conversation.id,
        }
        if team:
            vals['team_id'] = team.id

        lead = Lead.create(vals)

        _logger.info(
            'Auto-created lead %d (%s) from %s conversation %d',
            lead.id, lead.name, channel_label, conversation.id,
        )
