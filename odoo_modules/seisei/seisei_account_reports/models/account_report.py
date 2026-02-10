import ast
import re
from collections import defaultdict

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError

FIGURE_TYPE_SELECTION_VALUES = [
    ('float', "Float"),
    ('integer', "Integer"),
    ('monetary', "Monetary"),
    ('percentage', "Percentage"),
    ('string', "String"),
    ('date', "Date"),
    ('none', "None"),
]


class AccountReport(models.Model):
    _name = 'account.report'
    _description = 'Accounting Report'
    _order = 'sequence, id'

    name = fields.Char(string="Name", required=True, translate=True)
    sequence = fields.Integer(string="Sequence", default=10)
    active = fields.Boolean(string="Active", default=True)

    line_ids = fields.One2many(
        string="Lines",
        comodel_name='account.report.line',
        inverse_name='report_id',
    )
    column_ids = fields.One2many(
        string="Columns",
        comodel_name='account.report.column',
        inverse_name='report_id',
    )

    # Custom handler
    custom_handler_model_id = fields.Many2one(
        string='Custom Handler Model',
        comodel_name='ir.model',
    )
    custom_handler_model_name = fields.Char(
        string='Custom Handler Model Name',
        related='custom_handler_model_id.model',
    )

    # Filter fields
    filter_date_range = fields.Boolean(string="Date Range", default=True)
    filter_show_draft = fields.Boolean(string="Show Draft Entries", default=True)
    filter_unfold_all = fields.Boolean(string="Unfold All", default=False)
    filter_hide_0_lines = fields.Boolean(string="Hide lines at 0", default=True)
    filter_journals = fields.Boolean(string="Filter Journals", default=False)

    # Display options
    load_more_limit = fields.Integer(string="Load More Limit", default=80)
    default_opening_date_filter = fields.Selection(
        string="Default Opening Date",
        selection=[
            ('this_month', "This Month"),
            ('this_quarter', "This Quarter"),
            ('this_year', "This Year"),
            ('today', "Today"),
            ('last_month', "Last Month"),
            ('last_quarter', "Last Quarter"),
            ('last_year', "Last Year"),
        ],
        default='this_year',
    )

    country_id = fields.Many2one(string="Country", comodel_name='res.country')

    @api.constrains('custom_handler_model_id')
    def _validate_custom_handler_model(self):
        for report in self:
            if report.custom_handler_model_id:
                model = self.env[report.custom_handler_model_name]
                if not hasattr(model, '_custom_line_postprocessor'):
                    raise ValidationError(_(
                        "Custom handler model must implement _custom_line_postprocessor method."
                    ))

    def _get_custom_handler_model(self):
        self.ensure_one()
        return self.custom_handler_model_name if self.custom_handler_model_id else None


class AccountReportLine(models.Model):
    _name = 'account.report.line'
    _description = 'Accounting Report Line'
    _order = 'sequence, id'

    name = fields.Char(string="Name", required=True, translate=True)
    expression_ids = fields.One2many(
        string="Expressions",
        comodel_name='account.report.expression',
        inverse_name='report_line_id',
    )

    report_id = fields.Many2one(
        string="Report",
        comodel_name='account.report',
        required=True,
        ondelete='cascade',
    )

    parent_id = fields.Many2one(
        string="Parent Line",
        comodel_name='account.report.line',
        ondelete='set null',
    )
    children_ids = fields.One2many(
        string="Child Lines",
        comodel_name='account.report.line',
        inverse_name='parent_id',
    )

    groupby = fields.Char(
        string="Group By",
        help="Comma-separated list of fields from account.move.line to group by.",
    )
    sequence = fields.Integer(string="Sequence", default=10)
    code = fields.Char(
        string="Code",
        help="Unique code for this line, used in aggregation formulas.",
    )
    foldable = fields.Boolean(
        string="Foldable",
        default=False,
        help="If set, this line can be expanded/collapsed.",
    )
    hierarchy_level = fields.Integer(string="Hierarchy Level", default=0)
    hide_if_zero = fields.Boolean(string="Hide if Zero", default=False)
    action_id = fields.Many2one(
        string="Action",
        comodel_name='ir.actions.actions',
        help="Action to execute when clicking on this line's name.",
    )

    _report_line_code_uniq = models.Constraint(
        'UNIQUE(code, report_id)',
        'The code must be unique per report.',
    )


class AccountReportExpression(models.Model):
    _name = 'account.report.expression'
    _description = 'Accounting Report Expression'
    _rec_name = 'report_line_name'

    report_line_id = fields.Many2one(
        string="Report Line",
        comodel_name='account.report.line',
        required=True,
        index=True,
        ondelete='cascade',
    )
    report_line_name = fields.Char(
        string="Report Line Name",
        related='report_line_id.name',
    )

    label = fields.Char(string="Label", required=True)
    engine = fields.Selection(
        string="Computation Engine",
        selection=[
            ('domain', "Odoo Domain"),
            ('aggregation', "Aggregate Other Formulas"),
            ('custom', "Custom Python Function"),
        ],
        required=True,
    )
    formula = fields.Char(string="Formula", required=True)
    subformula = fields.Char(string="Subformula")
    date_scope = fields.Selection(
        string="Date Scope",
        selection=[
            ('from_beginning', 'From the very start'),
            ('from_fiscalyear', 'From the start of the fiscal year'),
            ('to_beginning_of_fiscalyear', 'At the beginning of the fiscal year'),
            ('to_beginning_of_period', 'At the beginning of the period'),
            ('strict_range', 'Strictly on the given dates'),
        ],
        required=True,
        default='strict_range',
    )
    figure_type = fields.Selection(
        string="Figure Type",
        selection=FIGURE_TYPE_SELECTION_VALUES,
    )
    green_on_positive = fields.Boolean(
        string="Is Growth Good when Positive",
        default=True,
    )
    blank_if_zero = fields.Boolean(string="Blank if Zero")
    auditable = fields.Boolean(
        string="Auditable",
        compute='_compute_auditable',
        store=True,
    )

    _line_label_uniq = models.Constraint(
        'UNIQUE(report_line_id, label)',
        'The expression label must be unique per report line.',
    )

    @api.depends('engine')
    def _compute_auditable(self):
        for expression in self:
            expression.auditable = expression.engine in ('domain', 'aggregation')

    def _expand_aggregations(self):
        """Return self and its full aggregation expression dependency tree."""
        result = self
        to_expand = self.filtered(lambda x: x.engine == 'aggregation')
        while to_expand:
            sub_expressions = self.env['account.report.expression']
            for candidate_expr in to_expand:
                if candidate_expr.formula == 'sum_children':
                    sub_expressions |= candidate_expr.report_line_id.children_ids.expression_ids.filtered(
                        lambda e: e.label == candidate_expr.label
                    )
                else:
                    labels_by_code = candidate_expr._get_aggregation_terms_details()
                    for line_code, expr_labels in labels_by_code.items():
                        sub_expressions |= self.env['account.report.expression'].search([
                            ('report_line_id.code', '=', line_code),
                            ('label', 'in', list(expr_labels)),
                            ('report_line_id.report_id', '=', candidate_expr.report_line_id.report_id.id),
                        ])
            to_expand = sub_expressions.filtered(
                lambda x: x.engine == 'aggregation' and x not in result
            )
            result |= sub_expressions
        return result

    def _get_aggregation_terms_details(self):
        """Parse aggregation formula into {code: {labels}}.

        Example: 'A.balance + B.balance' -> {'A': {'balance'}, 'B': {'balance'}}
        """
        totals_by_code = defaultdict(set)
        for expression in self:
            if expression.engine != 'aggregation':
                raise UserError(_(
                    "Cannot get aggregation details from a line not using 'aggregation' engine"
                ))
            expression_terms = re.split(r'[-+/*]', re.sub(r'[\s()]', '', expression.formula))
            for term in expression_terms:
                if term and not re.match(r'^([0-9]*[.])?[0-9]*$', term):
                    parts = term.split('.')
                    if len(parts) == 2:
                        line_code, total_name = parts
                        totals_by_code[line_code].add(total_name)
        return totals_by_code

    @api.depends('report_line_name', 'label')
    def _compute_display_name(self):
        for expr in self:
            expr.display_name = f'{expr.report_line_name} [{expr.label}]'


class AccountReportColumn(models.Model):
    _name = 'account.report.column'
    _description = 'Accounting Report Column'
    _order = 'sequence, id'

    name = fields.Char(string="Name", translate=True, required=True)
    expression_label = fields.Char(string="Expression Label", required=True)
    sequence = fields.Integer(string="Sequence")
    report_id = fields.Many2one(
        string="Report",
        comodel_name='account.report',
    )
    figure_type = fields.Selection(
        string="Figure Type",
        selection=FIGURE_TYPE_SELECTION_VALUES,
        default='monetary',
        required=True,
    )
    blank_if_zero = fields.Boolean(string="Blank if Zero")
    sortable = fields.Boolean(string="Sortable")
