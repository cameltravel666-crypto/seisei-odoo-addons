import logging

from odoo import api, Command, fields, models, _
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)

TICKET_PRIORITY = [
    ('0', 'Low'),
    ('1', 'Medium'),
    ('2', 'High'),
    ('3', 'Urgent'),
]


class HelpdeskTicket(models.Model):
    _name = 'seisei.helpdesk.ticket'
    _description = 'Helpdesk Ticket'
    _inherit = ['mail.thread', 'mail.activity.mixin', 'rating.mixin', 'portal.mixin']
    _order = 'priority desc, create_date desc'
    _mail_post_access = 'read'

    # --- Identification ---
    number = fields.Char(
        string='Ticket Number', readonly=True, copy=False,
        default=lambda self: _('New'),
    )
    name = fields.Char(string='Subject', required=True, tracking=True)
    description = fields.Html(sanitize=True)

    # --- Workflow ---
    team_id = fields.Many2one(
        'seisei.helpdesk.team', string='Team',
        required=True, tracking=True,
        default=lambda self: self._default_team_id(),
    )
    stage_id = fields.Many2one(
        'seisei.helpdesk.stage', string='Stage',
        tracking=True, group_expand='_read_group_stage_ids',
        copy=False,
    )
    user_id = fields.Many2one(
        'res.users', string='Assigned to',
        tracking=True,
    )
    tag_ids = fields.Many2many(
        'seisei.helpdesk.tag',
        'seisei_helpdesk_ticket_tag_rel',
        'ticket_id', 'tag_id',
        string='Tags',
    )
    priority = fields.Selection(
        TICKET_PRIORITY, default='0', tracking=True,
    )
    kanban_state = fields.Selection([
        ('normal', 'In Progress'),
        ('done', 'Ready'),
        ('blocked', 'Blocked'),
    ], default='normal', tracking=True)
    kanban_state_label = fields.Char(
        compute='_compute_kanban_state_label',
    )
    color = fields.Integer(string='Color Index')
    active = fields.Boolean(default=True)

    # --- Customer ---
    partner_id = fields.Many2one(
        'res.partner', string='Customer', tracking=True,
    )
    partner_name = fields.Char(string='Customer Name')
    partner_email = fields.Char(string='Customer Email')
    partner_phone = fields.Char(string='Customer Phone')

    # --- Dates ---
    assigned_date = fields.Datetime(string='First Assigned', readonly=True)
    closed_date = fields.Datetime(string='Closed Date', readonly=True)
    last_stage_update = fields.Datetime(
        string='Last Stage Update', readonly=True,
        default=fields.Datetime.now,
    )

    # --- Computed ---
    is_closed = fields.Boolean(
        compute='_compute_is_closed', store=True,
    )
    assign_hours = fields.Float(
        string='Hours to Assign', compute='_compute_assign_hours', store=True,
    )
    close_hours = fields.Float(
        string='Hours to Close', compute='_compute_close_hours', store=True,
    )

    # --- Channel origin ---
    channel_type = fields.Selection([
        ('form', 'Web Form'),
        ('email', 'Email'),
        ('chat', 'Live Chat'),
        ('wechat', 'WeChat Work'),
        ('line', 'LINE'),
        ('whatsapp', 'WhatsApp'),
        ('phone', 'Phone'),
    ], string='Channel', default='form')
    # source_conversation_id added by seisei_helpdesk_messaging bridge module

    # --- Company ---
    company_id = fields.Many2one(
        'res.company', required=True,
        default=lambda self: self.env.company,
    )

    # ------------------------------------------------------------------
    # SQL constraints & indexes
    # ------------------------------------------------------------------

    _sql_constraints = [
        ('number_company_uniq', 'unique(number, company_id)',
         'Ticket number must be unique per company!'),
    ]

    def init(self):
        """Create performance indexes."""
        self.env.cr.execute("""
            CREATE INDEX IF NOT EXISTS seisei_helpdesk_ticket_team_closed_user_idx
            ON seisei_helpdesk_ticket (team_id, is_closed, user_id)
        """)

    # ------------------------------------------------------------------
    # Defaults
    # ------------------------------------------------------------------

    def _default_team_id(self):
        team = self.env['seisei.helpdesk.team'].search(
            [('company_id', '=', self.env.company.id)], limit=1,
        )
        return team

    # ------------------------------------------------------------------
    # Computed fields
    # ------------------------------------------------------------------

    @api.depends('stage_id.is_close')
    def _compute_is_closed(self):
        for ticket in self:
            ticket.is_closed = ticket.stage_id.is_close if ticket.stage_id else False

    @api.depends('kanban_state', 'stage_id')
    def _compute_kanban_state_label(self):
        labels = {
            'normal': _('In Progress'),
            'done': _('Ready'),
            'blocked': _('Blocked'),
        }
        for ticket in self:
            ticket.kanban_state_label = labels.get(ticket.kanban_state, '')

    @api.depends('create_date', 'assigned_date')
    def _compute_assign_hours(self):
        for ticket in self:
            if ticket.create_date and ticket.assigned_date:
                delta = ticket.assigned_date - ticket.create_date
                ticket.assign_hours = delta.total_seconds() / 3600.0
            else:
                ticket.assign_hours = 0.0

    @api.depends('create_date', 'closed_date')
    def _compute_close_hours(self):
        for ticket in self:
            if ticket.create_date and ticket.closed_date:
                delta = ticket.closed_date - ticket.create_date
                ticket.close_hours = delta.total_seconds() / 3600.0
            else:
                ticket.close_hours = 0.0

    # ------------------------------------------------------------------
    # Group expand for Kanban
    # ------------------------------------------------------------------

    @api.model
    def _read_group_stage_ids(self, stages, domain):
        """Show all team stages in Kanban, even if empty."""
        team_id = self.env.context.get('default_team_id')
        if team_id:
            team = self.env['seisei.helpdesk.team'].browse(team_id)
            return team.stage_ids
        return stages.search([], order='sequence')

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            # Generate ticket number
            if vals.get('number', _('New')) == _('New'):
                vals['number'] = self.env['ir.sequence'].next_by_code(
                    'seisei.helpdesk.ticket',
                ) or _('New')

            # Resolve default stage from team
            if not vals.get('stage_id') and vals.get('team_id'):
                team = self.env['seisei.helpdesk.team'].browse(vals['team_id'])
                default_stage = team._determine_stage()
                if default_stage:
                    vals['stage_id'] = default_stage.id

            # Fill partner info from partner_id
            if vals.get('partner_id') and not vals.get('partner_name'):
                partner = self.env['res.partner'].browse(vals['partner_id'])
                vals.setdefault('partner_name', partner.name)
                vals.setdefault('partner_email', partner.email)
                vals.setdefault('partner_phone', partner.phone)

        tickets = super().create(vals_list)

        # Auto-assignment
        for ticket in tickets:
            if ticket.team_id.assignment_method != 'manual' and not ticket.user_id:
                user = ticket.team_id._assign_ticket(ticket)
                if user:
                    ticket.user_id = user

            # Set assigned_date
            if ticket.user_id and not ticket.assigned_date:
                ticket.assigned_date = fields.Datetime.now()

        return tickets

    def write(self, vals):
        # Track stage changes
        if 'stage_id' in vals:
            vals['last_stage_update'] = fields.Datetime.now()
            vals['kanban_state'] = 'normal'
            stage = self.env['seisei.helpdesk.stage'].browse(vals['stage_id'])
            if stage.is_close:
                vals['closed_date'] = fields.Datetime.now()
            else:
                vals['closed_date'] = False
            # Send stage email template
            if stage.mail_template_id:
                for ticket in self:
                    stage.mail_template_id.send_mail(ticket.id, force_send=False)

        result = super().write(vals)

        # Track first assignment
        if 'user_id' in vals and vals['user_id']:
            for ticket in self:
                if not ticket.assigned_date:
                    ticket.assigned_date = fields.Datetime.now()

        return result

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    def action_open_ticket(self):
        """Open a single ticket in form view."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'res_model': self._name,
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def action_assign_to_me(self):
        """Quick action: assign ticket to the current user."""
        self.write({'user_id': self.env.uid})

    # ------------------------------------------------------------------
    # Rating mixin
    # ------------------------------------------------------------------

    def rating_get_partner_id(self):
        return self.partner_id

    def rating_get_rated_partner_id(self):
        if self.user_id.partner_id:
            return self.user_id.partner_id
        return self.env['res.partner']

    # ------------------------------------------------------------------
    # Portal mixin
    # ------------------------------------------------------------------

    def _compute_access_url(self):
        super()._compute_access_url()
        for ticket in self:
            ticket.access_url = '/my/helpdesk/ticket/%s' % ticket.id

    # ------------------------------------------------------------------
    # Display name
    # ------------------------------------------------------------------

    @api.depends('number', 'name')
    def _compute_display_name(self):
        for ticket in self:
            ticket.display_name = '%s - %s' % (ticket.number or '', ticket.name or '')
