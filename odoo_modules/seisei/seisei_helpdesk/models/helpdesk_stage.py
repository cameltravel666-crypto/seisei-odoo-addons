from odoo import api, fields, models


class HelpdeskStage(models.Model):
    _name = 'seisei.helpdesk.stage'
    _description = 'Helpdesk Stage'
    _order = 'sequence, id'

    name = fields.Char(required=True, translate=True)
    sequence = fields.Integer(default=10)
    fold = fields.Boolean(
        string='Folded in Kanban',
        help='Folded stages are treated as closed in the Kanban view.',
    )
    is_close = fields.Boolean(
        string='Closing Stage',
        help='Tickets in this stage are considered closed/resolved.',
    )
    team_ids = fields.Many2many(
        'seisei.helpdesk.team',
        'seisei_helpdesk_team_stage_rel',
        'stage_id', 'team_id',
        string='Teams',
    )
    mail_template_id = fields.Many2one(
        'mail.template',
        string='Email Template',
        domain=[('model', '=', 'seisei.helpdesk.ticket')],
        help='Automated email sent when a ticket enters this stage.',
    )
