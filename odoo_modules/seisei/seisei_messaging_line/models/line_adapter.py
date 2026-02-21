import hashlib
import hmac
import json
import logging

from odoo import api, models
from odoo.http import Response

_logger = logging.getLogger(__name__)


class LINEAdapter(models.AbstractModel):
    """LINE Messaging API adapter.

    Config JSON format:
    {
        "channel_access_token": "...",
        "channel_secret": "..."
    }
    """
    _name = 'seisei.messaging.adapter.line'
    _inherit = 'seisei.messaging.adapter'
    _description = 'LINE Messaging Adapter'

    def _get_config(self, channel):
        try:
            return json.loads(channel.config_json or '{}')
        except json.JSONDecodeError:
            return {}

    def verify_webhook(self, channel, request):
        """Verify LINE webhook signature."""
        config = self._get_config(channel)
        channel_secret = config.get('channel_secret', '')
        body = request.get_data(as_text=True)
        signature = request.headers.get('X-Line-Signature', '')

        digest = hmac.new(
            channel_secret.encode('utf-8'),
            body.encode('utf-8'),
            hashlib.sha256,
        ).digest()

        import base64
        expected = base64.b64encode(digest).decode('utf-8')

        if not hmac.compare_digest(signature, expected):
            return Response('Invalid signature', status=403)
        return None

    def parse_webhook(self, channel, request):
        """Parse LINE webhook events into normalized messages."""
        body = request.get_data(as_text=True)
        data = json.loads(body)
        messages = []

        for event in data.get('events', []):
            if event.get('type') != 'message':
                continue
            msg = event.get('message', {})
            source = event.get('source', {})

            msg_type_map = {
                'text': 'text',
                'image': 'image',
                'video': 'video',
                'audio': 'audio',
                'file': 'file',
                'location': 'location',
                'sticker': 'sticker',
            }

            messages.append({
                'external_id': source.get('userId', ''),
                'external_name': '',
                'external_msg_id': event.get('message', {}).get('id', ''),
                'message_type': msg_type_map.get(msg.get('type'), 'text'),
                'content': msg.get('text', ''),
                'media_url': '',
            })

        return messages

    def send_text(self, channel, conversation, text):
        """Send text message via LINE push API."""
        config = self._get_config(channel)
        token = config.get('channel_access_token', '')

        import requests
        url = 'https://api.line.me/v2/bot/message/push'
        resp = requests.post(
            url,
            headers={
                'Authorization': 'Bearer %s' % token,
                'Content-Type': 'application/json',
            },
            json={
                'to': conversation.external_id,
                'messages': [{'type': 'text', 'text': text}],
            },
            timeout=10,
        )

        if resp.status_code != 200:
            _logger.error('LINE send error: %s', resp.text)
            return {'external_msg_id': '', 'delivery_status': 'failed'}

        return {'external_msg_id': '', 'delivery_status': 'sent'}

    def get_user_profile(self, channel, external_id):
        """Fetch LINE user profile."""
        config = self._get_config(channel)
        token = config.get('channel_access_token', '')

        import requests
        url = 'https://api.line.me/v2/bot/profile/%s' % external_id
        resp = requests.get(
            url,
            headers={'Authorization': 'Bearer %s' % token},
            timeout=10,
        )

        if resp.status_code != 200:
            return {}

        data = resp.json()
        return {
            'name': data.get('displayName', ''),
            'avatar_url': data.get('pictureUrl', ''),
        }
