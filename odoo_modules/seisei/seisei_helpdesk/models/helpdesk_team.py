import itertools
import logging

from odoo import api, fields, models, _

_logger = logging.getLogger(__name__)


class HelpdeskTeam(models.Model):
    _name = 'seisei.helpdesk.team'
    _description = 'Helpdesk Team'
    _inherit = ['mail.thread']
    _order = 'sequence, id'

    name = fields.Char(required=True, translate=True, tracking=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        'res.company', required=True,
        default=lambda self: self.env.company,
    )
    description = fields.Html(sanitize=True)
    color = fields.Integer(string='Color Index')

    # --- Members ---
    member_ids = fields.Many2many(
        'res.users',
        'seisei_helpdesk_team_member_rel',
        'team_id', 'user_id',
        string='Team Members',
    )
    leader_id = fields.Many2one('res.users', string='Team Leader')

    # --- Assignment ---
    assignment_method = fields.Selection([
        ('manual', 'Manual'),
        ('random', 'Round Robin'),
        ('balanced', 'Load Balanced'),
        ('tag', 'Skill / Tag Based'),
    ], default='manual', required=True, string='Assignment Method')
    assign_index = fields.Integer(
        string='Round Robin Index', default=0,
        help='Internal pointer for round-robin assignment.',
    )
    tag_assignment_ids = fields.One2many(
        'seisei.helpdesk.tag.assignment', 'team_id',
        string='Tag Assignment Rules',
    )

    # --- Workflow ---
    stage_ids = fields.Many2many(
        'seisei.helpdesk.stage',
        'seisei_helpdesk_team_stage_rel',
        'team_id', 'stage_id',
        string='Stages',
    )
    resource_calendar_id = fields.Many2one(
        'resource.calendar',
        string='Working Hours',
        help='Working hours used for SLA deadline calculations.',
    )

    # --- Email alias ---
    alias_id = fields.Many2one(
        'mail.alias', string='Email Alias', ondelete='restrict',
    )

    # --- Features ---
    use_sla = fields.Boolean(string='Use SLA')
    use_rating = fields.Boolean(string='Customer Ratings')
    auto_close_days = fields.Integer(
        string='Auto Close (days)',
        help='Automatically close tickets with no activity after N days. 0 = disabled.',
    )

    # --- Computed ---
    ticket_count = fields.Integer(compute='_compute_ticket_count')
    ticket_open_count = fields.Integer(compute='_compute_ticket_count')

    @api.depends('member_ids')
    def _compute_ticket_count(self):
        if not self.ids:
            self.ticket_count = 0
            self.ticket_open_count = 0
            return
        domain_all = [('team_id', 'in', self.ids)]
        domain_open = domain_all + [('is_closed', '=', False)]
        all_data = self.env['seisei.helpdesk.ticket']._read_group(
            domain_all, ['team_id'], ['__count'],
        )
        open_data = self.env['seisei.helpdesk.ticket']._read_group(
            domain_open, ['team_id'], ['__count'],
        )
        all_map = {team.id: count for team, count in all_data}
        open_map = {team.id: count for team, count in open_data}
        for team in self:
            team.ticket_count = all_map.get(team.id, 0)
            team.ticket_open_count = open_map.get(team.id, 0)

    # ------------------------------------------------------------------
    # Assignment algorithms
    # ------------------------------------------------------------------

    def _determine_stage(self):
        """Return the default stage for a new ticket in this team."""
        self.ensure_one()
        return self.stage_ids[:1]

    def _assign_ticket(self, ticket):
        """Auto-assign a single ticket based on team's assignment method.

        Returns the assigned user recordset (may be empty).
        """
        self.ensure_one()
        if self.assignment_method == 'manual':
            return self.env['res.users']
        if self.assignment_method == 'tag':
            return self._assign_by_tags(ticket)
        members = self.member_ids
        if not members:
            return self.env['res.users']
        if self.assignment_method == 'random':
            return self._assign_round_robin(members)
        if self.assignment_method == 'balanced':
            return self._assign_balanced(members)
        return self.env['res.users']

    def _assign_round_robin(self, members):
        """Persistent round-robin across team members."""
        self.ensure_one()
        member_list = members.sorted('id')
        if not member_list:
            return self.env['res.users']
        idx = self.assign_index % len(member_list)
        user = member_list[idx]
        # Use SQL to avoid recursive write triggers
        self.env.cr.execute(
            "UPDATE seisei_helpdesk_team SET assign_index = %s WHERE id = %s",
            ((idx + 1) % len(member_list), self.id),
        )
        self.invalidate_recordset(['assign_index'])
        return user

    def _assign_balanced(self, members):
        """Assign to the member with fewest open tickets."""
        self.ensure_one()
        if not members:
            return self.env['res.users']
        data = self.env['seisei.helpdesk.ticket']._read_group(
            [
                ('team_id', '=', self.id),
                ('is_closed', '=', False),
                ('user_id', 'in', members.ids),
            ],
            ['user_id'],
            ['__count'],
        )
        count_map = {user.id: count for user, count in data}
        # Build (count, id) tuples; sort by count then id for determinism
        scored = sorted(
            [(count_map.get(m.id, 0), m.id, m) for m in members],
            key=lambda x: (x[0], x[1]),
        )
        return scored[0][2]

    def _assign_by_tags(self, ticket):
        """Tag/skill-based assignment with balanced fallback."""
        self.ensure_one()
        if not ticket.tag_ids or not self.tag_assignment_ids:
            # Fallback: balanced among all members
            return self._assign_balanced(self.member_ids)
        # Collect users mapped to any of the ticket's tags
        candidates = self.env['res.users']
        for rule in self.tag_assignment_ids:
            if rule.tag_id in ticket.tag_ids:
                candidates |= rule.user_ids
        candidates = candidates & self.member_ids  # must also be team member
        if not candidates:
            return self._assign_balanced(self.member_ids)
        return self._assign_balanced(candidates)

    # ------------------------------------------------------------------
    # Auto-close cron
    # ------------------------------------------------------------------

    @api.model
    def _cron_auto_close_tickets(self):
        """Close tickets inactive for N days (per-team setting)."""
        teams = self.search([('auto_close_days', '>', 0)])
        Ticket = self.env['seisei.helpdesk.ticket']
        for team in teams:
            cutoff = fields.Datetime.subtract(
                fields.Datetime.now(), days=team.auto_close_days,
            )
            close_stage = team.stage_ids.filtered('is_close')[:1]
            if not close_stage:
                continue
            tickets = Ticket.search([
                ('team_id', '=', team.id),
                ('is_closed', '=', False),
                ('write_date', '<', cutoff),
            ])
            if tickets:
                tickets.write({'stage_id': close_stage.id})
                _logger.info(
                    'Auto-closed %d tickets for team %s',
                    len(tickets), team.name,
                )
