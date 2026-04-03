import logging

from odoo import api, fields, models

_logger = logging.getLogger(__name__)


class HelpdeskTeamSLA(models.Model):
    """Extend team with SLA cron methods."""
    _inherit = 'seisei.helpdesk.team'

    sla_ids = fields.One2many(
        'seisei.helpdesk.sla', 'team_id', string='SLA Policies',
    )
    sla_count = fields.Integer(compute='_compute_sla_count')

    @api.depends('sla_ids')
    def _compute_sla_count(self):
        for team in self:
            team.sla_count = len(team.sla_ids)

    @api.model
    def _cron_sla_check(self):
        """Cron: detect SLA breaches and escalate.

        Runs every 15 minutes.
        """
        Status = self.env['seisei.helpdesk.sla.status']
        now = fields.Datetime.now()

        # Find ongoing statuses that are past deadline
        breached = Status.search([
            ('status', '=', 'ongoing'),
            ('deadline', '<', now),
            ('reached_datetime', '=', False),
        ])

        if not breached:
            return

        _logger.info('SLA breach check: %d breached statuses', len(breached))

        for status in breached:
            sla = status.sla_id
            ticket = status.ticket_id

            # Create escalation activity if escalation user is set
            if sla.escalation_user_id:
                existing = self.env['mail.activity'].search([
                    ('res_model', '=', 'seisei.helpdesk.ticket'),
                    ('res_id', '=', ticket.id),
                    ('user_id', '=', sla.escalation_user_id.id),
                    ('summary', 'ilike', 'SLA Breach'),
                ], limit=1)
                if not existing:
                    ticket.activity_schedule(
                        'mail.mail_activity_data_todo',
                        user_id=sla.escalation_user_id.id,
                        summary='SLA Breach: %s' % sla.name,
                        note=(
                            'Ticket <b>%s</b> has breached SLA policy '
                            '<b>%s</b>. Deadline was %s.'
                        ) % (
                            ticket.number, sla.name,
                            fields.Datetime.to_string(status.deadline),
                        ),
                    )
                    _logger.info(
                        'SLA escalation: ticket %s, SLA %s -> user %s',
                        ticket.number, sla.name,
                        sla.escalation_user_id.name,
                    )
