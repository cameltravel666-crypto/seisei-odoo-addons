from odoo import fields, models


class HelpdeskTag(models.Model):
    _name = 'seisei.helpdesk.tag'
    _description = 'Helpdesk Tag'
    _order = 'name'

    name = fields.Char(required=True, translate=True)
    color = fields.Integer(string='Color Index')

    _sql_constraints = [
        ('name_uniq', 'unique (name)', 'Tag name already exists!'),
    ]


class HelpdeskTagAssignment(models.Model):
    _name = 'seisei.helpdesk.tag.assignment'
    _description = 'Tag-based Agent Assignment'
    _rec_name = 'tag_id'

    team_id = fields.Many2one(
        'seisei.helpdesk.team', required=True, ondelete='cascade',
    )
    tag_id = fields.Many2one(
        'seisei.helpdesk.tag', required=True, ondelete='cascade',
    )
    user_ids = fields.Many2many(
        'res.users',
        'seisei_helpdesk_tag_assign_user_rel',
        'assignment_id', 'user_id',
        string='Agents',
    )

    _sql_constraints = [
        ('team_tag_uniq', 'unique (team_id, tag_id)',
         'Only one assignment rule per tag per team!'),
    ]
