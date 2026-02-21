import hashlib
import hmac
import secrets

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class MessagingChannel(models.Model):
    _name = 'seisei.messaging.channel'
    _description = 'Messaging Channel'
    _order = 'name'

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    channel_type = fields.Selection([
        ('wechat_work', 'WeChat Work'),
        ('line', 'LINE'),
        ('whatsapp', 'WhatsApp'),
    ], required=True, string='Channel Type')
    company_id = fields.Many2one(
        'res.company', required=True,
        default=lambda self: self.env.company,
    )

    # --- Credentials (stored encrypted in config_json) ---
    config_json = fields.Text(
        string='Configuration (JSON)',
        help='Channel-specific credentials and settings in JSON format.',
    )

    # --- Webhook ---
    webhook_token = fields.Char(
        string='Webhook Token', readonly=True, copy=False,
    )
    webhook_url = fields.Char(
        compute='_compute_webhook_url', string='Webhook URL',
    )

    # helpdesk_team_id added by seisei_helpdesk_messaging bridge module

    # --- AI ---
    ai_enabled = fields.Boolean(
        string='AI Auto-Reply',
        help='Enable AI auto-reply for incoming messages.',
    )
    ai_dify_app_id = fields.Char(
        string='Dify App ID',
        help='Per-channel Dify application ID for AI responses.',
    )
    # auto_create_ticket added by seisei_helpdesk_messaging bridge module

    # --- Stats ---
    conversation_count = fields.Integer(compute='_compute_stats')
    message_count = fields.Integer(compute='_compute_stats')

    @api.depends('channel_type', 'webhook_token')
    def _compute_webhook_url(self):
        base = self.env['ir.config_parameter'].sudo().get_param('web.base.url', '')
        for channel in self:
            if channel.webhook_token:
                channel.webhook_url = (
                    '%s/seisei/messaging/%s/%d/webhook'
                    % (base, channel.channel_type, channel.id)
                )
            else:
                channel.webhook_url = False

    def _compute_stats(self):
        if not self.ids:
            self.conversation_count = 0
            self.message_count = 0
            return
        conv_data = self.env['seisei.messaging.conversation']._read_group(
            [('channel_id', 'in', self.ids)],
            ['channel_id'], ['__count'],
        )
        conv_map = {ch.id: count for ch, count in conv_data}
        msg_data = self.env['seisei.messaging.message']._read_group(
            [('conversation_id.channel_id', 'in', self.ids)],
            ['conversation_id.channel_id'], ['__count'],
        )
        msg_map = {ch.id: count for ch, count in msg_data}
        for channel in self:
            channel.conversation_count = conv_map.get(channel.id, 0)
            channel.message_count = msg_map.get(channel.id, 0)

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    def action_generate_webhook_token(self):
        """Generate a new secure webhook token."""
        for channel in self:
            channel.webhook_token = secrets.token_urlsafe(32)

    def action_view_conversations(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Conversations'),
            'res_model': 'seisei.messaging.conversation',
            'view_mode': 'list,form',
            'domain': [('channel_id', '=', self.id)],
            'context': {'default_channel_id': self.id},
        }

    # ------------------------------------------------------------------
    # Adapter resolution
    # ------------------------------------------------------------------

    def _get_adapter(self):
        """Return the messaging adapter for this channel type.

        Adapters are registered as models named
        'seisei.messaging.adapter.<channel_type>'.
        """
        self.ensure_one()
        adapter_model = 'seisei.messaging.adapter.%s' % self.channel_type
        if adapter_model in self.env:
            return self.env[adapter_model]
        return None
