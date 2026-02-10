import ast
import base64
import copy
import io
import json

from odoo import api, fields, models, _
from odoo.tools.misc import formatLang


class AccountReportActions(models.Model):
    _inherit = 'account.report'

    # ==========================================================================
    # EXECUTE ACTION
    # ==========================================================================

    def execute_action(self, options, params=None):
        """Execute an action triggered by clicking a report line."""
        self.ensure_one()
        params = params or {}

        action_id = int(params.get('actionId'))
        action = self.env['ir.actions.actions'].sudo().browse(action_id)
        action_type = action.type
        action = self.env[action_type].sudo().browse(action_id)
        action_read = action.read()[0]

        # Clean action
        for key in ('domain', 'context'):
            if key in action_read and isinstance(action_read[key], str):
                try:
                    action_read[key] = ast.literal_eval(action_read[key])
                except (ValueError, SyntaxError):
                    pass

        if params.get('id'):
            model_id = None
            if isinstance(params['id'], int):
                model_id = params['id']
            else:
                _, model_id = self._get_model_info_from_id(params['id'])

            if model_id:
                context = action_read.get('context', {})
                if isinstance(context, str):
                    try:
                        context = ast.literal_eval(context)
                    except (ValueError, SyntaxError):
                        context = {}
                context.setdefault('active_id', model_id)
                action_read['context'] = context

        return action_read

    # ==========================================================================
    # AUDIT CELL
    # ==========================================================================

    def action_audit_cell(self, options, params):
        """Handle click on a cell value to show journal items."""
        self.ensure_one()

        report_line_id = params.get('report_line_id')
        expression_label = params.get('expression_label')
        calling_line_dict_id = params.get('calling_line_dict_id', '')
        column_group_key = params.get('column_group_key', 'default')

        if not report_line_id or not expression_label:
            return {}

        report_line = self.env['account.report.line'].browse(report_line_id)
        expression = report_line.expression_ids.filtered(
            lambda x: x.label == expression_label
        )

        if not expression:
            return {}

        # For multi-period, use the specific column group's date range
        audit_options = options
        column_groups = options.get('column_groups', {})
        if column_group_key and column_group_key in column_groups:
            audit_options = copy.deepcopy(options)
            audit_options['date'] = column_groups[column_group_key]['date']

        # Build domain for audit
        domain = self._get_audit_domain(audit_options, expression, calling_line_dict_id)

        return {
            'name': _("Journal Items"),
            'type': 'ir.actions.act_window',
            'res_model': 'account.move.line',
            'view_mode': 'list',
            'views': [(False, 'list')],
            'domain': domain,
            'context': {
                'active_test': False,
            },
        }

    def _get_audit_domain(self, options, expression, calling_line_dict_id=''):
        """Build the domain to audit a cell (show underlying journal items)."""
        # Get groupby domain from calling line
        groupby_domain = self._get_audit_groupby_domain(calling_line_dict_id)

        # Get expression domain
        expressions_to_audit = expression._expand_aggregations()
        or_domains = []

        for expr in expressions_to_audit:
            expr_domain = self._get_expression_audit_domain(expr)
            if expr_domain is not None:
                date_scope = expr.date_scope or 'strict_range'
                date_domain = self._get_options_domain(options, date_scope=date_scope)
                or_domains.append(date_domain + expr_domain)

        if or_domains:
            # OR together all expression domains
            if len(or_domains) == 1:
                domain = or_domains[0]
            else:
                domain = ['|'] * (len(or_domains) - 1)
                for d in or_domains:
                    domain.extend(d)
        else:
            domain = self._get_options_domain(options, date_scope='strict_range')

        domain += groupby_domain
        return domain

    def _get_audit_groupby_domain(self, calling_line_dict_id):
        """Extract groupby domain from the calling line ID."""
        parsed = self._parse_line_id(calling_line_dict_id)
        groupby_domain = []
        for markup, _model, grouping_key in parsed:
            if isinstance(markup, dict) and 'groupby' in markup:
                groupby_field = markup['groupby']
                groupby_domain.append((groupby_field, '=', grouping_key))
        return groupby_domain

    def _get_expression_audit_domain(self, expression):
        """Get the audit domain for a single expression."""
        if expression.engine == 'domain':
            try:
                return ast.literal_eval(expression.formula)
            except (ValueError, SyntaxError):
                return None
        return None

    # ==========================================================================
    # PDF EXPORT
    # ==========================================================================

    def export_to_pdf(self, options):
        """Export report to PDF."""
        self.ensure_one()

        lines = self._get_lines(options)

        column_headers = options.get('column_headers', [[]])
        is_multi_period = len(options.get('column_groups', {})) > 1

        # Build report data for template
        report_data = {
            'report_name': self.name,
            'date_string': options.get('date', {}).get('string', ''),
            'company_name': self.env.company.name,
            'lines': lines,
            'column_headers': column_headers[-1] if column_headers else [],
            'multi_period': is_multi_period,
            'period_headers': column_headers[0] if is_multi_period and len(column_headers) > 1 else [],
        }

        content = self.env['ir.qweb']._render(
            'seisei_account_reports.report_financial_pdf',
            report_data,
        )

        body_html = self.env['ir.qweb']._render(
            'web.minimal_layout',
            {
                'subst': True,
                'body': content,
                'base_url': self.env['ir.config_parameter'].sudo().get_param('web.base.url'),
            },
        )

        pdf_content = self.env['ir.actions.report']._run_wkhtmltopdf(
            [body_html],
            landscape=True,
        )

        filename = f"{self.name}.pdf"

        attachment = self.env['ir.attachment'].create({
            'name': filename,
            'type': 'binary',
            'datas': base64.b64encode(pdf_content),
            'mimetype': 'application/pdf',
        })

        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/{attachment.id}?download=true',
            'target': 'self',
        }

    # ==========================================================================
    # XLSX EXPORT
    # ==========================================================================

    def export_to_xlsx(self, options):
        """Export report to XLSX."""
        self.ensure_one()

        try:
            import xlsxwriter
        except ImportError:
            return {'error': 'xlsxwriter not installed'}

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        sheet = workbook.add_worksheet(self.name[:31])

        # Styles
        title_style = workbook.add_format({
            'bold': True, 'font_size': 14, 'bottom': 2,
        })
        header_style = workbook.add_format({
            'bold': True, 'font_size': 10, 'bottom': 1,
            'bg_color': '#f0f0f0',
        })
        header_right_style = workbook.add_format({
            'bold': True, 'font_size': 10, 'bottom': 1,
            'bg_color': '#f0f0f0', 'align': 'right',
        })
        level0_style = workbook.add_format({
            'bold': True, 'font_size': 11,
        })
        level0_right_style = workbook.add_format({
            'bold': True, 'font_size': 11, 'align': 'right',
            'num_format': '#,##0.00',
        })
        level1_style = workbook.add_format({
            'bold': True, 'font_size': 10, 'indent': 1,
        })
        level1_right_style = workbook.add_format({
            'bold': True, 'font_size': 10, 'align': 'right',
            'num_format': '#,##0.00',
        })
        default_style = workbook.add_format({
            'font_size': 10,
        })
        default_right_style = workbook.add_format({
            'font_size': 10, 'align': 'right',
            'num_format': '#,##0.00',
        })

        # Title
        row = 0
        sheet.write(row, 0, self.name, title_style)
        row += 1
        date_str = options.get('date', {}).get('string', '')
        sheet.write(row, 0, date_str)
        row += 1
        sheet.write(row, 0, self.env.company.name)
        row += 2

        # Headers
        column_headers = options.get('column_headers', [[]])
        is_multi_period = len(options.get('column_groups', {})) > 1

        period_header_style = workbook.add_format({
            'bold': True, 'font_size': 10, 'bottom': 1,
            'bg_color': '#f8f9fa', 'align': 'center',
        })

        sheet.write(row, 0, 'Name', header_style)
        sheet.set_column(0, 0, 40)

        if is_multi_period and len(column_headers) > 1:
            # Period header row
            col_offset = 1
            for period in column_headers[0]:
                colspan = period.get('colspan', 1)
                if colspan > 1:
                    sheet.merge_range(
                        row, col_offset, row, col_offset + colspan - 1,
                        period.get('name', ''), period_header_style
                    )
                else:
                    sheet.write(row, col_offset, period.get('name', ''), period_header_style)
                col_offset += colspan
            row += 1
            # Label header row
            sheet.write(row, 0, '', header_style)
            for col_idx, col_header in enumerate(column_headers[-1], 1):
                sheet.write(row, col_idx, col_header.get('name', ''), header_right_style)
                sheet.set_column(col_idx, col_idx, 15)
        else:
            flat_headers = column_headers[0] if column_headers else []
            for col_idx, col_header in enumerate(flat_headers, 1):
                sheet.write(row, col_idx, col_header.get('name', ''), header_right_style)
                sheet.set_column(col_idx, col_idx, 15)

        row += 1

        # Lines
        lines = self._get_lines(options)
        for line in lines:
            level = line.get('level', 0)
            if level == 0:
                name_style = level0_style
                val_style = level0_right_style
            elif level == 1:
                name_style = level1_style
                val_style = level1_right_style
            else:
                name_style = workbook.add_format({
                    'font_size': 10, 'indent': min(level, 4),
                })
                val_style = default_right_style

            # Name
            sheet.write(row, 0, line.get('name', ''), name_style)

            # Columns
            for col_idx, col in enumerate(line.get('columns', []), 1):
                value = col.get('no_format', '')
                if isinstance(value, (int, float)):
                    sheet.write_number(row, col_idx, value, val_style)
                else:
                    sheet.write(row, col_idx, str(value) if value else '', default_right_style)

            row += 1

        workbook.close()
        xlsx_data = output.getvalue()

        return {
            'file_content': base64.b64encode(xlsx_data).decode(),
            'file_name': f"{self.name}.xlsx",
        }
