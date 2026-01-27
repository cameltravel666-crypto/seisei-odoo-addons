# -*- coding: utf-8 -*-
from odoo import api, fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    netting_available = fields.Boolean(
        compute='_compute_netting_available',
        string='Netting Available',
        help='True if partner has both open receivables and payables',
    )
    open_receivable_amount = fields.Monetary(
        compute='_compute_netting_amounts',
        string='Open Receivables',
        currency_field='currency_id',
    )
    open_payable_amount = fields.Monetary(
        compute='_compute_netting_amounts',
        string='Open Payables',
        currency_field='currency_id',
    )
    nettable_amount = fields.Monetary(
        compute='_compute_netting_amounts',
        string='Nettable Amount',
        currency_field='currency_id',
        help='Maximum amount that can be netted (minimum of AR and AP)',
    )

    @api.depends('credit', 'debit')
    def _compute_netting_available(self):
        """Check if partner has both receivables and payables to net."""
        for partner in self:
            # Get open move lines for this partner
            domain = [
                ('partner_id', '=', partner.id),
                ('parent_state', '=', 'posted'),
                ('reconciled', '=', False),
                ('account_id.account_type', 'in', ['asset_receivable', 'liability_payable']),
            ]
            move_lines = self.env['account.move.line'].search(domain)

            has_receivable = any(ml.account_id.account_type == 'asset_receivable' for ml in move_lines)
            has_payable = any(ml.account_id.account_type == 'liability_payable' for ml in move_lines)

            partner.netting_available = has_receivable and has_payable

    @api.depends('credit', 'debit')
    def _compute_netting_amounts(self):
        """Compute open receivable and payable amounts."""
        for partner in self:
            domain = [
                ('partner_id', '=', partner.id),
                ('parent_state', '=', 'posted'),
                ('reconciled', '=', False),
                ('account_id.account_type', 'in', ['asset_receivable', 'liability_payable']),
            ]
            move_lines = self.env['account.move.line'].search(domain)

            receivable = 0.0
            payable = 0.0

            for ml in move_lines:
                if ml.account_id.account_type == 'asset_receivable':
                    receivable += ml.amount_residual
                else:
                    payable += abs(ml.amount_residual)

            partner.open_receivable_amount = receivable
            partner.open_payable_amount = payable
            partner.nettable_amount = min(receivable, payable)

    def action_open_netting_wizard(self):
        """Open the AR/AP netting wizard for this partner."""
        self.ensure_one()
        return {
            'name': 'AR/AP Netting',
            'type': 'ir.actions.act_window',
            'res_model': 'ar.ap.netting.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_partner_id': self.id,
                'default_company_id': self.env.company.id,
            },
        }
