import hashlib
import hmac
import json
import logging

from odoo import api, models
from odoo.http import Response

_logger = logging.getLogger(__name__)


class WhatsAppAdapter(models.AbstractModel):
    """WhatsApp Business API (Meta Cloud API) adapter.

    Config JSON format:
    {
        "phone_number_id": "...",
        "access_token": "...",
        "verify_token": "...",
        "app_secret": "..."
    }
    """
    _name = 'seisei.messaging.adapter.whatsapp'
    _inherit = 'seisei.messaging.adapter'
    _description = 'WhatsApp Adapter'

    def _get_config(self, channel):
        try:
            return json.loads(channel.config_json or '{}')
        except json.JSONDecodeError:
            return {}

    def verify_webhook(self, channel, request):
        """Handle WhatsApp webhook verification (GET with hub.challenge)."""
        config = self._get_config(channel)
        verify_token = config.get('verify_token', '')

        mode = request.args.get('hub.mode', '')
        token = request.args.get('hub.verify_token', '')
        challenge = request.args.get('hub.challenge', '')

        if mode == 'subscribe' and token == verify_token:
            return Response(challenge, content_type='text/plain')
        return Response('Forbidden', status=403)

    def parse_webhook(self, channel, request):
        """Parse WhatsApp Cloud API webhook."""
        body = request.get_data(as_text=True)

        # Verify signature
        config = self._get_config(channel)
        app_secret = config.get('app_secret', '')
        if app_secret:
            signature = request.headers.get('X-Hub-Signature-256', '')
            expected = 'sha256=' + hmac.new(
                app_secret.encode(), body.encode(), hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(signature, expected):
                _logger.warning('WhatsApp invalid webhook signature')
                return []

        data = json.loads(body)
        messages = []

        for entry in data.get('entry', []):
            for change in entry.get('changes', []):
                value = change.get('value', {})
                for msg in value.get('messages', []):
                    msg_type = msg.get('type', 'text')
                    content = ''
                    media_url = ''

                    if msg_type == 'text':
                        content = msg.get('text', {}).get('body', '')
                    elif msg_type in ('image', 'video', 'audio', 'document'):
                        media_data = msg.get(msg_type, {})
                        media_url = media_data.get('id', '')  # Media ID, not URL
                    elif msg_type == 'location':
                        loc = msg.get('location', {})
                        content = 'Location: %s, %s' % (
                            loc.get('latitude', ''),
                            loc.get('longitude', ''),
                        )

                    type_map = {
                        'text': 'text',
                        'image': 'image',
                        'video': 'video',
                        'audio': 'audio',
                        'document': 'file',
                        'location': 'location',
                        'sticker': 'sticker',
                    }

                    # Get sender profile from contacts
                    contacts = value.get('contacts', [])
                    sender_name = ''
                    if contacts:
                        profile = contacts[0].get('profile', {})
                        sender_name = profile.get('name', '')

                    messages.append({
                        'external_id': msg.get('from', ''),
                        'external_name': sender_name,
                        'external_msg_id': msg.get('id', ''),
                        'message_type': type_map.get(msg_type, 'text'),
                        'content': content,
                        'media_url': media_url,
                    })

        return messages

    def send_text(self, channel, conversation, text):
        """Send text message via WhatsApp Cloud API."""
        config = self._get_config(channel)
        phone_number_id = config.get('phone_number_id', '')
        access_token = config.get('access_token', '')

        import requests
        url = 'https://graph.facebook.com/v18.0/%s/messages' % phone_number_id
        resp = requests.post(
            url,
            headers={
                'Authorization': 'Bearer %s' % access_token,
                'Content-Type': 'application/json',
            },
            json={
                'messaging_product': 'whatsapp',
                'to': conversation.external_id,
                'type': 'text',
                'text': {'body': text},
            },
            timeout=10,
        )

        data = resp.json()
        if 'error' in data:
            _logger.error('WhatsApp send error: %s', data['error'])
            return {'external_msg_id': '', 'delivery_status': 'failed'}

        msg_id = ''
        wa_messages = data.get('messages', [])
        if wa_messages:
            msg_id = wa_messages[0].get('id', '')

        return {'external_msg_id': msg_id, 'delivery_status': 'sent'}

    def get_user_profile(self, channel, external_id):
        """WhatsApp doesn't provide a profile API - return minimal info."""
        return {
            'name': external_id,
            'phone': external_id,
        }
