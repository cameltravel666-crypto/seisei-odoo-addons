import re
from collections import defaultdict

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


class AccountReport(models.Model):
    _inherit = 'account.report'

    # Custom handler — our addition for delegating to handler models
    custom_handler_model_id = fields.Many2one(
        string='Custom Handler Model',
        comodel_name='ir.model',
    )
    custom_handler_model_name = fields.Char(
        string='Custom Handler Model Name',
        related='custom_handler_model_id.model',
    )

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


class AccountReportExpression(models.Model):
    _inherit = 'account.report.expression'

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
