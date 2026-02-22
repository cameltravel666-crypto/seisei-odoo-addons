import itertools
import logging
from datetime import timedelta

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

    # ------------------------------------------------------------------
    # Dashboard RPC
    # ------------------------------------------------------------------

    @api.model
    def retrieve_dashboard(self):
        """Single RPC returning all helpdesk dashboard data."""
        Ticket = self.env['seisei.helpdesk.ticket']
        uid = self.env.uid
        now = fields.Datetime.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        seven_days_ago = today_start - timedelta(days=7)

        show_sla = 'seisei.helpdesk.sla.status' in self.env

        # ── My Tickets (open, assigned to me) ──
        my_domain = [('user_id', '=', uid), ('is_closed', '=', False)]
        my_all = Ticket.search(my_domain)
        my_high = my_all.filtered(lambda t: t.priority == '2')
        my_urgent = my_all.filtered(lambda t: t.priority == '3')

        def _ticket_kpi(tickets):
            count = len(tickets)
            if count:
                total_hours = sum(
                    (now - t.create_date).total_seconds() / 3600.0
                    for t in tickets if t.create_date
                )
                avg_hours = round(total_hours / count, 1)
            else:
                avg_hours = 0.0
            sla_failed = 0
            if show_sla:
                for t in tickets:
                    statuses = self.env['seisei.helpdesk.sla.status'].search([
                        ('ticket_id', '=', t.id), ('status', '=', 'failed'),
                    ], limit=1)
                    if statuses:
                        sla_failed += 1
            return {
                'count': count,
                'avg_hours': avg_hours,
                'sla_failed': sla_failed,
            }

        # ── My Performance ──
        closed_today = Ticket.search_count([
            ('user_id', '=', uid),
            ('is_closed', '=', True),
            ('closed_date', '>=', today_start),
        ])
        closed_7days = Ticket.search_count([
            ('user_id', '=', uid),
            ('is_closed', '=', True),
            ('closed_date', '>=', seven_days_ago),
        ])
        avg_7days = round(closed_7days / 7.0, 1) if closed_7days else 0.0

        today_sla_rate = self._compute_sla_success_rate(uid, today_start) if show_sla else 0.0
        days7_sla_rate = self._compute_sla_success_rate(uid, seven_days_ago) if show_sla else 0.0

        target_closed = 5  # MVP hardcoded daily target

        # ── Customer Care: per-team stats ──
        teams = self.search([])
        team_data = []
        for team in teams:
            t_domain = [('team_id', '=', team.id), ('is_closed', '=', False)]
            open_count = Ticket.search_count(t_domain)
            unassigned_count = Ticket.search_count(t_domain + [('user_id', '=', False)])
            urgent_count = Ticket.search_count(t_domain + [('priority', '=', '3')])
            sla_failed_count = 0
            if show_sla:
                open_tickets = Ticket.search(t_domain)
                for t in open_tickets:
                    statuses = self.env['seisei.helpdesk.sla.status'].search([
                        ('ticket_id', '=', t.id), ('status', '=', 'failed'),
                    ], limit=1)
                    if statuses:
                        sla_failed_count += 1
            team_data.append({
                'id': team.id,
                'name': team.name,
                'open_count': open_count,
                'unassigned_count': unassigned_count,
                'urgent_count': urgent_count,
                'sla_failed_count': sla_failed_count,
            })

        return {
            'my_all': _ticket_kpi(my_all),
            'my_high': _ticket_kpi(my_high),
            'my_urgent': _ticket_kpi(my_urgent),
            'today_closed': closed_today,
            'today_sla_success_rate': today_sla_rate,
            '7days_closed': closed_7days,
            '7days_avg_closed': avg_7days,
            '7days_sla_success_rate': days7_sla_rate,
            'target_closed': target_closed,
            'teams': team_data,
            'show_sla': show_sla,
            'labels': {
                'title': _('Helpdesk Dashboard'),
                'myTickets': _('My Tickets'),
                'myPerformance': _('My Performance'),
                'customerCare': _('Customer Care'),
                'allTickets': _('All Tickets'),
                'highPriority': _('High Priority'),
                'urgent': _('Urgent'),
                'avgOpenHours': _('Avg Open Hours'),
                'slaFailed': _('SLA Failed'),
                'todayClosed': _('Today Closed'),
                'slaSuccessRate': _('SLA Success Rate'),
                'last7Days': _('Last 7 Days'),
                'closedTickets': _('Closed'),
                'avgPerDay': _('Avg/Day'),
                'dailyTarget': _('Daily Target'),
                'open': _('Open'),
                'unassigned': _('Unassigned'),
                'noTeams': _('No teams configured'),
            },
        }

    @api.model
    def _compute_sla_success_rate(self, uid, since):
        """Compute SLA success rate for a user since a given datetime."""
        if 'seisei.helpdesk.sla.status' not in self.env:
            return 0.0
        SlaStatus = self.env['seisei.helpdesk.sla.status']
        domain = [
            ('ticket_id.user_id', '=', uid),
            ('ticket_id.closed_date', '>=', since),
            ('ticket_id.is_closed', '=', True),
        ]
        total = SlaStatus.search_count(domain)
        if not total:
            return 0.0
        success = SlaStatus.search_count(domain + [('status', '=', 'reached')])
        return round(success / total * 100.0, 1)
