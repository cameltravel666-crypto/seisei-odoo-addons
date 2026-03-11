from odoo import api, fields, models, _


class MessagingConversationCRM(models.Model):
    """Extend conversation with CRM lead link."""
    _inherit = 'seisei.messaging.conversation'

    lead_ids = fields.One2many(
        'crm.lead', 'source_conversation_id',
        string='Leads',
    )
    lead_count = fields.Integer(compute='_compute_lead_count')

    def _compute_lead_count(self):
        for conv in self:
            conv.lead_count = len(conv.lead_ids)

    def action_create_lead(self):
        """Create a CRM lead from this conversation."""
        self.ensure_one()
        channel = self.channel_id

        # Collect recent inbound messages as description
        last_msgs = self.message_ids_rel.filtered(
            lambda m: m.direction == 'in'
        ).sorted('timestamp', reverse=True)[:5]
        description = '<br/>'.join(
            '%s: %s' % (m.timestamp, m.content or '') for m in last_msgs
        )

        channel_label = dict(
            self.channel_id._fields['channel_type'].selection
        ).get(self.channel_type, self.channel_type)

        vals = {
            'name': _('%s: %s') % (channel_label, self.name or self.external_id),
            'description': description,
            'partner_id': self.partner_id.id if self.partner_id else False,
            'contact_name': self.name,
            'source_conversation_id': self.id,
        }
        if channel.crm_team_id:
            vals['team_id'] = channel.crm_team_id.id

        lead = self.env['crm.lead'].create(vals)

        return {
            'type': 'ir.actions.act_window',
            'name': _('Lead'),
            'res_model': 'crm.lead',
            'res_id': lead.id,
            'view_mode': 'form',
            'target': 'current',
        }
