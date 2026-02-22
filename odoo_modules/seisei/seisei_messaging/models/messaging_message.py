from odoo import api, fields, models


class MessagingMessage(models.Model):
    _name = 'seisei.messaging.message'
    _description = 'Messaging Message'
    _order = 'timestamp desc'

    conversation_id = fields.Many2one(
        'seisei.messaging.conversation', required=True,
        ondelete='cascade', index=True,
    )
    channel_id = fields.Many2one(
        related='conversation_id.channel_id', store=True, readonly=True,
    )
    channel_type = fields.Selection(
        related='conversation_id.channel_type', store=True, readonly=True,
    )

    # --- Direction ---
    direction = fields.Selection([
        ('in', 'Incoming'),
        ('out', 'Outgoing'),
    ], required=True, default='in')

    # --- Content ---
    message_type = fields.Selection([
        ('text', 'Text'),
        ('image', 'Image'),
        ('video', 'Video'),
        ('audio', 'Audio'),
        ('file', 'File'),
        ('location', 'Location'),
        ('sticker', 'Sticker'),
    ], default='text', required=True)
    content = fields.Text(string='Content')
    media_url = fields.Char(string='Media URL')
    media_attachment_id = fields.Many2one(
        'ir.attachment', string='Attachment',
    )

    # --- External tracking ---
    external_msg_id = fields.Char(
        string='External Message ID', index=True,
        help='Platform message ID for deduplication.',
    )

    # --- Delivery ---
    delivery_status = fields.Selection([
        ('pending', 'Pending'),
        ('sent', 'Sent'),
        ('delivered', 'Delivered'),
        ('read', 'Read'),
        ('failed', 'Failed'),
    ], default='pending')
    error_message = fields.Text(string='Error Details')

    # --- AI ---
    is_ai_reply = fields.Boolean(default=False)

    # --- Timestamp ---
    timestamp = fields.Datetime(
        default=fields.Datetime.now, index=True,
    )

    _sql_constraints = [
        ('external_msg_uniq',
         'unique(channel_id, external_msg_id)',
         'Duplicate external message ID for this channel!'),
    ]

    def init(self):
        """Create performance indexes."""
        self.env.cr.execute("""
            CREATE INDEX IF NOT EXISTS seisei_messaging_message_conv_ts_idx
            ON seisei_messaging_message (conversation_id, timestamp DESC)
        """)
