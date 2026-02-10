import ast
from collections import defaultdict

from odoo import api, fields, models, _
from odoo.tools import float_is_zero
from odoo.tools.misc import format_date, formatLang


class AccountGeneralLedgerHandler(models.AbstractModel):
    _name = 'account.general.ledger.handler'
    _inherit = 'account.report.custom.handler'
    _description = 'General Ledger Custom Handler'

    def _get_custom_display_config(self):
        return {
            'unfold_all': False,
        }

    def _custom_options_initializer(self, report, options, previous_options=None):
        """Add GL-specific options."""
        # Ensure journals filter is active
        if 'journals' not in options:
            report._init_options_journals(options, previous_options or {})

    def _custom_line_postprocessor(self, report, options, lines):
        """Override: GL report generates its own lines from scratch."""
        return self._get_gl_lines(report, options)

    def _get_gl_lines(self, report, options):
        """Generate GL lines: one section per account, with detail lines."""
        domain = report._get_options_domain(options, date_scope='strict_range')

        # Get all accounts with transactions in the period
        accounts = self._get_accounts_with_moves(report, options, domain)

        lines = []
        for account in accounts:
            account_lines = self._get_account_lines(
                report, options, account, domain
            )
            lines.extend(account_lines)

        return lines

    def _get_accounts_with_moves(self, report, options, domain):
        """Get accounts that have move lines in the period."""
        AccountMoveLine = self.env['account.move.line']

        groups = AccountMoveLine.read_group(
            domain,
            ['balance', 'debit', 'credit'],
            ['account_id'],
            orderby='account_id',
        )

        account_ids = []
        for group in groups:
            if group['account_id']:
                account_ids.append(group['account_id'][0])

        if not account_ids:
            return self.env['account.account']

        return self.env['account.account'].browse(account_ids).sorted(
            key=lambda a: a.code
        )

    def _get_account_lines(self, report, options, account, base_domain):
        """Generate lines for a single account: header + detail lines."""
        lines = []

        # Account header line
        account_line_id = report._get_generic_line_id(
            'account.account', account.id
        )

        # Compute account totals
        account_domain = base_domain + [('account_id', '=', account.id)]
        totals = self.env['account.move.line'].read_group(
            account_domain,
            ['debit', 'credit', 'balance'],
            [],
        )

        total_debit = totals[0]['debit'] if totals else 0.0
        total_credit = totals[0]['credit'] if totals else 0.0
        total_balance = totals[0]['balance'] if totals else 0.0

        # Compute initial balance (before period)
        initial_balance = self._get_initial_balance(report, options, account)

        # Skip if all zero and hide_0_lines
        if (options.get('hide_0_lines')
            and float_is_zero(total_balance + initial_balance, precision_digits=2)
            and float_is_zero(total_debit, precision_digits=2)):
            return []

        currency = self.env.company.currency_id

        # Account header
        columns = self._build_account_header_columns(
            report, options, total_debit, total_credit,
            total_balance + initial_balance, currency
        )

        is_unfolded = (
            options.get('unfold_all')
            or account_line_id in options.get('unfolded_lines', [])
        )

        header_line = {
            'id': account_line_id,
            'name': f"{account.code} {account.name}",
            'level': 0,
            'columns': columns,
            'unfoldable': True,
            'unfolded': is_unfolded,
            'parent_id': None,
        }
        lines.append(header_line)

        # Detail lines if unfolded
        if is_unfolded:
            # Initial balance line
            if not float_is_zero(initial_balance, precision_digits=2):
                init_columns = self._build_detail_columns(
                    report, options, '', '', '', 0.0, 0.0, initial_balance, currency
                )
                lines.append({
                    'id': report._get_generic_line_id(
                        None, None, markup='initial_balance',
                        parent_line_id=account_line_id,
                    ),
                    'name': _("Initial Balance"),
                    'level': 1,
                    'columns': init_columns,
                    'unfoldable': False,
                    'unfolded': False,
                    'parent_id': account_line_id,
                })

            # Move lines
            move_lines = self.env['account.move.line'].search(
                account_domain,
                order='date, id',
                limit=report.load_more_limit,
            )

            cumulative_balance = initial_balance
            for aml in move_lines:
                cumulative_balance += aml.balance
                detail_columns = self._build_detail_columns(
                    report, options,
                    format_date(self.env, aml.date),
                    aml.name or aml.move_id.name or '',
                    aml.partner_id.display_name if aml.partner_id else '',
                    aml.debit,
                    aml.credit,
                    cumulative_balance,
                    currency,
                )

                lines.append({
                    'id': report._get_generic_line_id(
                        'account.move.line', aml.id,
                        parent_line_id=account_line_id,
                    ),
                    'name': aml.move_id.name or '',
                    'level': 2,
                    'columns': detail_columns,
                    'unfoldable': False,
                    'unfolded': False,
                    'parent_id': account_line_id,
                    'caret_options': 'account.move.line',
                })

            # Load more if needed
            total_count = self.env['account.move.line'].search_count(account_domain)
            if total_count > report.load_more_limit:
                lines.append({
                    'id': report._get_generic_line_id(
                        None, None, markup='loadMore',
                        parent_line_id=account_line_id,
                    ),
                    'name': _("Load More... (%s remaining)", total_count - report.load_more_limit),
                    'level': 2,
                    'columns': [{'name': ''} for _ in range(6)],
                    'unfoldable': False,
                    'unfolded': False,
                    'parent_id': account_line_id,
                    'load_more': True,
                    'offset': report.load_more_limit,
                    'progress': report.load_more_limit,
                })

        return lines

    def _get_initial_balance(self, report, options, account):
        """Compute balance before the report period start."""
        date_from = options.get('date', {}).get('date_from')
        if not date_from:
            return 0.0

        domain = [
            ('account_id', '=', account.id),
            ('date', '<', date_from),
        ]

        # Company filter
        company_ids = [c['id'] for c in options.get('companies', [])]
        if company_ids:
            domain.append(('company_id', 'in', company_ids))

        # Posted entries filter
        if not options.get('all_entries'):
            domain.append(('move_id.state', '=', 'posted'))

        result = self.env['account.move.line'].read_group(
            domain, ['balance'], []
        )
        return result[0]['balance'] if result else 0.0

    def _build_account_header_columns(self, report, options, debit, credit,
                                       balance, currency):
        """Build columns for account header line.

        GL columns: Date | Communication | Partner | Debit | Credit | Balance
        """
        return [
            {'name': '', 'figure_type': 'date'},  # Date
            {'name': '', 'figure_type': 'string'},  # Communication
            {'name': '', 'figure_type': 'string'},  # Partner
            {  # Debit
                'name': formatLang(self.env, debit, currency_obj=currency),
                'no_format': debit,
                'figure_type': 'monetary',
                'is_zero': float_is_zero(debit, precision_digits=2),
            },
            {  # Credit
                'name': formatLang(self.env, credit, currency_obj=currency),
                'no_format': credit,
                'figure_type': 'monetary',
                'is_zero': float_is_zero(credit, precision_digits=2),
            },
            {  # Balance
                'name': formatLang(self.env, balance, currency_obj=currency),
                'no_format': balance,
                'figure_type': 'monetary',
                'is_zero': float_is_zero(balance, precision_digits=2),
            },
        ]

    def _build_detail_columns(self, report, options, date_str, communication,
                               partner, debit, credit, balance, currency):
        """Build columns for a detail move line."""
        return [
            {'name': date_str, 'figure_type': 'date'},
            {'name': communication, 'figure_type': 'string'},
            {'name': partner, 'figure_type': 'string'},
            {
                'name': formatLang(self.env, debit, currency_obj=currency) if not float_is_zero(debit, precision_digits=2) else '',
                'no_format': debit,
                'figure_type': 'monetary',
                'is_zero': float_is_zero(debit, precision_digits=2),
            },
            {
                'name': formatLang(self.env, credit, currency_obj=currency) if not float_is_zero(credit, precision_digits=2) else '',
                'no_format': credit,
                'figure_type': 'monetary',
                'is_zero': float_is_zero(credit, precision_digits=2),
            },
            {
                'name': formatLang(self.env, balance, currency_obj=currency),
                'no_format': balance,
                'figure_type': 'monetary',
                'is_zero': float_is_zero(balance, precision_digits=2),
            },
        ]

    def _get_custom_lines(self, report, options, line_id, offset=0, limit=80):
        """Handle expand for GL report lines (load more move lines)."""
        model, record_id = report._get_model_info_from_id(line_id)

        if model == 'account.account' and record_id:
            account = self.env['account.account'].browse(record_id)
            if not account.exists():
                return []

            domain = report._get_options_domain(options, date_scope='strict_range')
            account_domain = domain + [('account_id', '=', account.id)]
            currency = self.env.company.currency_id

            move_lines = self.env['account.move.line'].search(
                account_domain,
                order='date, id',
                offset=offset,
                limit=limit + 1,
            )

            has_more = len(move_lines) > limit
            if has_more:
                move_lines = move_lines[:limit]

            # Compute cumulative balance
            initial_balance = self._get_initial_balance(report, options, account)

            # Get balance up to offset
            if offset > 0:
                preceding_lines = self.env['account.move.line'].search(
                    account_domain,
                    order='date, id',
                    limit=offset,
                )
                for pl in preceding_lines:
                    initial_balance += pl.balance

            lines = []
            cumulative_balance = initial_balance
            for aml in move_lines:
                cumulative_balance += aml.balance
                detail_columns = self._build_detail_columns(
                    report, options,
                    format_date(self.env, aml.date),
                    aml.name or aml.move_id.name or '',
                    aml.partner_id.display_name if aml.partner_id else '',
                    aml.debit,
                    aml.credit,
                    cumulative_balance,
                    currency,
                )
                lines.append({
                    'id': report._get_generic_line_id(
                        'account.move.line', aml.id,
                        parent_line_id=line_id,
                    ),
                    'name': aml.move_id.name or '',
                    'level': 2,
                    'columns': detail_columns,
                    'unfoldable': False,
                    'unfolded': False,
                    'parent_id': line_id,
                })

            # Load more
            if has_more:
                total_count = self.env['account.move.line'].search_count(account_domain)
                remaining = total_count - offset - limit
                lines.append({
                    'id': report._get_generic_line_id(
                        None, None, markup='loadMore',
                        parent_line_id=line_id,
                    ),
                    'name': _("Load More... (%s remaining)", remaining),
                    'level': 2,
                    'columns': [{'name': ''} for _ in range(6)],
                    'unfoldable': False,
                    'unfolded': False,
                    'parent_id': line_id,
                    'load_more': True,
                    'offset': offset + limit,
                    'progress': offset + limit,
                })

            return lines

        return []

    def _compute_custom_expressions(self, report, expressions, options):
        """GL doesn't use expressions in the traditional way."""
        return {expr.id: 0.0 for expr in expressions}
