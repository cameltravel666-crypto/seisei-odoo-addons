import logging

from odoo import models, fields, api, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class BatchCreditAccountWizard(models.TransientModel):
    _name = 'ocr.batch.credit.account'
    _description = 'Batch Change Credit Account'

    credit_account_id = fields.Many2one(
        'ocr.account', 'New Credit Account', required=True,
        domain=[('account_type', '=', 'credit'), ('active', '=', True)],
    )
    scope = fields.Selection([
        ('selected', 'Selected Documents'),
        ('client', 'All Documents of Client'),
    ], string='Scope', default='selected', required=True)
    client_id = fields.Many2one(
        'ocr.client', 'Client',
        help='Apply to all documents of this client',
    )
    document_ids = fields.Many2many(
        'ocr.document', string='Documents',
    )
    preview_count = fields.Integer('Lines to Update', compute='_compute_preview')

    @api.depends('scope', 'client_id', 'document_ids')
    def _compute_preview(self):
        for rec in self:
            lines = rec._get_target_lines()
            rec.preview_count = len(lines)

    def _get_target_lines(self):
        if self.scope == 'client' and self.client_id:
            docs = self.env['ocr.document'].search([
                ('client_id', '=', self.client_id.id),
                ('state', 'in', ('done', 'reviewed')),
            ])
        else:
            docs = self.document_ids
        return docs.mapped('line_ids')

    def action_apply(self):
        self.ensure_one()
        lines = self._get_target_lines()
        if not lines:
            raise UserError(_('No lines to update.'))

        lines.with_context(
            _skip_realtime_learn=True,
        ).write({'credit_account': self.credit_account_id.id})

        _logger.info(
            'Batch credit account: set %d lines to %s',
            len(lines), self.credit_account_id.name,
        )
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': f'{len(lines)} lines updated to {self.credit_account_id.name}',
                'type': 'success',
                'sticky': False,
            },
        }
