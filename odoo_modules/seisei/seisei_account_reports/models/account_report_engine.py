import ast
import copy
import datetime
import json
import re
from collections import defaultdict, OrderedDict
from itertools import groupby

from odoo import api, fields, models, _
from odoo.exceptions import UserError
from odoo.tools import date_utils, float_is_zero, SQL
from odoo.tools.misc import format_date, formatLang


LINE_ID_HIERARCHY_DELIMITER = '|'
NUMBER_FIGURE_TYPES = ('float', 'integer', 'monetary', 'percentage')


class AccountReportEngine(models.Model):
    _inherit = 'account.report'

    # ==========================================================================
    # LINE ID MANAGEMENT
    # ==========================================================================

    @api.model
    def _get_generic_line_id(self, model_name, value, markup=None, parent_line_id=None):
        """Build a generic line ID string for report lines.

        Format: markup~model~id|markup~model~id|...
        """
        parts = []
        if parent_line_id:
            parts.append(parent_line_id)

        markup_str = ''
        if markup:
            if isinstance(markup, dict):
                markup_str = json.dumps(markup, separators=(',', ': '))
            else:
                markup_str = str(markup)

        model_str = model_name or ''
        value_str = str(value) if value is not None else ''

        parts.append(f"{markup_str}~{model_str}~{value_str}")
        return LINE_ID_HIERARCHY_DELIMITER.join(parts)

    @api.model
    def _get_model_info_from_id(self, line_id):
        """Extract (model_name, record_id) from a generic line ID.

        Returns the last segment's model and id.
        """
        if not line_id:
            return None, None
        segments = line_id.split(LINE_ID_HIERARCHY_DELIMITER)
        last = segments[-1]
        parts = last.split('~')
        if len(parts) >= 3:
            model = parts[1] or None
            try:
                record_id = int(parts[2]) if parts[2] else None
            except (ValueError, TypeError):
                record_id = None
            return model, record_id
        return None, None

    @api.model
    def _parse_line_id(self, line_id):
        """Parse a composite line ID into list of (markup, model, value) tuples."""
        if not line_id:
            return []
        result = []
        for segment in line_id.split(LINE_ID_HIERARCHY_DELIMITER):
            parts = segment.split('~')
            if len(parts) >= 3:
                markup = parts[0] or None
                if markup:
                    try:
                        parsed = json.loads(markup)
                        if isinstance(parsed, dict):
                            markup = parsed
                    except (json.JSONDecodeError, TypeError):
                        pass
                model = parts[1] or None
                try:
                    value = int(parts[2]) if parts[2] and model else (parts[2] or None)
                except (ValueError, TypeError):
                    value = parts[2] or None
                result.append((markup, model, value))
            else:
                result.append((None, None, None))
        return result

    # ==========================================================================
    # OPTIONS
    # ==========================================================================

    def get_options(self, previous_options=None):
        """Build the options dict for this report.

        This is a simplified version that handles:
        - date (range or single)
        - journals filter
        - draft/posted filter
        - column headers
        - company info
        """
        self.ensure_one()
        options = {}
        previous_options = previous_options or {}

        self._init_options_date(options, previous_options)
        self._init_options_comparison(options, previous_options)
        self._init_options_all_entries(options, previous_options)
        self._init_options_journals(options, previous_options)
        self._init_options_hide_0_lines(options, previous_options)
        self._init_options_unfold(options, previous_options)
        self._init_options_column_headers(options)
        self._init_options_companies(options)
        self._init_options_report_info(options)
        self._init_options_buttons(options)

        # Let custom handler customize options
        custom_handler_model = self._get_custom_handler_model()
        if custom_handler_model:
            self.env[custom_handler_model]._custom_options_initializer(
                self, options, previous_options
            )

        return options

    def _init_options_date(self, options, previous_options):
        """Initialize date options."""
        previous_date = previous_options.get('date', {})

        if previous_date.get('date_from') and previous_date.get('date_to'):
            date_from = fields.Date.from_string(previous_date['date_from'])
            date_to = fields.Date.from_string(previous_date['date_to'])
        else:
            # Default based on default_opening_date_filter
            today = fields.Date.today()
            filter_type = self.default_opening_date_filter or 'this_year'

            if filter_type == 'this_month':
                date_from, date_to = date_utils.get_month(today)
            elif filter_type == 'this_quarter':
                date_from, date_to = date_utils.get_quarter(today)
            elif filter_type == 'this_year':
                date_from, date_to = date_utils.get_fiscal_year(today)
                # Use company fiscal year if available
                try:
                    fy_dates = self.env.company.compute_fiscalyear_dates(today)
                    date_from = fy_dates['date_from']
                    date_to = fy_dates['date_to']
                except Exception:
                    pass
            elif filter_type == 'today':
                date_from = today
                date_to = today
            elif filter_type == 'last_month':
                date_from, date_to = date_utils.get_month(
                    today - datetime.timedelta(days=today.day)
                )
            elif filter_type == 'last_quarter':
                date_from, date_to = date_utils.get_quarter(
                    today - datetime.timedelta(days=90)
                )
            elif filter_type == 'last_year':
                date_from, date_to = date_utils.get_fiscal_year(
                    today.replace(year=today.year - 1)
                )
            else:
                date_from, date_to = date_utils.get_fiscal_year(today)

        mode = 'range' if self.filter_date_range else 'single'

        if mode == 'single':
            date_from_str = False
        else:
            date_from_str = fields.Date.to_string(date_from)

        date_to_str = fields.Date.to_string(date_to)

        # Build date string for display
        if mode == 'single':
            string = _('As of %s', format_date(self.env, date_to_str))
        else:
            string = _('From %(date_from)s to %(date_to)s',
                       date_from=format_date(self.env, date_from_str),
                       date_to=format_date(self.env, date_to_str))

        options['date'] = {
            'string': string,
            'mode': mode,
            'date_from': date_from_str,
            'date_to': date_to_str,
        }

    def _init_options_comparison(self, options, previous_options):
        """Initialize comparison options and build column_groups."""
        prev_comparison = previous_options.get('comparison', {})

        # GL reports (custom handler) skip comparison
        custom_handler = self._get_custom_handler_model()
        if custom_handler:
            options['comparison'] = {
                'filter': 'no_comparison',
                'number_period': 1,
                'period_order': 'ascending',
            }
            options['column_groups'] = OrderedDict({
                'default': {'date': options['date']},
            })
            return

        comparison_filter = prev_comparison.get('filter', 'no_comparison')
        number_period = prev_comparison.get('number_period', 1)
        period_order = prev_comparison.get('period_order', 'ascending')

        options['comparison'] = {
            'filter': comparison_filter,
            'number_period': max(1, min(int(number_period), 12)),
            'period_order': period_order,
        }

        # Build column_groups based on filter
        if comparison_filter == 'no_comparison':
            options['column_groups'] = OrderedDict({
                'default': {'date': options['date']},
            })
        elif comparison_filter == 'monthly':
            options['column_groups'] = self._get_monthly_periods(options)
        elif comparison_filter == 'quarterly':
            options['column_groups'] = self._get_quarterly_periods(options)
        elif comparison_filter == 'semi_annual':
            options['column_groups'] = self._get_semi_annual_periods(options)
        elif comparison_filter == 'previous_period':
            options['column_groups'] = self._get_previous_periods(options)
        elif comparison_filter == 'same_last_year':
            options['column_groups'] = self._get_same_period_last_year(options)
        else:
            options['column_groups'] = OrderedDict({
                'default': {'date': options['date']},
            })

    def _get_monthly_periods(self, options):
        """Generate Jan-Dec periods for the year of the current date range."""
        date_to = fields.Date.from_string(options['date']['date_to'])
        year = date_to.year
        groups = OrderedDict()
        for m in range(1, 13):
            d_from = datetime.date(year, m, 1)
            if m == 12:
                d_to = datetime.date(year, 12, 31)
            else:
                d_to = datetime.date(year, m + 1, 1) - datetime.timedelta(days=1)
            key = f'M{m:02d}_{year}'
            groups[key] = {
                'date': {
                    'date_from': fields.Date.to_string(d_from),
                    'date_to': fields.Date.to_string(d_to),
                    'string': f'{d_from:%b} {year}',
                    'mode': 'range',
                },
            }
        return groups

    def _get_quarterly_periods(self, options):
        """Generate Q1-Q4 periods for the year of the current date range."""
        date_to = fields.Date.from_string(options['date']['date_to'])
        year = date_to.year
        groups = OrderedDict()
        for q in range(1, 5):
            month_start = (q - 1) * 3 + 1
            month_end = q * 3
            d_from = datetime.date(year, month_start, 1)
            # Last day of quarter
            if month_end == 12:
                d_to = datetime.date(year, 12, 31)
            else:
                d_to = datetime.date(year, month_end + 1, 1) - datetime.timedelta(days=1)
            key = f'Q{q}_{year}'
            groups[key] = {
                'date': {
                    'date_from': fields.Date.to_string(d_from),
                    'date_to': fields.Date.to_string(d_to),
                    'string': f'Q{q} {year}',
                    'mode': 'range',
                },
            }
        return groups

    def _get_semi_annual_periods(self, options):
        """Generate H1/H2 periods for the year of the current date range."""
        date_to = fields.Date.from_string(options['date']['date_to'])
        year = date_to.year
        groups = OrderedDict()
        groups[f'H1_{year}'] = {
            'date': {
                'date_from': fields.Date.to_string(datetime.date(year, 1, 1)),
                'date_to': fields.Date.to_string(datetime.date(year, 6, 30)),
                'string': f'H1 {year}',
                'mode': 'range',
            },
        }
        groups[f'H2_{year}'] = {
            'date': {
                'date_from': fields.Date.to_string(datetime.date(year, 7, 1)),
                'date_to': fields.Date.to_string(datetime.date(year, 12, 31)),
                'string': f'H2 {year}',
                'mode': 'range',
            },
        }
        return groups

    def _get_previous_periods(self, options):
        """Generate current period + N previous periods.

        Uses date_utils to shift periods backward by a consistent delta,
        handling month boundaries correctly.
        """
        date_from = fields.Date.from_string(
            options['date'].get('date_from') or options['date']['date_to']
        )
        date_to = fields.Date.from_string(options['date']['date_to'])
        number_period = options['comparison']['number_period']

        # Compute period length as timedelta
        period_delta = date_to - date_from  # e.g. 89 days for a quarter

        periods = []
        # Current period
        periods.append((date_from, date_to))

        # Previous periods: each ends the day before the previous one starts
        cur_from = date_from
        for i in range(number_period):
            prev_to = cur_from - datetime.timedelta(days=1)
            prev_from = prev_to - period_delta
            periods.append((prev_from, prev_to))
            cur_from = prev_from

        # Reverse for ascending order
        if options['comparison'].get('period_order', 'ascending') == 'ascending':
            periods.reverse()

        groups = OrderedDict()
        for d_from, d_to in periods:
            d_from_str = fields.Date.to_string(d_from)
            d_to_str = fields.Date.to_string(d_to)
            string = _('%(date_from)s - %(date_to)s',
                       date_from=format_date(self.env, d_from_str),
                       date_to=format_date(self.env, d_to_str))
            key = f'{d_from_str}_{d_to_str}'
            groups[key] = {
                'date': {
                    'date_from': d_from_str,
                    'date_to': d_to_str,
                    'string': string,
                    'mode': 'range',
                },
            }
        return groups

    def _get_same_period_last_year(self, options):
        """Generate current period + same period last year."""
        date_from = fields.Date.from_string(
            options['date'].get('date_from') or options['date']['date_to']
        )
        date_to = fields.Date.from_string(options['date']['date_to'])

        # Last year (handle leap year edge case: Feb 29 → Feb 28)
        try:
            ly_from = date_from.replace(year=date_from.year - 1)
        except ValueError:
            ly_from = date_from.replace(year=date_from.year - 1, day=28)
        try:
            ly_to = date_to.replace(year=date_to.year - 1)
        except ValueError:
            ly_to = date_to.replace(year=date_to.year - 1, day=28)

        groups = OrderedDict()

        # Last year first (ascending)
        ly_from_str = fields.Date.to_string(ly_from)
        ly_to_str = fields.Date.to_string(ly_to)
        ly_string = _('%(date_from)s - %(date_to)s',
                      date_from=format_date(self.env, ly_from_str),
                      date_to=format_date(self.env, ly_to_str))
        groups[f'{ly_from_str}_{ly_to_str}'] = {
            'date': {
                'date_from': ly_from_str,
                'date_to': ly_to_str,
                'string': ly_string,
                'mode': options['date']['mode'],
            },
        }

        # Current period
        cur_from_str = options['date'].get('date_from') or False
        cur_to_str = options['date']['date_to']
        groups[f'{cur_from_str}_{cur_to_str}'] = {
            'date': options['date'],
        }

        return groups

    def _init_options_all_entries(self, options, previous_options):
        """Initialize the draft/posted filter."""
        if self.filter_show_draft:
            options['all_entries'] = previous_options.get('all_entries', False)
        else:
            options['all_entries'] = False

    def _init_options_journals(self, options, previous_options):
        """Initialize journals filter."""
        if not self.filter_journals:
            return

        previous_journals = previous_options.get('journals', [])
        company_ids = self.env.company.ids

        journals = self.env['account.journal'].search([
            ('company_id', 'in', company_ids),
        ], order='company_id, name')

        options['journals'] = []
        for journal in journals:
            selected = False
            for prev in previous_journals:
                if prev.get('id') == journal.id and prev.get('model') == 'account.journal':
                    selected = prev.get('selected', False)
                    break
            options['journals'].append({
                'id': journal.id,
                'model': 'account.journal',
                'name': journal.display_name,
                'title': f"{journal.name} - {journal.code}",
                'type': journal.type,
                'selected': selected,
            })

        # Compute display name
        selected_journals = [j for j in options['journals'] if j.get('selected')]
        if not selected_journals or len(selected_journals) == len(options['journals']):
            options['name_journal_group'] = _("All Journals")
        else:
            names = [j['name'] for j in selected_journals[:5]]
            options['name_journal_group'] = ', '.join(names)

    def _init_options_hide_0_lines(self, options, previous_options):
        """Initialize hide zero lines option."""
        # filter_hide_0_lines is a Selection field: 'by_default', 'optional', 'never'
        hide_by_default = self.filter_hide_0_lines == 'by_default'
        options['hide_0_lines'] = previous_options.get(
            'hide_0_lines', hide_by_default
        )

    def _init_options_unfold(self, options, previous_options):
        """Initialize unfold options."""
        options['unfold_all'] = previous_options.get(
            'unfold_all', self.filter_unfold_all
        )
        options['unfolded_lines'] = previous_options.get('unfolded_lines', [])

    def _init_options_column_headers(self, options):
        """Build column headers from report columns.

        For multi-period comparison, generates:
        - column_headers: [[period row], [label row]] (two rows for multi-period)
        - columns: flat list of column dicts with column_group_key
        """
        report_columns = []
        for col in self.column_ids:
            report_columns.append({
                'name': col.name,
                'expression_label': col.expression_label,
                'figure_type': col.figure_type,
                'blank_if_zero': col.blank_if_zero,
            })
        if not report_columns:
            report_columns = [{
                'name': _("Balance"),
                'expression_label': 'balance',
                'figure_type': 'monetary',
            }]

        column_groups = options.get('column_groups', OrderedDict({'default': {'date': options['date']}}))
        is_multi_period = len(column_groups) > 1

        if not is_multi_period:
            # Single period: keep backward-compatible format
            options['column_headers'] = [report_columns]
            options['columns'] = []
            for col in report_columns:
                options['columns'].append({
                    **col,
                    'column_group_key': list(column_groups.keys())[0],
                })
        else:
            # Multi-period: build two-row headers and flat columns list
            period_header_row = []
            label_header_row = []
            flat_columns = []

            for group_key, group_data in column_groups.items():
                period_header_row.append({
                    'name': group_data['date'].get('string', group_key),
                    'colspan': len(report_columns),
                })
                for col in report_columns:
                    label_header_row.append({
                        **col,
                        'column_group_key': group_key,
                    })
                    flat_columns.append({
                        **col,
                        'column_group_key': group_key,
                    })

            options['column_headers'] = [period_header_row, label_header_row]
            options['columns'] = flat_columns

    def _init_options_companies(self, options):
        """Set company info."""
        options['companies'] = [{
            'id': self.env.company.id,
            'name': self.env.company.name,
        }]
        options['currency_id'] = self.env.company.currency_id.id

    def _init_options_report_info(self, options):
        """Set report metadata."""
        options['report_id'] = self.id
        options['sections_source_id'] = self.id

    def _init_options_buttons(self, options):
        """Set export buttons."""
        options['buttons'] = [
            {
                'name': _("PDF"),
                'sequence': 10,
                'action': 'export_to_pdf',
                'file_export_type': 'pdf',
                'always_show': True,
            },
            {
                'name': _("XLSX"),
                'sequence': 20,
                'action': 'export_to_xlsx',
                'file_export_type': 'xlsx',
                'always_show': True,
            },
        ]

    # ==========================================================================
    # OPTIONS DOMAIN
    # ==========================================================================

    def _get_options_domain(self, options, date_scope='strict_range'):
        """Build the domain for account.move.line queries."""
        domain = []

        # Date domain
        date_from = options['date'].get('date_from')
        date_to = options['date'].get('date_to')

        if date_scope == 'strict_range':
            if date_from:
                domain.append(('date', '>=', date_from))
            if date_to:
                domain.append(('date', '<=', date_to))
        elif date_scope == 'from_beginning':
            if date_to:
                domain.append(('date', '<=', date_to))
        elif date_scope == 'from_fiscalyear':
            fiscal_date_from = self._get_fiscal_year_start(options)
            if fiscal_date_from:
                domain.append(('date', '>=', fiscal_date_from))
            if date_to:
                domain.append(('date', '<=', date_to))
        elif date_scope == 'to_beginning_of_fiscalyear':
            fiscal_date_from = self._get_fiscal_year_start(options)
            if fiscal_date_from:
                domain.append(('date', '<', fiscal_date_from))
        elif date_scope == 'to_beginning_of_period':
            if date_from:
                domain.append(('date', '<', date_from))

        # Posted entries filter
        if not options.get('all_entries'):
            domain.append(('move_id.state', '=', 'posted'))

        # Journal filter
        if options.get('journals'):
            selected = [j['id'] for j in options['journals'] if j.get('selected')]
            if selected:
                domain.append(('journal_id', 'in', selected))

        # Company filter
        company_ids = [c['id'] for c in options.get('companies', [])]
        if company_ids:
            domain.append(('company_id', 'in', company_ids))

        return domain

    def _get_fiscal_year_start(self, options):
        """Get the start of the fiscal year for the current date range."""
        date_to = options['date'].get('date_to')
        if not date_to:
            return None
        date_to = fields.Date.from_string(date_to)
        try:
            fy_dates = self.env.company.compute_fiscalyear_dates(date_to)
            return fields.Date.to_string(fy_dates['date_from'])
        except Exception:
            return fields.Date.to_string(date_to.replace(month=1, day=1))

    # ==========================================================================
    # REPORT INFORMATION (main RPC endpoint)
    # ==========================================================================

    def get_report_information(self, options):
        """Main entry point called by the OWL frontend via RPC.

        Returns all data needed to render the report.
        """
        self.ensure_one()

        lines = self._get_lines(options)

        # For multi-period, return all header rows; for single, return flat list
        column_headers = options.get('column_headers', [[]])
        is_multi_period = len(options.get('column_groups', {})) > 1

        # show_comparison: only for non-custom-handler reports
        custom_handler = self._get_custom_handler_model()
        show_comparison = not custom_handler

        return {
            'lines': lines,
            'column_headers_render_data': column_headers,
            'columns': options.get('columns', []),
            'options': options,
            'report': {
                'id': self.id,
                'name': self.name,
                'load_more_limit': self.load_more_limit,
            },
            'buttons': options.get('buttons', []),
            'filters': {
                'show_date': True,
                'show_draft': self.filter_show_draft,
                'show_journals': self.filter_journals,
                'show_hide_0': self.filter_hide_0_lines != 'never',
                'show_comparison': show_comparison,
            },
            'display': self._get_display_config(),
            'multi_period': is_multi_period,
        }

    def _get_display_config(self):
        """Get display configuration for the report."""
        config = {
            'unfold_all': self.filter_unfold_all,
        }
        custom_handler = self._get_custom_handler_model()
        if custom_handler:
            config.update(
                self.env[custom_handler]._get_custom_display_config()
            )
        return config

    # ==========================================================================
    # GET LINES
    # ==========================================================================

    def _compute_expression_totals_for_all_groups(self, options):
        """Compute expression totals for each column group.

        Returns {group_key: {expression_id: value}}
        """
        column_groups = options.get('column_groups', {'default': {'date': options['date']}})
        result = {}

        for group_key, group_data in column_groups.items():
            # Build a copy of options with this group's date
            group_options = copy.deepcopy(options)
            group_options['date'] = group_data['date']
            result[group_key] = self._compute_expression_totals(group_options)

        return result

    def _get_lines(self, options, all_column_groups_expression_totals=None):
        """Generate all report lines.

        Returns a list of line dicts ready for the OWL frontend.
        """
        self.ensure_one()

        # Compute expression totals if not provided
        if all_column_groups_expression_totals is None:
            column_groups = options.get('column_groups', {})
            if len(column_groups) > 1:
                all_column_groups_expression_totals = self._compute_expression_totals_for_all_groups(options)
            else:
                # Single period: wrap in dict for uniform access
                totals = self._compute_expression_totals(options)
                group_key = list(column_groups.keys())[0] if column_groups else 'default'
                all_column_groups_expression_totals = {group_key: totals}

        lines = []
        for report_line in self.line_ids.filtered(lambda l: not l.parent_id):
            lines += self._get_line_and_children(
                report_line, options, all_column_groups_expression_totals
            )

        # Post-process with custom handler
        custom_handler = self._get_custom_handler_model()
        if custom_handler:
            lines = self.env[custom_handler]._custom_line_postprocessor(
                self, options, lines
            )

        return lines

    def _get_line_and_children(self, report_line, options, expression_totals,
                               parent_line_id=None, level=0):
        """Recursively build line dicts for a report line and its children."""
        line_id = self._get_generic_line_id(
            'account.report.line', report_line.id,
            parent_line_id=parent_line_id,
        )

        # Build columns
        columns = self._build_line_columns(report_line, options, expression_totals)

        # Check if all values are zero
        all_zero = all(
            float_is_zero(c.get('no_format', 0), precision_digits=2)
            for c in columns
            if isinstance(c.get('no_format'), (int, float))
        )

        line_dict = {
            'id': line_id,
            'name': report_line.name,
            'level': level,
            'columns': columns,
            'unfoldable': report_line.foldable or bool(report_line.children_ids),
            'unfolded': (
                options.get('unfold_all')
                or line_id in options.get('unfolded_lines', [])
            ),
            'parent_id': parent_line_id,
            'report_line_id': report_line.id,
        }

        # Add action if defined
        if report_line.action_id:
            line_dict['action_id'] = report_line.action_id.id

        # Check hide_if_zero
        if report_line.hide_if_zero and all_zero and options.get('hide_0_lines'):
            return []

        lines = [line_dict]

        # Add children if unfolded or unfold_all
        has_children = bool(report_line.children_ids)
        is_foldable = report_line.foldable
        is_unfolded = line_dict['unfolded']

        if has_children and (is_unfolded or not is_foldable):
            for child in report_line.children_ids.sorted('sequence'):
                lines += self._get_line_and_children(
                    child, options, expression_totals,
                    parent_line_id=line_id,
                    level=level + 1,
                )

        return lines

    def _build_line_columns(self, report_line, options, expression_totals):
        """Build column values for a report line.

        expression_totals is either:
        - {expr_id: value} for single period (backward compat)
        - {group_key: {expr_id: value}} for multi-period
        """
        columns = []
        flat_columns = options.get('columns', [])

        if flat_columns:
            # Multi-period path: iterate over flat columns list
            for col_def in flat_columns:
                expr_label = col_def.get('expression_label', 'balance')
                figure_type = col_def.get('figure_type', 'monetary')
                group_key = col_def.get('column_group_key', 'default')

                # Get the totals for this group
                group_totals = expression_totals.get(group_key, {})

                expression = report_line.expression_ids.filtered(
                    lambda e: e.label == expr_label
                )

                if expression and expression.id in group_totals:
                    value = group_totals[expression.id]
                elif expression and expression.engine == 'aggregation':
                    value = self._compute_aggregation_value(
                        expression, group_totals
                    )
                else:
                    value = 0.0

                if expression and expression.figure_type:
                    figure_type = expression.figure_type

                blank_if_zero = (
                    col_def.get('blank_if_zero')
                    or (expression and expression.blank_if_zero)
                )

                column = self._build_column_dict(
                    value, figure_type, blank_if_zero, options, expression
                )
                column['column_group_key'] = group_key
                columns.append(column)
        else:
            # Fallback: single-period backward compat
            column_headers = options.get('column_headers', [[]])[0]
            # Flatten expression_totals if it's multi-level
            if expression_totals and isinstance(next(iter(expression_totals.values()), None), dict):
                flat_totals = next(iter(expression_totals.values()))
            else:
                flat_totals = expression_totals

            for col_header in column_headers:
                expr_label = col_header.get('expression_label', 'balance')
                figure_type = col_header.get('figure_type', 'monetary')

                expression = report_line.expression_ids.filtered(
                    lambda e: e.label == expr_label
                )

                if expression and expression.id in flat_totals:
                    value = flat_totals[expression.id]
                elif expression and expression.engine == 'aggregation':
                    value = self._compute_aggregation_value(
                        expression, flat_totals
                    )
                else:
                    value = 0.0

                if expression and expression.figure_type:
                    figure_type = expression.figure_type

                blank_if_zero = (
                    col_header.get('blank_if_zero')
                    or (expression and expression.blank_if_zero)
                )

                column = self._build_column_dict(
                    value, figure_type, blank_if_zero, options, expression
                )
                columns.append(column)

        return columns

    def _build_column_dict(self, value, figure_type, blank_if_zero, options, expression=None):
        """Build a single column value dict."""
        if blank_if_zero and float_is_zero(value, precision_digits=2):
            return {
                'name': '',
                'no_format': 0,
                'figure_type': figure_type,
                'is_zero': True,
            }

        if figure_type == 'monetary':
            currency = self.env.company.currency_id
            formatted = formatLang(self.env, value, currency_obj=currency)
        elif figure_type == 'percentage':
            formatted = f"{value:.1f}%"
        elif figure_type == 'integer':
            formatted = formatLang(self.env, value, digits=0)
        elif figure_type == 'float':
            formatted = formatLang(self.env, value, digits=2)
        else:
            formatted = str(value) if value else ''

        column = {
            'name': formatted,
            'no_format': value,
            'figure_type': figure_type,
            'is_zero': float_is_zero(value, precision_digits=2) if isinstance(value, (int, float)) else False,
        }

        if expression and expression.auditable:
            column['auditable'] = True
            column['report_line_id'] = expression.report_line_id.id
            column['expression_label'] = expression.label

        return column

    # ==========================================================================
    # EXPRESSION COMPUTATION
    # ==========================================================================

    def _compute_expression_totals(self, options):
        """Compute all expression totals for the report.

        Returns {expression_id: value}
        """
        self.ensure_one()

        # Collect all expressions
        all_expressions = self.line_ids.expression_ids

        # Separate by engine
        domain_expressions = all_expressions.filtered(lambda e: e.engine == 'domain')
        custom_expressions = all_expressions.filtered(lambda e: e.engine == 'custom')
        aggregation_expressions = all_expressions.filtered(lambda e: e.engine == 'aggregation')

        totals = {}

        # 1. Compute domain expressions first (direct SQL)
        if domain_expressions:
            domain_totals = self._compute_formula_batch_domain(
                domain_expressions, options
            )
            totals.update(domain_totals)

        # 2. Compute custom expressions
        if custom_expressions:
            custom_totals = self._compute_formula_batch_custom(
                custom_expressions, options
            )
            totals.update(custom_totals)

        # 3. Compute aggregation expressions (depend on domain/custom results)
        if aggregation_expressions:
            agg_totals = self._compute_formula_batch_aggregation(
                aggregation_expressions, options, totals
            )
            totals.update(agg_totals)

        return totals

    def _compute_formula_batch_domain(self, expressions, options):
        """Compute domain-engine expressions using SQL on account.move.line.

        Each expression has:
        - formula: a domain string like "[('account_id.account_type', 'in', [...])]"
        - subformula: 'sum' or 'count' or '-sum' etc.
        - date_scope: determines date filtering
        """
        totals = {}

        for expression in expressions:
            try:
                expr_domain = ast.literal_eval(expression.formula)
            except (ValueError, SyntaxError):
                totals[expression.id] = 0.0
                continue

            date_scope = expression.date_scope or 'strict_range'
            base_domain = self._get_options_domain(options, date_scope=date_scope)
            full_domain = base_domain + expr_domain

            subformula = (expression.subformula or 'sum').strip()

            # Determine what to sum
            if subformula in ('sum', '-sum'):
                field_name = 'balance'
            elif subformula in ('sum_debit', '-sum_debit'):
                field_name = 'debit'
            elif subformula in ('sum_credit', '-sum_credit'):
                field_name = 'credit'
            elif subformula == 'count':
                field_name = None  # count
            else:
                field_name = 'balance'

            try:
                if field_name is None:
                    # Count
                    count = self.env['account.move.line'].search_count(full_domain)
                    value = float(count)
                else:
                    # Sum
                    result = self.env['account.move.line'].read_group(
                        full_domain,
                        [field_name],
                        [],
                    )
                    value = result[0][field_name] if result else 0.0

                # Handle negative subformula
                if subformula.startswith('-'):
                    value = -value

                totals[expression.id] = value
            except Exception:
                totals[expression.id] = 0.0

        return totals

    def _compute_formula_batch_custom(self, expressions, options):
        """Compute custom-engine expressions by delegating to custom handler."""
        totals = {}
        custom_handler = self._get_custom_handler_model()

        if not custom_handler:
            for expr in expressions:
                totals[expr.id] = 0.0
            return totals

        handler = self.env[custom_handler]
        if hasattr(handler, '_compute_custom_expressions'):
            return handler._compute_custom_expressions(self, expressions, options)

        for expr in expressions:
            totals[expr.id] = 0.0
        return totals

    def _compute_formula_batch_aggregation(self, expressions, options, existing_totals):
        """Compute aggregation-engine expressions.

        These reference other expressions by line_code.label format.
        Example formula: 'REV.balance + OIN.balance - COS.balance'
        """
        totals = {}
        all_totals = dict(existing_totals)

        # Build a lookup: {(line_code, expr_label): expression}
        all_expressions = self.line_ids.expression_ids
        expr_by_code_label = {}
        for expr in all_expressions:
            if expr.report_line_id.code:
                key = (expr.report_line_id.code, expr.label)
                expr_by_code_label[key] = expr

        # Resolve in order (handle dependencies)
        resolved = set(all_totals.keys())
        to_resolve = list(expressions)
        max_iterations = len(to_resolve) + 1
        iteration = 0

        while to_resolve and iteration < max_iterations:
            iteration += 1
            still_pending = []
            for expression in to_resolve:
                value = self._evaluate_aggregation_formula(
                    expression, expr_by_code_label, all_totals
                )
                if value is not None:
                    all_totals[expression.id] = value
                    totals[expression.id] = value
                    resolved.add(expression.id)
                else:
                    still_pending.append(expression)
            to_resolve = still_pending

        # Any remaining unresolved get 0
        for expression in to_resolve:
            totals[expression.id] = 0.0

        return totals

    def _evaluate_aggregation_formula(self, expression, expr_by_code_label, current_totals):
        """Evaluate a single aggregation formula.

        Returns the computed value, or None if dependencies aren't ready yet.
        """
        formula = expression.formula.strip()

        # Special case: sum_children
        if formula == 'sum_children':
            children = expression.report_line_id.children_ids
            total = 0.0
            for child in children:
                child_expr = child.expression_ids.filtered(
                    lambda e: e.label == expression.label
                )
                if child_expr and child_expr.id in current_totals:
                    total += current_totals[child_expr.id]
                elif child_expr:
                    return None  # dependency not ready
            return total

        # Parse and evaluate formula like "REV.balance + OIN.balance - COS.balance"
        try:
            # Replace code.label references with actual values
            eval_formula = formula
            terms = re.findall(r'([A-Za-z_][A-Za-z0-9_]*)\.([\w]+)', formula)

            for line_code, expr_label in terms:
                key = (line_code, expr_label)
                if key in expr_by_code_label:
                    ref_expr = expr_by_code_label[key]
                    if ref_expr.id in current_totals:
                        value = current_totals[ref_expr.id]
                        eval_formula = eval_formula.replace(
                            f'{line_code}.{expr_label}', str(value)
                        )
                    else:
                        return None  # dependency not ready
                else:
                    eval_formula = eval_formula.replace(
                        f'{line_code}.{expr_label}', '0.0'
                    )

            # Safe evaluation (only arithmetic)
            result = eval(eval_formula, {"__builtins__": {}}, {})
            return float(result)
        except Exception:
            return 0.0

    def _compute_aggregation_value(self, expression, existing_totals):
        """Compute a single aggregation expression value (used for on-the-fly calc)."""
        expr_by_code_label = {}
        for expr in self.line_ids.expression_ids:
            if expr.report_line_id.code:
                key = (expr.report_line_id.code, expr.label)
                expr_by_code_label[key] = expr

        value = self._evaluate_aggregation_formula(
            expression, expr_by_code_label, existing_totals
        )
        return value if value is not None else 0.0

    # ==========================================================================
    # EXPANDED LINES (unfold/fold)
    # ==========================================================================

    def get_expanded_lines(self, options, line_id, groupby=None, expand_function=None,
                           progress=0, offset=0, limit=None):
        """Get child lines when expanding a report line.

        Called via RPC when user clicks unfold.
        """
        self.ensure_one()

        parsed = self._parse_line_id(line_id)
        model, record_id = self._get_model_info_from_id(line_id)

        if model == 'account.report.line' and record_id:
            report_line = self.env['account.report.line'].browse(record_id)
            if not report_line.exists():
                return {'lines': []}

            # Compute multi-group totals
            column_groups = options.get('column_groups', {})
            if len(column_groups) > 1:
                expression_totals = self._compute_expression_totals_for_all_groups(options)
            else:
                totals = self._compute_expression_totals(options)
                group_key = list(column_groups.keys())[0] if column_groups else 'default'
                expression_totals = {group_key: totals}

            lines = []
            # Check for groupby expansion
            if report_line.groupby:
                lines = self._get_groupby_lines(
                    report_line, options, expression_totals, line_id,
                    offset=offset, limit=limit or self.load_more_limit,
                )
            else:
                for child in report_line.children_ids.sorted('sequence'):
                    lines += self._get_line_and_children(
                        child, options, expression_totals,
                        parent_line_id=line_id,
                        level=report_line.hierarchy_level + 1,
                    )

            return {'lines': lines}

        # Custom handler expansion
        custom_handler = self._get_custom_handler_model()
        if custom_handler and hasattr(self.env[custom_handler], '_get_custom_lines'):
            lines = self.env[custom_handler]._get_custom_lines(
                self, options, line_id, offset=offset,
                limit=limit or self.load_more_limit,
            )
            return {'lines': lines}

        return {'lines': []}

    def _get_groupby_lines(self, report_line, options, expression_totals,
                           parent_line_id, offset=0, limit=80):
        """Generate lines grouped by the report_line.groupby field."""
        groupby_field = report_line.groupby
        if not groupby_field:
            return []

        # Find domain expression
        domain_expr = report_line.expression_ids.filtered(
            lambda e: e.engine == 'domain' and e.label == 'balance'
        )
        if not domain_expr:
            return []
        domain_expr = domain_expr[0]

        try:
            expr_domain = ast.literal_eval(domain_expr.formula)
        except (ValueError, SyntaxError):
            return []

        date_scope = domain_expr.date_scope or 'strict_range'
        column_groups = options.get('column_groups', {'default': {'date': options['date']}})
        is_multi_period = len(column_groups) > 1

        has_more = False
        lines = []

        if not is_multi_period:
            # Single period path (original behavior)
            base_domain = self._get_options_domain(options, date_scope=date_scope)
            full_domain = base_domain + expr_domain

            try:
                groups = self.env['account.move.line'].read_group(
                    full_domain,
                    ['balance'],
                    [groupby_field],
                    offset=offset,
                    limit=limit + 1,
                    orderby=f'{groupby_field}',
                )
            except Exception:
                return []

            has_more = len(groups) > limit
            if has_more:
                groups = groups[:limit]

            lines = []
            for group in groups:
                group_value = group[groupby_field]
                if isinstance(group_value, (list, tuple)):
                    group_id = group_value[0]
                    group_name = group_value[1]
                elif isinstance(group_value, bool):
                    group_id = None
                    group_name = _("Undefined") if not group_value else str(group_value)
                else:
                    group_id = group_value
                    group_name = str(group_value) if group_value else _("Undefined")

                line_id = self._get_generic_line_id(
                    groupby_field.replace('_id', '').replace('_', '.') if '_id' in groupby_field else None,
                    group_id,
                    markup={'groupby': groupby_field},
                    parent_line_id=parent_line_id,
                )

                balance = group.get('balance', 0.0)
                columns = self._build_groupby_columns(balance, options)

                if options.get('hide_0_lines') and float_is_zero(balance, precision_digits=2):
                    continue

                lines.append({
                    'id': line_id,
                    'name': group_name,
                    'level': report_line.hierarchy_level + 1,
                    'columns': columns,
                    'unfoldable': False,
                    'unfolded': False,
                    'parent_id': parent_line_id,
                })
        else:
            # Multi-period: query each group separately and merge
            # First, get all distinct groupby values from all periods
            all_group_values = {}
            per_group_data = {}

            for group_key, group_data in column_groups.items():
                group_options = copy.deepcopy(options)
                group_options['date'] = group_data['date']
                base_domain = self._get_options_domain(group_options, date_scope=date_scope)
                full_domain = base_domain + expr_domain

                try:
                    groups = self.env['account.move.line'].read_group(
                        full_domain,
                        ['balance'],
                        [groupby_field],
                        orderby=f'{groupby_field}',
                    )
                except Exception:
                    groups = []

                for group in groups:
                    group_value = group[groupby_field]
                    if isinstance(group_value, (list, tuple)):
                        gid = group_value[0]
                        gname = group_value[1]
                    elif isinstance(group_value, bool):
                        gid = None
                        gname = _("Undefined") if not group_value else str(group_value)
                    else:
                        gid = group_value
                        gname = str(group_value) if group_value else _("Undefined")

                    gid_key = gid if gid is not None else '__none__'
                    all_group_values[gid_key] = (gid, gname)
                    per_group_data.setdefault(gid_key, {})[group_key] = group.get('balance', 0.0)

            lines = []
            for gid_key, (gid, gname) in sorted(all_group_values.items(), key=lambda x: str(x[1][1])):
                line_id = self._get_generic_line_id(
                    groupby_field.replace('_id', '').replace('_', '.') if '_id' in groupby_field else None,
                    gid,
                    markup={'groupby': groupby_field},
                    parent_line_id=parent_line_id,
                )

                group_balances = per_group_data.get(gid_key, {})
                # Fill missing groups with 0
                for gk in column_groups:
                    group_balances.setdefault(gk, 0.0)

                total_balance = sum(group_balances.values())
                if options.get('hide_0_lines') and float_is_zero(total_balance, precision_digits=2):
                    continue

                columns = self._build_groupby_columns(0, options, group_balances=group_balances)

                lines.append({
                    'id': line_id,
                    'name': gname,
                    'level': report_line.hierarchy_level + 1,
                    'columns': columns,
                    'unfoldable': False,
                    'unfolded': False,
                    'parent_id': parent_line_id,
                })

            has_more = False  # Multi-period groupby doesn't paginate

        # Determine number of columns for load more
        num_cols = len(options.get('columns', [])) or len(options.get('column_headers', [[]])[0])

        if has_more:
            lines.append({
                'id': self._get_generic_line_id(
                    None, None, markup='loadMore',
                    parent_line_id=parent_line_id,
                ),
                'name': _("Load More..."),
                'level': report_line.hierarchy_level + 1,
                'columns': [{'name': ''} for _ in range(num_cols)],
                'unfoldable': False,
                'unfolded': False,
                'parent_id': parent_line_id,
                'load_more': True,
                'offset': offset + limit,
                'progress': offset + limit,
            })

        return lines

    def _build_groupby_columns(self, balance, options, group_balances=None):
        """Build columns for a groupby line.

        For multi-period, group_balances is {group_key: balance_value}.
        """
        columns = []
        flat_columns = options.get('columns', [])

        if flat_columns and group_balances:
            for col_def in flat_columns:
                figure_type = col_def.get('figure_type', 'monetary')
                group_key = col_def.get('column_group_key', 'default')
                value = group_balances.get(group_key, 0.0)
                col = self._build_column_dict(value, figure_type, False, options)
                col['column_group_key'] = group_key
                columns.append(col)
        else:
            column_headers = options.get('column_headers', [[]])[0]
            for col_header in column_headers:
                figure_type = col_header.get('figure_type', 'monetary')
                columns.append(self._build_column_dict(
                    balance, figure_type, False, options
                ))
        return columns

    # ==========================================================================
    # COMPANY HELPERS
    # ==========================================================================

    def get_report_company_ids(self, options):
        """Get company IDs for the report."""
        return [c['id'] for c in options.get('companies', [self.env.company.id])]
