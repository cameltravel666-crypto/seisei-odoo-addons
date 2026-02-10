from odoo import models


class AccountReportCustomHandler(models.AbstractModel):
    _name = 'account.report.custom.handler'
    _description = 'Account Report Custom Handler'

    def _custom_line_postprocessor(self, report, options, lines):
        """Override to post-process lines for custom reports.

        :param report: account.report record
        :param options: report options dict
        :param lines: list of line dicts
        :return: modified list of line dicts
        """
        return lines

    def _custom_options_initializer(self, report, options, previous_options=None):
        """Override to customize options initialization.

        :param report: account.report record
        :param options: current options dict being built
        :param previous_options: previous options dict
        """
        pass

    def _custom_groupby_line_completer(self, report, options, line_dict):
        """Override to complete groupby lines with custom data.

        :param report: account.report record
        :param options: report options dict
        :param line_dict: the line dict to complete
        """
        pass

    def _get_custom_display_config(self):
        """Override to provide custom display configuration.

        :return: dict of display config overrides
        """
        return {}
