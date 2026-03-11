import logging

from odoo import api, fields, models

_logger = logging.getLogger(__name__)


class HelpdeskSLAStatus(models.Model):
    _name = 'seisei.helpdesk.sla.status'
    _description = 'Helpdesk SLA Status'
    _order = 'deadline'
    _rec_name = 'sla_id'

    ticket_id = fields.Many2one(
        'seisei.helpdesk.ticket', required=True, ondelete='cascade', index=True,
    )
    sla_id = fields.Many2one(
        'seisei.helpdesk.sla', required=True, ondelete='cascade', index=True,
    )
    team_id = fields.Many2one(
        related='ticket_id.team_id', store=True, readonly=True,
    )

    # --- Computed ---
    deadline = fields.Datetime(
        compute='_compute_deadline', store=True,
    )
    reached_datetime = fields.Datetime(
        string='Reached At', readonly=True,
    )
    status = fields.Selection([
        ('ongoing', 'Ongoing'),
        ('reached', 'Reached'),
        ('failed', 'Failed'),
    ], compute='_compute_status', store=True, string='Status')

    exceeded_hours = fields.Float(
        compute='_compute_exceeded_hours', store=True,
        help='Positive = late, negative = early.',
    )

    # ------------------------------------------------------------------
    # Deadline computation
    # ------------------------------------------------------------------

    @api.depends(
        'ticket_id.create_date',
        'sla_id.time_hours',
        'sla_id.exclude_stage_ids',
        'ticket_id.team_id.resource_calendar_id',
    )
    def _compute_deadline(self):
        for status in self:
            if not status.ticket_id.create_date or not status.sla_id.time_hours:
                status.deadline = False
                continue

            calendar = (
                status.ticket_id.team_id.resource_calendar_id
                or self.env.company.resource_calendar_id
            )
            start_dt = status.ticket_id.create_date
            hours = status.sla_id.time_hours

            # Subtract frozen hours (time in excluded stages)
            frozen = status._get_frozen_hours()
            remaining_hours = hours - frozen
            if remaining_hours <= 0:
                # Already exceeded just from frozen time
                status.deadline = start_dt
                continue

            try:
                deadline = calendar.plan_hours(
                    remaining_hours, start_dt, compute_leaves=True,
                )
                status.deadline = deadline or start_dt
            except Exception:
                # Fallback: simple calendar hours
                _logger.warning(
                    'SLA deadline calc fallback for ticket %s',
                    status.ticket_id.number,
                )
                from datetime import timedelta
                status.deadline = start_dt + timedelta(hours=hours)

    # ------------------------------------------------------------------
    # Status computation
    # ------------------------------------------------------------------

    @api.depends('deadline', 'reached_datetime')
    def _compute_status(self):
        now = fields.Datetime.now()
        for status in self:
            if status.reached_datetime:
                if status.deadline and status.reached_datetime <= status.deadline:
                    status.status = 'reached'
                else:
                    status.status = 'failed'
            elif status.deadline and now > status.deadline:
                status.status = 'failed'
            else:
                status.status = 'ongoing'

    # ------------------------------------------------------------------
    # Exceeded hours
    # ------------------------------------------------------------------

    @api.depends('deadline', 'reached_datetime')
    def _compute_exceeded_hours(self):
        now = fields.Datetime.now()
        for status in self:
            if not status.deadline:
                status.exceeded_hours = 0.0
                continue
            end = status.reached_datetime or now
            delta = (end - status.deadline).total_seconds() / 3600.0
            status.exceeded_hours = round(delta, 2)

    # ------------------------------------------------------------------
    # Frozen hours helper
    # ------------------------------------------------------------------

    def _get_frozen_hours(self):
        """Calculate hours the ticket spent in excluded stages.

        Reads stage transitions from mail.tracking.value on the ticket.
        """
        self.ensure_one()
        exclude_ids = self.sla_id.exclude_stage_ids.ids
        if not exclude_ids:
            return 0.0

        ticket = self.ticket_id
        # Get all stage transitions from tracking values
        tracking_values = self.env['mail.tracking.value'].search([
            ('mail_message_id.res_id', '=', ticket.id),
            ('mail_message_id.model', '=', 'seisei.helpdesk.ticket'),
            ('field_id.name', '=', 'stage_id'),
        ], order='create_date')

        frozen_hours = 0.0
        in_frozen = False
        frozen_start = None

        for tv in tracking_values:
            old_stage_id = tv.old_value_integer
            new_stage_id = tv.new_value_integer

            if new_stage_id in exclude_ids and not in_frozen:
                in_frozen = True
                frozen_start = tv.create_date
            elif old_stage_id in exclude_ids and in_frozen:
                in_frozen = False
                if frozen_start:
                    delta = (tv.create_date - frozen_start).total_seconds() / 3600.0
                    frozen_hours += delta
                    frozen_start = None

        # Still in frozen stage
        if in_frozen and frozen_start:
            delta = (fields.Datetime.now() - frozen_start).total_seconds() / 3600.0
            frozen_hours += delta

        return frozen_hours
