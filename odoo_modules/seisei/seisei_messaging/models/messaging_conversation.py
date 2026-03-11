from odoo import api, fields, models, _


class MessagingConversation(models.Model):
    _name = 'seisei.messaging.conversation'
    _description = 'Messaging Conversation'
    _order = 'last_message_at desc'
    _inherit = ['mail.thread']

    name = fields.Char(string='Contact Name', compute='_compute_name', store=True)
    channel_id = fields.Many2one(
        'seisei.messaging.channel', required=True, ondelete='cascade', index=True,
    )
    channel_type = fields.Selection(
        related='channel_id.channel_type', store=True, readonly=True,
    )
    company_id = fields.Many2one(
        related='channel_id.company_id', store=True, readonly=True,
    )

    # --- External identity ---
    external_id = fields.Char(
        string='External User ID', required=True, index=True,
        help='Platform-specific user identifier.',
    )
    external_name = fields.Char(string='External Name')
    external_avatar_url = fields.Char(string='Avatar URL')

    # --- Odoo partner ---
    partner_id = fields.Many2one('res.partner', string='Customer')

    # --- Assignment ---
    assigned_user_id = fields.Many2one(
        'res.users', string='Assigned Agent', tracking=True,
    )

    # --- Messages ---
    message_ids_rel = fields.One2many(
        'seisei.messaging.message', 'conversation_id',
        string='Messages',
    )
    message_count = fields.Integer(compute='_compute_message_count')
    last_message_at = fields.Datetime(
        compute='_compute_last_message_at', store=True,
    )
    last_message_preview = fields.Char(
        compute='_compute_last_message_at', store=True,
    )

    # ticket_ids and ticket_count added by seisei_helpdesk_messaging bridge

    # --- State ---
    state = fields.Selection([
        ('active', 'Active'),
        ('idle', 'Idle'),
        ('closed', 'Closed'),
    ], default='active', tracking=True)

    _sql_constraints = [
        ('channel_external_uniq', 'unique(channel_id, external_id)',
         'Duplicate conversation for this channel and external user!'),
    ]

    @api.depends('external_name', 'partner_id')
    def _compute_name(self):
        for conv in self:
            if conv.partner_id:
                conv.name = conv.partner_id.name
            else:
                conv.name = conv.external_name or conv.external_id or _('Unknown')

    def _compute_message_count(self):
        if not self.ids:
            self.message_count = 0
            return
        data = self.env['seisei.messaging.message']._read_group(
            [('conversation_id', 'in', self.ids)],
            ['conversation_id'], ['__count'],
        )
        count_map = {conv.id: count for conv, count in data}
        for conv in self:
            conv.message_count = count_map.get(conv.id, 0)

    @api.depends('message_ids_rel.timestamp')
    def _compute_last_message_at(self):
        for conv in self:
            msgs = conv.message_ids_rel.sorted('timestamp', reverse=True)
            if msgs:
                conv.last_message_at = msgs[0].timestamp
                conv.last_message_preview = (msgs[0].content or '')[:80]
            else:
                conv.last_message_at = False
                conv.last_message_preview = False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def action_view_messages(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Messages'),
            'res_model': 'seisei.messaging.message',
            'view_mode': 'list,form',
            'domain': [('conversation_id', '=', self.id)],
            'context': {'default_conversation_id': self.id},
        }

    def action_send_message(self):
        """Open the send message wizard."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Send Message'),
            'res_model': 'seisei.messaging.send.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {'default_conversation_id': self.id},
        }

    def action_assign_to_me(self):
        self.write({'assigned_user_id': self.env.uid})

    def action_close(self):
        self.write({'state': 'closed'})
