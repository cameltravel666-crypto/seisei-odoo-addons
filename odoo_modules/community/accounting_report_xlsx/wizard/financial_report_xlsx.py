# -*- coding: utf-8 -*-
import io
import base64
from datetime import datetime
from odoo import models, fields, api, _
from odoo.exceptions import UserError

try:
    import xlsxwriter
except ImportError:
    xlsxwriter = None


def get_xlsx_workbook_formats(workbook):
    """Define common formats for Excel reports"""
    return {
        'title': workbook.add_format({
            'bold': True,
            'font_size': 16,
            'align': 'center',
            'valign': 'vcenter',
        }),
        'header': workbook.add_format({
            'bold': True,
            'font_size': 11,
            'bg_color': '#4472C4',
            'font_color': 'white',
            'border': 1,
            'align': 'center',
        }),
        'level1': workbook.add_format({
            'bold': True,
            'font_size': 11,
            'bg_color': '#D9E2F3',
            'border': 1,
        }),
        'level2': workbook.add_format({
            'bold': True,
            'font_size': 10,
            'bg_color': '#E9EFF7',
            'border': 1,
        }),
        'normal': workbook.add_format({
            'font_size': 10,
            'border': 1,
        }),
        'number': workbook.add_format({
            'font_size': 10,
            'border': 1,
            'num_format': '#,##0.00',
            'align': 'right',
        }),
        'number_bold': workbook.add_format({
            'bold': True,
            'font_size': 10,
            'border': 1,
            'num_format': '#,##0.00',
            'align': 'right',
            'bg_color': '#D9E2F3',
        }),
        'date': workbook.add_format({
            'font_size': 10,
            'align': 'left',
        }),
    }


def create_xlsx_attachment(env, model_name, record_id, output, report_name):
    """Create attachment from Excel output"""
    output.seek(0)
    filename = report_name.replace(' ', '_') + '_' + datetime.now().strftime('%Y%m%d_%H%M%S') + '.xlsx'
    attachment = env['ir.attachment'].create({
        'name': filename,
        'type': 'binary',
        'datas': base64.b64encode(output.read()),
        'res_model': model_name,
        'res_id': record_id,
        'mimetype': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    return {
        'type': 'ir.actions.act_url',
        'url': '/web/content/' + str(attachment.id) + '?download=true',
        'target': 'self',
    }


class FinancialReportXlsx(models.TransientModel):
    _inherit = 'financial.report'

    def view_report_xlsx(self):
        """Generate Excel report for financial statements"""
        self.ensure_one()

        if not xlsxwriter:
            raise UserError(_('xlsxwriter library is required.'))

        data = dict()
        data['ids'] = self.env.context.get('active_ids', [])
        data['model'] = self.env.context.get('active_model', 'ir.ui.menu')
        data['form'] = self.read([
            'date_from', 'enable_filter', 'debit_credit', 'date_to',
            'account_report_id', 'target_move', 'view_format', 'company_id'
        ])[0]
        used_context = self._build_contexts(data)
        data['form']['used_context'] = dict(
            used_context,
            lang=self.env.context.get('lang') or 'en_US'
        )

        report_lines = self.get_account_lines(data['form'])
        report_name = data['form']['account_report_id'][1] if data['form']['account_report_id'] else 'Financial Report'

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet(report_name[:31])
        formats = get_xlsx_workbook_formats(workbook)

        worksheet.set_column('A:A', 50)
        worksheet.set_column('B:D', 15)

        worksheet.merge_range('A1:D1', report_name, formats['title'])
        worksheet.set_row(0, 30)

        company_name = self.company_id.name if self.company_id else self.env.company.name
        worksheet.write('A2', 'Company: ' + company_name, formats['date'])

        date_range = ''
        if data['form']['date_from']:
            date_range += 'From: ' + str(data['form']['date_from'])
        if data['form']['date_to']:
            date_range += '  To: ' + str(data['form']['date_to'])
        worksheet.write('A3', date_range if date_range else 'All Periods', formats['date'])

        row = 5
        headers = ['Account / Report']
        if data['form']['debit_credit']:
            headers.extend(['Debit', 'Credit'])
        headers.append('Balance')

        for col, header in enumerate(headers):
            worksheet.write(row, col, header, formats['header'])

        row += 1
        for line in report_lines:
            level = int(line.get('level', 1) or 1)
            if level == 1:
                name_fmt = formats['level1']
                num_fmt = formats['number_bold']
            else:
                name_fmt = formats['normal']
                num_fmt = formats['number']

            indent = '  ' * (level - 1)
            name = indent + (line.get('name', '') or '')

            col = 0
            worksheet.write(row, col, name, name_fmt)
            col += 1

            if data['form']['debit_credit']:
                worksheet.write(row, col, line.get('debit', 0) or 0, num_fmt)
                col += 1
                worksheet.write(row, col, line.get('credit', 0) or 0, num_fmt)
                col += 1

            worksheet.write(row, col, line.get('balance', 0) or 0, num_fmt)
            row += 1

        workbook.close()
        return create_xlsx_attachment(self.env, self._name, self.id, output, report_name)


class CashFlowReportXlsx(models.TransientModel):
    _inherit = 'cash.flow.report'

    def check_report_xlsx(self):
        """Generate Excel report for Cash Flow Statement"""
        self.ensure_one()

        if not xlsxwriter:
            raise UserError(_('xlsxwriter library is required.'))

        data = dict()
        data['form'] = self.read([
            'date_from', 'enable_filter', 'debit_credit', 'date_to',
            'account_report_id', 'target_move', 'company_id'
        ])[0]

        report_name = 'Cash Flow Statement'
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet(report_name[:31])
        formats = get_xlsx_workbook_formats(workbook)

        worksheet.set_column('A:A', 50)
        worksheet.set_column('B:D', 15)

        worksheet.merge_range('A1:D1', report_name, formats['title'])
        worksheet.set_row(0, 30)

        company_name = self.company_id.name if self.company_id else self.env.company.name
        worksheet.write('A2', 'Company: ' + company_name, formats['date'])

        date_range = ''
        if data['form']['date_from']:
            date_range += 'From: ' + str(data['form']['date_from'])
        if data['form']['date_to']:
            date_range += '  To: ' + str(data['form']['date_to'])
        worksheet.write('A3', date_range if date_range else 'All Periods', formats['date'])

        row = 5
        headers = ['Description', 'Debit', 'Credit', 'Balance']
        for col, header in enumerate(headers):
            worksheet.write(row, col, header, formats['header'])

        try:
            used_context = self._build_contexts(data)
            data['form']['used_context'] = dict(used_context, lang=self.env.context.get('lang') or 'en_US')
            report_lines = self.get_account_lines(data['form'])
            row += 1
            for line in report_lines:
                level = int(line.get('level', 1) or 1)
                if level == 1:
                    name_fmt = formats['level1']
                    num_fmt = formats['number_bold']
                else:
                    name_fmt = formats['normal']
                    num_fmt = formats['number']

                indent = '  ' * (level - 1)
                worksheet.write(row, 0, indent + (line.get('name', '') or ''), name_fmt)
                worksheet.write(row, 1, line.get('debit', 0) or 0, num_fmt)
                worksheet.write(row, 2, line.get('credit', 0) or 0, num_fmt)
                worksheet.write(row, 3, line.get('balance', 0) or 0, num_fmt)
                row += 1
        except Exception as e:
            worksheet.write(row + 1, 0, 'Error: ' + str(e), formats['normal'])

        workbook.close()
        return create_xlsx_attachment(self.env, self._name, self.id, output, report_name)


class BankBookReportXlsx(models.TransientModel):
    _inherit = 'account.bank.book.report'

    def check_report_xlsx(self):
        """Generate Excel report for Bank Book"""
        self.ensure_one()

        if not xlsxwriter:
            raise UserError(_('xlsxwriter library is required.'))

        report_name = 'Bank Book'
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet(report_name[:31])
        formats = get_xlsx_workbook_formats(workbook)

        worksheet.set_column('A:A', 12)
        worksheet.set_column('B:B', 15)
        worksheet.set_column('C:C', 30)
        worksheet.set_column('D:D', 40)
        worksheet.set_column('E:G', 15)

        worksheet.merge_range('A1:G1', report_name, formats['title'])
        worksheet.set_row(0, 30)

        company_name = self.company_id.name if self.company_id else self.env.company.name
        worksheet.write('A2', 'Company: ' + company_name, formats['date'])

        date_range = ''
        if self.date_from:
            date_range += 'From: ' + str(self.date_from)
        if self.date_to:
            date_range += '  To: ' + str(self.date_to)
        worksheet.write('A3', date_range if date_range else 'All Periods', formats['date'])

        row = 5
        headers = ['Date', 'Entry', 'Partner', 'Label', 'Debit', 'Credit', 'Balance']
        for col, header in enumerate(headers):
            worksheet.write(row, col, header, formats['header'])

        row += 1
        try:
            lines = self._get_report_values()
            for line in lines.get('Accounts', []):
                worksheet.write(row, 0, line.get('account', ''), formats['level1'])
                row += 1
                for move in line.get('move_lines', []):
                    worksheet.write(row, 0, str(move.get('ldate', '')), formats['normal'])
                    worksheet.write(row, 1, move.get('lcode', ''), formats['normal'])
                    worksheet.write(row, 2, move.get('partner_name', '') or '', formats['normal'])
                    worksheet.write(row, 3, move.get('lname', '') or '', formats['normal'])
                    worksheet.write(row, 4, move.get('debit', 0) or 0, formats['number'])
                    worksheet.write(row, 5, move.get('credit', 0) or 0, formats['number'])
                    worksheet.write(row, 6, move.get('balance', 0) or 0, formats['number'])
                    row += 1
        except Exception as e:
            worksheet.write(row, 0, 'Error: ' + str(e), formats['normal'])

        workbook.close()
        return create_xlsx_attachment(self.env, self._name, self.id, output, report_name)


class CashBookReportXlsx(models.TransientModel):
    _inherit = 'account.cash.book.report'

    def check_report_xlsx(self):
        """Generate Excel report for Cash Book"""
        self.ensure_one()

        if not xlsxwriter:
            raise UserError(_('xlsxwriter library is required.'))

        report_name = 'Cash Book'
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet(report_name[:31])
        formats = get_xlsx_workbook_formats(workbook)

        worksheet.set_column('A:A', 12)
        worksheet.set_column('B:B', 15)
        worksheet.set_column('C:C', 30)
        worksheet.set_column('D:D', 40)
        worksheet.set_column('E:G', 15)

        worksheet.merge_range('A1:G1', report_name, formats['title'])
        worksheet.set_row(0, 30)

        company_name = self.company_id.name if self.company_id else self.env.company.name
        worksheet.write('A2', 'Company: ' + company_name, formats['date'])

        date_range = ''
        if self.date_from:
            date_range += 'From: ' + str(self.date_from)
        if self.date_to:
            date_range += '  To: ' + str(self.date_to)
        worksheet.write('A3', date_range if date_range else 'All Periods', formats['date'])

        row = 5
        headers = ['Date', 'Entry', 'Partner', 'Label', 'Debit', 'Credit', 'Balance']
        for col, header in enumerate(headers):
            worksheet.write(row, col, header, formats['header'])

        row += 1
        try:
            lines = self._get_report_values()
            for line in lines.get('Accounts', []):
                worksheet.write(row, 0, line.get('account', ''), formats['level1'])
                row += 1
                for move in line.get('move_lines', []):
                    worksheet.write(row, 0, str(move.get('ldate', '')), formats['normal'])
                    worksheet.write(row, 1, move.get('lcode', ''), formats['normal'])
                    worksheet.write(row, 2, move.get('partner_name', '') or '', formats['normal'])
                    worksheet.write(row, 3, move.get('lname', '') or '', formats['normal'])
                    worksheet.write(row, 4, move.get('debit', 0) or 0, formats['number'])
                    worksheet.write(row, 5, move.get('credit', 0) or 0, formats['number'])
                    worksheet.write(row, 6, move.get('balance', 0) or 0, formats['number'])
                    row += 1
        except Exception as e:
            worksheet.write(row, 0, 'Error: ' + str(e), formats['normal'])

        workbook.close()
        return create_xlsx_attachment(self.env, self._name, self.id, output, report_name)


class DayBookReportXlsx(models.TransientModel):
    _inherit = 'account.day.book.report'

    def check_report_xlsx(self):
        """Generate Excel report for Day Book"""
        self.ensure_one()

        if not xlsxwriter:
            raise UserError(_('xlsxwriter library is required.'))

        report_name = 'Day Book'
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet(report_name[:31])
        formats = get_xlsx_workbook_formats(workbook)

        worksheet.set_column('A:A', 12)
        worksheet.set_column('B:B', 15)
        worksheet.set_column('C:C', 30)
        worksheet.set_column('D:D', 40)
        worksheet.set_column('E:F', 15)

        worksheet.merge_range('A1:F1', report_name, formats['title'])
        worksheet.set_row(0, 30)

        company_name = self.company_id.name if self.company_id else self.env.company.name
        worksheet.write('A2', 'Company: ' + company_name, formats['date'])

        date_range = ''
        if self.date_from:
            date_range += 'From: ' + str(self.date_from)
        if self.date_to:
            date_range += '  To: ' + str(self.date_to)
        worksheet.write('A3', date_range if date_range else 'All Periods', formats['date'])

        row = 5
        headers = ['Date', 'Entry', 'Partner', 'Label', 'Debit', 'Credit']
        for col, header in enumerate(headers):
            worksheet.write(row, col, header, formats['header'])

        row += 1
        try:
            lines = self._get_report_values()
            for line in lines.get('Accounts', []):
                worksheet.write(row, 0, line.get('account', ''), formats['level1'])
                row += 1
                for move in line.get('move_lines', []):
                    worksheet.write(row, 0, str(move.get('ldate', '')), formats['normal'])
                    worksheet.write(row, 1, move.get('lcode', ''), formats['normal'])
                    worksheet.write(row, 2, move.get('partner_name', '') or '', formats['normal'])
                    worksheet.write(row, 3, move.get('lname', '') or '', formats['normal'])
                    worksheet.write(row, 4, move.get('debit', 0) or 0, formats['number'])
                    worksheet.write(row, 5, move.get('credit', 0) or 0, formats['number'])
                    row += 1
        except Exception as e:
            worksheet.write(row, 0, 'Error: ' + str(e), formats['normal'])

        workbook.close()
        return create_xlsx_attachment(self.env, self._name, self.id, output, report_name)


class AgedTrialBalanceXlsx(models.TransientModel):
    _inherit = 'account.aged.trial.balance'

    def check_report_xlsx(self):
        """Generate Excel report for Aged Trial Balance"""
        self.ensure_one()

        if not xlsxwriter:
            raise UserError(_('xlsxwriter library is required.'))

        report_name = 'Aged Trial Balance'
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet(report_name[:31])
        formats = get_xlsx_workbook_formats(workbook)

        worksheet.set_column('A:A', 40)
        worksheet.set_column('B:H', 15)

        worksheet.merge_range('A1:H1', report_name, formats['title'])
        worksheet.set_row(0, 30)

        company_name = self.company_id.name if self.company_id else self.env.company.name
        worksheet.write('A2', 'Company: ' + company_name, formats['date'])
        worksheet.write('A3', 'As of: ' + str(self.date_from or datetime.now().date()), formats['date'])

        row = 5
        headers = ['Partner', 'Not Due', '0-30', '30-60', '60-90', '90-120', '120+', 'Total']
        for col, header in enumerate(headers):
            worksheet.write(row, col, header, formats['header'])

        row += 1
        try:
            lines = self._get_report_values()
            for partner_data in lines.get('data', []):
                worksheet.write(row, 0, partner_data.get('name', ''), formats['normal'])
                worksheet.write(row, 1, partner_data.get('direction', 0) or 0, formats['number'])
                worksheet.write(row, 2, partner_data.get('4', 0) or 0, formats['number'])
                worksheet.write(row, 3, partner_data.get('3', 0) or 0, formats['number'])
                worksheet.write(row, 4, partner_data.get('2', 0) or 0, formats['number'])
                worksheet.write(row, 5, partner_data.get('1', 0) or 0, formats['number'])
                worksheet.write(row, 6, partner_data.get('0', 0) or 0, formats['number'])
                worksheet.write(row, 7, partner_data.get('total', 0) or 0, formats['number_bold'])
                row += 1
        except Exception as e:
            worksheet.write(row, 0, 'Error: ' + str(e), formats['normal'])

        workbook.close()
        return create_xlsx_attachment(self.env, self._name, self.id, output, report_name)
