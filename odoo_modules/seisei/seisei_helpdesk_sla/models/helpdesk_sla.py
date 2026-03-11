from odoo import api, fields, models


class HelpdeskSLA(models.Model):
    _name = 'seisei.helpdesk.sla'
    _description = 'Helpdesk SLA Policy'
    _order = 'name'

    name = fields.Char(required=True, translate=True)
    active = fields.Boolean(default=True)
    team_id = fields.Many2one(
        'seisei.helpdesk.team', required=True, ondelete='cascade',
    )
    company_id = fields.Many2one(
        related='team_id.company_id', store=True, readonly=True,
    )

    # --- Matching criteria (optional filters) ---
    priority = fields.Selection([
        ('0', 'Low'),
        ('1', 'Medium'),
        ('2', 'High'),
        ('3', 'Urgent'),
    ], string='Minimum Priority',
       help='SLA applies only to tickets with this priority or higher.')
    tag_ids = fields.Many2many(
        'seisei.helpdesk.tag',
        'seisei_helpdesk_sla_tag_rel',
        'sla_id', 'tag_id',
        string='Tags',
        help='If set, SLA only applies when ticket has any of these tags.',
    )
    partner_ids = fields.Many2many(
        'res.partner',
        'seisei_helpdesk_sla_partner_rel',
        'sla_id', 'partner_id',
        string='Customers',
        help='If set, SLA only applies to these customers.',
    )

    # --- Target ---
    target_stage_id = fields.Many2one(
        'seisei.helpdesk.stage', required=True,
        string='Target Stage',
        help='Stage that must be reached within the SLA time.',
    )
    exclude_stage_ids = fields.Many2many(
        'seisei.helpdesk.stage',
        'seisei_helpdesk_sla_exclude_stage_rel',
        'sla_id', 'stage_id',
        string='Excluded Stages',
        help='Time spent in these stages is frozen (not counted toward SLA).',
    )
    time_hours = fields.Float(
        string='Target Hours',
        required=True,
        help='Maximum working hours to reach the target stage.',
    )

    # --- Escalation ---
    escalation_user_id = fields.Many2one(
        'res.users', string='Escalation Contact',
        help='User notified via activity when SLA is breached.',
    )

    # --- Computed ---
    ticket_count = fields.Integer(
        compute='_compute_ticket_count', string='Open Tickets',
    )

    @api.depends('team_id')
    def _compute_ticket_count(self):
        if not self.ids:
            self.ticket_count = 0
            return
        data = self.env['seisei.helpdesk.sla.status']._read_group(
            [('sla_id', 'in', self.ids), ('status', '=', 'ongoing')],
            ['sla_id'],
            ['__count'],
        )
        count_map = {sla.id: count for sla, count in data}
        for sla in self:
            sla.ticket_count = count_map.get(sla.id, 0)
