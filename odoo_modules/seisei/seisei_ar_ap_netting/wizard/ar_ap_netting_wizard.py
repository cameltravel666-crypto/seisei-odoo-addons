# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


class ArApNettingWizard(models.TransientModel):
    _name = 'ar.ap.netting.wizard'
    _description = 'AR/AP Netting Wizard'

    partner_id = fields.Many2one(
        'res.partner',
        string='Partner',
        required=True,
        domain="[('netting_available', '=', True)]",
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        required=True,
        default=lambda self: self.env.company,
    )
    currency_id = fields.Many2one(
        'res.currency',
        string='Currency',
        related='company_id.currency_id',
        readonly=True,
    )
    journal_id = fields.Many2one(
        'account.journal',
        string='Netting Journal',
        required=True,
        domain="[('type', '=', 'general'), ('company_id', '=', company_id)]",
        help='Journal to use for the netting entry (typically Miscellaneous)',
    )
    date = fields.Date(
        string='Netting Date',
        required=True,
        default=fields.Date.context_today,
    )

    # Computed amounts
    total_receivable = fields.Monetary(
        compute='_compute_amounts',
        string='Total Open Receivables',
        currency_field='currency_id',
    )
    total_payable = fields.Monetary(
        compute='_compute_amounts',
        string='Total Open Payables',
        currency_field='currency_id',
    )
    max_netting_amount = fields.Monetary(
        compute='_compute_amounts',
        string='Maximum Nettable',
        currency_field='currency_id',
    )
    netting_amount = fields.Monetary(
        string='Amount to Net',
        currency_field='currency_id',
        help='Amount to net (cannot exceed the minimum of AR and AP)',
    )

    # Preview lines
    receivable_line_ids = fields.Many2many(
        'account.move.line',
        'netting_wizard_receivable_rel',
        'wizard_id',
        'line_id',
        string='Receivable Lines',
        compute='_compute_lines',
    )
    payable_line_ids = fields.Many2many(
        'account.move.line',
        'netting_wizard_payable_rel',
        'wizard_id',
        'line_id',
        string='Payable Lines',
        compute='_compute_lines',
    )

    # Info
    memo = fields.Char(
        string='Memo',
        compute='_compute_memo',
        store=True,
        readonly=False,
    )
    has_multi_currency = fields.Boolean(
        compute='_compute_has_multi_currency',
        string='Has Multiple Currencies',
    )

    @api.depends('partner_id', 'company_id')
    def _compute_lines(self):
        """Get open receivable and payable lines for the partner."""
        for wizard in self:
            if not wizard.partner_id:
                wizard.receivable_line_ids = False
                wizard.payable_line_ids = False
                continue

            domain = [
                ('partner_id', '=', wizard.partner_id.id),
                ('company_id', '=', wizard.company_id.id),
                ('parent_state', '=', 'posted'),
                ('reconciled', '=', False),
            ]

            receivable_domain = domain + [('account_id.account_type', '=', 'asset_receivable')]
            payable_domain = domain + [('account_id.account_type', '=', 'liability_payable')]

            wizard.receivable_line_ids = self.env['account.move.line'].search(receivable_domain)
            wizard.payable_line_ids = self.env['account.move.line'].search(payable_domain)

    @api.depends('receivable_line_ids', 'payable_line_ids')
    def _compute_amounts(self):
        """Compute total receivable and payable amounts."""
        for wizard in self:
            wizard.total_receivable = sum(wizard.receivable_line_ids.mapped('amount_residual'))
            wizard.total_payable = abs(sum(wizard.payable_line_ids.mapped('amount_residual')))
            wizard.max_netting_amount = min(wizard.total_receivable, wizard.total_payable)

            # Set default netting amount
            if not wizard.netting_amount:
                wizard.netting_amount = wizard.max_netting_amount

    @api.depends('partner_id', 'date')
    def _compute_memo(self):
        """Generate default memo."""
        for wizard in self:
            if wizard.partner_id:
                wizard.memo = _('AR/AP Netting for %s on %s') % (
                    wizard.partner_id.name,
                    wizard.date or fields.Date.today(),
                )
            else:
                wizard.memo = ''

    @api.depends('receivable_line_ids', 'payable_line_ids')
    def _compute_has_multi_currency(self):
        """Check if there are multiple currencies in the lines."""
        for wizard in self:
            currencies = set()
            for line in wizard.receivable_line_ids | wizard.payable_line_ids:
                currencies.add(line.currency_id.id or line.company_currency_id.id)
            wizard.has_multi_currency = len(currencies) > 1

    @api.constrains('netting_amount', 'max_netting_amount')
    def _check_netting_amount(self):
        """Validate netting amount."""
        for wizard in self:
            if wizard.netting_amount <= 0:
                raise ValidationError(_('Netting amount must be positive.'))
            if wizard.netting_amount > wizard.max_netting_amount:
                raise ValidationError(
                    _('Netting amount (%(amount)s) cannot exceed the maximum nettable amount (%(max)s).')
                    % {'amount': wizard.netting_amount, 'max': wizard.max_netting_amount}
                )

    def action_preview(self):
        """Refresh the wizard to show latest data."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'ar.ap.netting.wizard',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }

    def action_execute_netting(self):
        """Execute the netting operation."""
        self.ensure_one()

        if self.has_multi_currency:
            raise UserError(
                _('Cannot net receivables and payables in different currencies. '
                  'Please ensure all items are in the same currency.')
            )

        if not self.journal_id:
            raise UserError(_('Please select a netting journal.'))

        if self.netting_amount <= 0:
            raise UserError(_('Netting amount must be positive.'))

        if self.netting_amount > self.max_netting_amount:
            raise UserError(_('Netting amount exceeds the maximum nettable amount.'))

        # Create netting journal entry
        move_vals = self._prepare_netting_move()
        netting_move = self.env['account.move'].create(move_vals)

        # Post the journal entry
        netting_move.action_post()

        # Reconcile the lines
        self._reconcile_lines(netting_move)

        # Return action to view the created entry
        return {
            'name': _('Netting Entry'),
            'type': 'ir.actions.act_window',
            'res_model': 'account.move',
            'res_id': netting_move.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def _prepare_netting_move(self):
        """Prepare the netting journal entry values."""
        self.ensure_one()

        # Get accounts
        receivable_account = self.partner_id.property_account_receivable_id
        payable_account = self.partner_id.property_account_payable_id

        if not receivable_account or not payable_account:
            raise UserError(
                _('Partner must have both receivable and payable accounts configured.')
            )

        # Build invoice references for memo
        receivable_refs = ', '.join(
            self.receivable_line_ids.mapped('move_id.name')[:5]
        )
        payable_refs = ', '.join(
            self.payable_line_ids.mapped('move_id.name')[:5]
        )

        memo = self.memo or _('AR/AP Netting')
        if receivable_refs:
            memo += _(' | AR: %s') % receivable_refs
        if payable_refs:
            memo += _(' | AP: %s') % payable_refs

        move_vals = {
            'journal_id': self.journal_id.id,
            'date': self.date,
            'ref': memo[:200],  # Truncate if too long
            'move_type': 'entry',
            'line_ids': [
                # Debit payable (reduce liability)
                (0, 0, {
                    'name': _('Netting - Reduce Payable'),
                    'partner_id': self.partner_id.id,
                    'account_id': payable_account.id,
                    'debit': self.netting_amount,
                    'credit': 0,
                }),
                # Credit receivable (reduce asset)
                (0, 0, {
                    'name': _('Netting - Reduce Receivable'),
                    'partner_id': self.partner_id.id,
                    'account_id': receivable_account.id,
                    'debit': 0,
                    'credit': self.netting_amount,
                }),
            ],
        }

        return move_vals

    def _reconcile_lines(self, netting_move):
        """Reconcile the original lines with the netting entry."""
        self.ensure_one()

        # Get the netting move lines
        netting_receivable_line = netting_move.line_ids.filtered(
            lambda l: l.account_id.account_type == 'asset_receivable'
        )
        netting_payable_line = netting_move.line_ids.filtered(
            lambda l: l.account_id.account_type == 'liability_payable'
        )

        # Reconcile receivables
        remaining_to_reconcile = self.netting_amount
        receivable_lines_to_reconcile = netting_receivable_line

        for line in self.receivable_line_ids.sorted(key=lambda l: l.date_maturity or l.date):
            if remaining_to_reconcile <= 0:
                break
            if line.amount_residual > 0:
                receivable_lines_to_reconcile |= line
                remaining_to_reconcile -= line.amount_residual

        if receivable_lines_to_reconcile:
            receivable_lines_to_reconcile.reconcile()

        # Reconcile payables
        remaining_to_reconcile = self.netting_amount
        payable_lines_to_reconcile = netting_payable_line

        for line in self.payable_line_ids.sorted(key=lambda l: l.date_maturity or l.date):
            if remaining_to_reconcile <= 0:
                break
            if line.amount_residual < 0:
                payable_lines_to_reconcile |= line
                remaining_to_reconcile -= abs(line.amount_residual)

        if payable_lines_to_reconcile:
            payable_lines_to_reconcile.reconcile()
