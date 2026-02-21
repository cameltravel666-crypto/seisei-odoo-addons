from odoo import api, fields, models


class HelpdeskTicketSLA(models.Model):
    """Extend ticket with SLA tracking fields."""
    _inherit = 'seisei.helpdesk.ticket'

    sla_status_ids = fields.One2many(
        'seisei.helpdesk.sla.status', 'ticket_id',
        string='SLA Status',
    )
    sla_deadline = fields.Datetime(
        compute='_compute_sla_deadline', store=True,
        string='SLA Deadline',
        help='Earliest upcoming SLA deadline.',
    )
    sla_fail = fields.Boolean(
        compute='_compute_sla_fail', store=True,
        string='SLA Failed',
    )

    @api.depends('sla_status_ids.deadline', 'sla_status_ids.status')
    def _compute_sla_deadline(self):
        for ticket in self:
            ongoing = ticket.sla_status_ids.filtered(
                lambda s: s.status == 'ongoing' and s.deadline
            )
            if ongoing:
                ticket.sla_deadline = min(ongoing.mapped('deadline'))
            else:
                ticket.sla_deadline = False

    @api.depends('sla_status_ids.status')
    def _compute_sla_fail(self):
        for ticket in self:
            ticket.sla_fail = any(
                s.status == 'failed' for s in ticket.sla_status_ids
            )

    # ------------------------------------------------------------------
    # SLA application
    # ------------------------------------------------------------------

    def _sla_apply(self):
        """Match and apply SLA policies to these tickets."""
        SLA = self.env['seisei.helpdesk.sla']
        Status = self.env['seisei.helpdesk.sla.status']

        for ticket in self:
            if not ticket.team_id.use_sla:
                continue

            # Find matching SLA policies
            domain = [
                ('team_id', '=', ticket.team_id.id),
                ('active', '=', True),
            ]
            slas = SLA.search(domain)
            matching = self.env['seisei.helpdesk.sla']

            for sla in slas:
                # Priority filter
                if sla.priority and ticket.priority < sla.priority:
                    continue
                # Tag filter
                if sla.tag_ids and not (sla.tag_ids & ticket.tag_ids):
                    continue
                # Partner filter
                if sla.partner_ids and ticket.partner_id not in sla.partner_ids:
                    continue
                # Stage must be reachable (target sequence > current)
                if (ticket.stage_id and sla.target_stage_id
                        and sla.target_stage_id.sequence <= ticket.stage_id.sequence):
                    continue
                matching |= sla

            # Remove old statuses for SLAs that no longer match
            existing = ticket.sla_status_ids
            to_remove = existing.filtered(lambda s: s.sla_id not in matching)
            to_remove.unlink()

            # Create statuses for new matching SLAs
            existing_sla_ids = existing.mapped('sla_id').ids
            for sla in matching:
                if sla.id not in existing_sla_ids:
                    Status.create({
                        'ticket_id': ticket.id,
                        'sla_id': sla.id,
                    })

    def _sla_reach(self):
        """Mark SLA statuses as reached when target stage is met."""
        now = fields.Datetime.now()
        for ticket in self:
            for status in ticket.sla_status_ids:
                if (status.status == 'ongoing'
                        and not status.reached_datetime
                        and ticket.stage_id == status.sla_id.target_stage_id):
                    status.reached_datetime = now

    # ------------------------------------------------------------------
    # Override CRUD to trigger SLA
    # ------------------------------------------------------------------

    @api.model_create_multi
    def create(self, vals_list):
        tickets = super().create(vals_list)
        tickets._sla_apply()
        return tickets

    def write(self, vals):
        result = super().write(vals)
        # Re-apply SLA on relevant field changes
        trigger_fields = {'team_id', 'priority', 'tag_ids', 'partner_id'}
        if trigger_fields & set(vals.keys()):
            self._sla_apply()
        # Check SLA reached on stage change
        if 'stage_id' in vals:
            self._sla_reach()
        return result
