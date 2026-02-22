import logging

from odoo import http, fields
from odoo.http import request, Response

_logger = logging.getLogger(__name__)


class MessagingWebhookController(http.Controller):
    """Unified webhook endpoint for all messaging channels.

    URL pattern: /seisei/messaging/<channel_type>/<int:channel_id>/webhook
    """

    @http.route(
        '/seisei/messaging/<string:channel_type>/<int:channel_id>/webhook',
        type='http', auth='public', methods=['GET', 'POST'],
        csrf=False,
    )
    def webhook(self, channel_type, channel_id, **kwargs):
        channel = (
            request.env['seisei.messaging.channel']
            .sudo()
            .browse(channel_id)
        )
        if not channel.exists() or channel.channel_type != channel_type:
            return Response('Channel not found', status=404)

        if not channel.active:
            return Response('Channel disabled', status=403)

        adapter = channel._get_adapter()
        if not adapter:
            _logger.error(
                'No adapter found for channel type: %s', channel_type,
            )
            return Response('Adapter not configured', status=500)

        # --- GET: Webhook verification (used by WeChat, WhatsApp, etc.) ---
        if request.httprequest.method == 'GET':
            try:
                result = adapter.verify_webhook(channel, request.httprequest)
                if result is not None:
                    return result
                return Response('OK', status=200)
            except Exception as e:
                _logger.exception('Webhook verification failed: %s', e)
                return Response('Verification failed', status=403)

        # --- POST: Incoming message ---
        try:
            messages = adapter.parse_webhook(channel, request.httprequest)
        except Exception as e:
            _logger.exception('Webhook parse failed for channel %d: %s', channel_id, e)
            return Response('Parse error', status=400)

        if not messages:
            return Response('OK', status=200)

        Conversation = request.env['seisei.messaging.conversation'].sudo()
        Message = request.env['seisei.messaging.message'].sudo()

        for msg_data in messages:
            try:
                self._process_incoming_message(
                    channel, adapter, Conversation, Message, msg_data,
                )
            except Exception as e:
                _logger.exception(
                    'Error processing message %s: %s',
                    msg_data.get('external_msg_id', '?'), e,
                )

        return Response('OK', status=200)

    def _process_incoming_message(
        self, channel, adapter, Conversation, Message, msg_data,
    ):
        """Process a single incoming message."""
        external_id = msg_data.get('external_id')
        if not external_id:
            return

        # Deduplicate by external_msg_id
        ext_msg_id = msg_data.get('external_msg_id')
        if ext_msg_id:
            existing = Message.search([
                ('channel_id', '=', channel.id),
                ('external_msg_id', '=', ext_msg_id),
            ], limit=1)
            if existing:
                return

        # Find or create conversation
        conversation = Conversation.search([
            ('channel_id', '=', channel.id),
            ('external_id', '=', external_id),
        ], limit=1)

        if not conversation:
            # Fetch profile from platform
            profile = adapter.get_user_profile(channel, external_id)
            conversation = Conversation.create({
                'channel_id': channel.id,
                'external_id': external_id,
                'external_name': msg_data.get('external_name')
                    or profile.get('name', ''),
                'external_avatar_url': profile.get('avatar_url', ''),
            })
            # Try to match res.partner by phone or email
            partner = self._find_partner(profile)
            if partner:
                conversation.partner_id = partner

        # Reactivate if closed
        if conversation.state == 'closed':
            conversation.state = 'active'

        # Create message record
        message = Message.create({
            'conversation_id': conversation.id,
            'direction': 'in',
            'message_type': msg_data.get('message_type', 'text'),
            'content': msg_data.get('content', ''),
            'media_url': msg_data.get('media_url', ''),
            'external_msg_id': ext_msg_id,
            'timestamp': msg_data.get('timestamp') or fields.Datetime.now(),
            'delivery_status': 'delivered',
        })

        # Hook for other modules (e.g. helpdesk_messaging bridge)
        self._on_incoming_message(channel, conversation, message)

    def _on_incoming_message(self, channel, conversation, message):
        """Extension hook called after an incoming message is created.

        Override in seisei_helpdesk_messaging to trigger AI reply / ticket creation.
        """
        pass

    def _find_partner(self, profile):
        """Try to find an existing res.partner from profile data."""
        Partner = request.env['res.partner'].sudo()
        phone = profile.get('phone')
        email = profile.get('email')
        if phone:
            partner = Partner.search([('phone', '=', phone)], limit=1)
            if partner:
                return partner
            partner = Partner.search([('mobile', '=', phone)], limit=1)
            if partner:
                return partner
        if email:
            partner = Partner.search([('email', '=', email)], limit=1)
            if partner:
                return partner
        return None
