import json
import logging
import time

from odoo import api, fields, models
from odoo.http import Response

_logger = logging.getLogger(__name__)

# Token cache: {channel_id: {'token': str, 'expires_at': float}}
_token_cache = {}


class WeChatWorkAdapter(models.AbstractModel):
    """WeChat Work (Enterprise WeChat) messaging adapter.

    Config JSON format:
    {
        "corpid": "wwXXXXXXXXXXXXXX",
        "corpsecret": "...",
        "agent_id": "1000001",
        "encoding_aes_key": "...",
        "token": "..."  // callback token for webhook verification
    }
    """
    _name = 'seisei.messaging.adapter.wechat_work'
    _inherit = 'seisei.messaging.adapter'
    _description = 'WeChat Work Adapter'

    # ------------------------------------------------------------------
    # Config helpers
    # ------------------------------------------------------------------

    def _get_config(self, channel):
        """Parse channel config_json into dict."""
        try:
            return json.loads(channel.config_json or '{}')
        except json.JSONDecodeError:
            _logger.error('Invalid config_json for channel %d', channel.id)
            return {}

    def _get_access_token(self, channel):
        """Get a valid access token, refreshing if needed."""
        cache = _token_cache.get(channel.id, {})
        if cache.get('token') and cache.get('expires_at', 0) > time.time():
            return cache['token']

        config = self._get_config(channel)
        corpid = config.get('corpid', '')
        corpsecret = config.get('corpsecret', '')

        if not corpid or not corpsecret:
            _logger.error('WeChat Work: missing corpid/corpsecret for channel %d', channel.id)
            return None

        import requests
        url = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken'
        resp = requests.get(url, params={
            'corpid': corpid,
            'corpsecret': corpsecret,
        }, timeout=10)
        data = resp.json()

        if data.get('errcode', 0) != 0:
            _logger.error('WeChat Work token error: %s', data.get('errmsg'))
            return None

        token = data['access_token']
        expires_in = data.get('expires_in', 7200)
        _token_cache[channel.id] = {
            'token': token,
            'expires_at': time.time() + expires_in - 300,  # 5min buffer
        }
        return token

    # ------------------------------------------------------------------
    # Adapter interface
    # ------------------------------------------------------------------

    def verify_webhook(self, channel, request):
        """Verify WeChat Work callback URL.

        WeChat sends GET with: msg_signature, timestamp, nonce, echostr.
        We must decrypt echostr and return it as plain text.
        """
        config = self._get_config(channel)
        token = config.get('token', '')
        encoding_aes_key = config.get('encoding_aes_key', '')
        corpid = config.get('corpid', '')

        msg_signature = request.args.get('msg_signature', '')
        timestamp = request.args.get('timestamp', '')
        nonce = request.args.get('nonce', '')
        echostr = request.args.get('echostr', '')

        try:
            from wechatpy.enterprise.crypto import WeChatCrypto
            crypto = WeChatCrypto(token, encoding_aes_key, corpid)
            echo = crypto.check_signature(
                msg_signature, timestamp, nonce, echostr,
            )
            return Response(echo, content_type='text/plain')
        except ImportError:
            _logger.error('wechatpy not installed')
            return Response('wechatpy not installed', status=500)
        except Exception as e:
            _logger.exception('WeChat Work verification failed: %s', e)
            return Response('Verification failed', status=403)

    def parse_webhook(self, channel, request):
        """Parse incoming WeChat Work message.

        POST with encrypted XML body.
        """
        config = self._get_config(channel)
        token = config.get('token', '')
        encoding_aes_key = config.get('encoding_aes_key', '')
        corpid = config.get('corpid', '')

        msg_signature = request.args.get('msg_signature', '')
        timestamp = request.args.get('timestamp', '')
        nonce = request.args.get('nonce', '')

        try:
            from wechatpy.enterprise.crypto import WeChatCrypto
            from wechatpy.enterprise import parse_message
        except ImportError:
            _logger.error('wechatpy not installed')
            return []

        try:
            crypto = WeChatCrypto(token, encoding_aes_key, corpid)
            raw_xml = request.get_data(as_text=True)
            decrypted = crypto.decrypt_message(
                raw_xml, msg_signature, timestamp, nonce,
            )
            msg = parse_message(decrypted)
        except Exception as e:
            _logger.exception('WeChat Work parse failed: %s', e)
            return []

        # Normalize message
        msg_type_map = {
            'text': 'text',
            'image': 'image',
            'video': 'video',
            'voice': 'audio',
            'file': 'file',
            'location': 'location',
        }
        message_type = msg_type_map.get(msg.type, 'text')

        content = ''
        media_url = ''
        if msg.type == 'text':
            content = getattr(msg, 'content', '')
        elif msg.type == 'image':
            media_url = getattr(msg, 'image', '')
        elif msg.type == 'location':
            content = 'Location: %s, %s' % (
                getattr(msg, 'location_x', ''),
                getattr(msg, 'location_y', ''),
            )

        from datetime import datetime
        return [{
            'external_id': str(getattr(msg, 'source', '')),
            'external_name': '',  # Fetched via get_user_profile
            'external_msg_id': str(getattr(msg, 'id', '')),
            'message_type': message_type,
            'content': content,
            'media_url': media_url,
            'timestamp': datetime.fromtimestamp(
                int(getattr(msg, 'time', 0))
            ) if getattr(msg, 'time', None) else None,
        }]

    def send_text(self, channel, conversation, text):
        """Send text message to WeChat Work external contact."""
        token = self._get_access_token(channel)
        if not token:
            raise Exception('Failed to get WeChat Work access token')

        config = self._get_config(channel)
        import requests
        url = 'https://qyapi.weixin.qq.com/cgi-bin/externalcontact/send'
        payload = {
            'external_userid': conversation.external_id,
            'agentid': int(config.get('agent_id', 0)),
            'msgtype': 'text',
            'text': {'content': text},
        }
        resp = requests.post(
            url,
            params={'access_token': token},
            json=payload,
            timeout=10,
        )
        data = resp.json()

        if data.get('errcode', 0) != 0:
            _logger.error('WeChat send error: %s', data.get('errmsg'))
            return {
                'external_msg_id': '',
                'delivery_status': 'failed',
            }

        return {
            'external_msg_id': data.get('msgid', ''),
            'delivery_status': 'sent',
        }

    def send_media(self, channel, conversation, media_type, attachment):
        """Send media message to WeChat Work external contact."""
        token = self._get_access_token(channel)
        if not token:
            raise Exception('Failed to get WeChat Work access token')

        # First upload media to WeChat Work
        media_id = self._upload_media(token, media_type, attachment)
        if not media_id:
            return {'external_msg_id': '', 'delivery_status': 'failed'}

        config = self._get_config(channel)
        import requests
        url = 'https://qyapi.weixin.qq.com/cgi-bin/externalcontact/send'
        payload = {
            'external_userid': conversation.external_id,
            'agentid': int(config.get('agent_id', 0)),
            'msgtype': media_type,
            media_type: {'media_id': media_id},
        }
        resp = requests.post(
            url,
            params={'access_token': token},
            json=payload,
            timeout=10,
        )
        data = resp.json()

        if data.get('errcode', 0) != 0:
            _logger.error('WeChat send media error: %s', data.get('errmsg'))
            return {'external_msg_id': '', 'delivery_status': 'failed'}

        return {
            'external_msg_id': data.get('msgid', ''),
            'delivery_status': 'sent',
        }

    def get_user_profile(self, channel, external_id):
        """Fetch external contact profile from WeChat Work."""
        token = self._get_access_token(channel)
        if not token:
            return {}

        import requests
        url = 'https://qyapi.weixin.qq.com/cgi-bin/externalcontact/get'
        resp = requests.get(
            url,
            params={'access_token': token, 'external_userid': external_id},
            timeout=10,
        )
        data = resp.json()

        if data.get('errcode', 0) != 0:
            _logger.warning(
                'WeChat get_user_profile failed: %s', data.get('errmsg'),
            )
            return {}

        contact = data.get('external_contact', {})
        return {
            'name': contact.get('name', ''),
            'avatar_url': contact.get('avatar', ''),
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _upload_media(self, token, media_type, attachment):
        """Upload media to WeChat Work and return media_id."""
        import requests
        import base64

        type_map = {'image': 'image', 'video': 'video', 'audio': 'voice', 'file': 'file'}
        wechat_type = type_map.get(media_type, 'file')

        url = 'https://qyapi.weixin.qq.com/cgi-bin/media/upload'
        file_data = base64.b64decode(attachment.datas)

        resp = requests.post(
            url,
            params={'access_token': token, 'type': wechat_type},
            files={'media': (attachment.name, file_data)},
            timeout=30,
        )
        data = resp.json()

        if data.get('errcode', 0) != 0:
            _logger.error('WeChat upload media error: %s', data.get('errmsg'))
            return None

        return data.get('media_id')

    @api.model
    def _cron_refresh_tokens(self):
        """Cron: pre-refresh access tokens for all active WeChat Work channels."""
        channels = self.env['seisei.messaging.channel'].search([
            ('channel_type', '=', 'wechat_work'),
            ('active', '=', True),
        ])
        for channel in channels:
            try:
                self._get_access_token(channel)
                _logger.info(
                    'WeChat Work token refreshed for channel %d', channel.id,
                )
            except Exception as e:
                _logger.exception(
                    'WeChat Work token refresh failed for channel %d: %s',
                    channel.id, e,
                )
