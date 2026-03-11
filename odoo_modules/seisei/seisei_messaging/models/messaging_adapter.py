import logging

from odoo import models

_logger = logging.getLogger(__name__)


class MessagingAdapter(models.AbstractModel):
    """Abstract adapter defining the strategy interface for channel implementations.

    Concrete adapters must be registered as:
        seisei.messaging.adapter.<channel_type>

    For example:
        seisei.messaging.adapter.wechat_work
        seisei.messaging.adapter.line
        seisei.messaging.adapter.whatsapp
    """
    _name = 'seisei.messaging.adapter'
    _description = 'Messaging Adapter (Abstract)'

    def send_text(self, channel, conversation, text):
        """Send a text message to the external platform.

        Args:
            channel: seisei.messaging.channel record
            conversation: seisei.messaging.conversation record
            text: str message content

        Returns:
            dict with 'external_msg_id' and 'delivery_status'
        """
        raise NotImplementedError(
            'send_text not implemented for adapter %s' % self._name
        )

    def send_media(self, channel, conversation, media_type, attachment):
        """Send a media message.

        Args:
            channel: seisei.messaging.channel record
            conversation: seisei.messaging.conversation record
            media_type: str (image/video/audio/file)
            attachment: ir.attachment record

        Returns:
            dict with 'external_msg_id' and 'delivery_status'
        """
        raise NotImplementedError(
            'send_media not implemented for adapter %s' % self._name
        )

    def verify_webhook(self, channel, request):
        """Verify an incoming webhook request.

        Args:
            channel: seisei.messaging.channel record
            request: werkzeug Request object

        Returns:
            Response to return to the platform (e.g. challenge echo)
            or None if verification passes silently
        """
        raise NotImplementedError(
            'verify_webhook not implemented for adapter %s' % self._name
        )

    def parse_webhook(self, channel, request):
        """Parse an incoming webhook into normalized messages.

        Args:
            channel: seisei.messaging.channel record
            request: werkzeug Request object

        Returns:
            list of dicts, each with keys:
                external_id: str (sender user ID)
                external_name: str (sender display name, optional)
                external_msg_id: str (message ID for dedup)
                message_type: str (text/image/video/audio/file/location/sticker)
                content: str (text content)
                media_url: str (media URL, optional)
                timestamp: datetime (optional)
        """
        raise NotImplementedError(
            'parse_webhook not implemented for adapter %s' % self._name
        )

    def get_user_profile(self, channel, external_id):
        """Fetch user profile from the external platform.

        Args:
            channel: seisei.messaging.channel record
            external_id: str platform user ID

        Returns:
            dict with keys: name, avatar_url, phone, email (all optional)
        """
        return {}
