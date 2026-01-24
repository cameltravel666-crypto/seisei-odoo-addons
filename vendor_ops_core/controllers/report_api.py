# -*- coding: utf-8 -*-
"""
Custom Report API Controller for BizNexus
Provides endpoints to generate reports with language context support.
"""

import json
import logging
from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)


class ReportAPIController(http.Controller):
    """
    Controller for generating PDF reports with language support.

    Odoo's standard /report/pdf endpoint doesn't properly handle language context
    passed via URL parameters. This controller provides a custom endpoint that
    renders reports with the specified language by temporarily overriding the
    partner's language field during rendering.
    """

    @http.route('/api/report/pdf/<string:report_name>/<string:docids>',
                type='http', auth='user', methods=['GET'], csrf=False)
    def get_report_pdf(self, report_name, docids, lang=None, **kwargs):
        """
        Generate a PDF report with specified language context.

        Args:
            report_name: The report technical name (e.g., 'sale.report_saleorder')
            docids: Comma-separated list of record IDs
            lang: Language code (e.g., 'ja_JP', 'zh_CN', 'en_US')

        Returns:
            PDF file response
        """
        try:
            # Parse document IDs
            ids = [int(i) for i in docids.split(',')]

            # Get the report action
            report = request.env['ir.actions.report']._get_report_from_name(report_name)
            if not report:
                return Response(
                    json.dumps({'error': f'Report {report_name} not found'}),
                    status=404,
                    content_type='application/json'
                )

            # Determine the model from the report
            model_name = report.model

            # Set up context with language
            context = dict(request.env.context)
            original_partner_langs = {}

            if lang:
                context['lang'] = lang
                _logger.info(f'Generating report {report_name} with lang={lang}')

                # Get the records to find their partners
                records = request.env[model_name].browse(ids)

                # Temporarily store and override partner languages
                # This is needed because t-lang="doc.partner_id.lang" in templates
                # reads directly from the partner record, not from context
                for record in records:
                    partner = None
                    # Try common partner field names
                    if hasattr(record, 'partner_id') and record.partner_id:
                        partner = record.partner_id
                    elif hasattr(record, 'partner_shipping_id') and record.partner_shipping_id:
                        partner = record.partner_shipping_id

                    if partner and partner.id not in original_partner_langs:
                        original_partner_langs[partner.id] = partner.lang
                        # Temporarily set the partner's language using SQL to avoid
                        # triggering computed fields and other side effects
                        request.env.cr.execute(
                            "UPDATE res_partner SET lang = %s WHERE id = %s",
                            (lang, partner.id)
                        )
                        # Invalidate cache for this partner
                        partner.invalidate_recordset(['lang'])
                        _logger.info(f'Temporarily set partner {partner.id} lang to {lang}')

            try:
                # Render PDF with language context
                report_with_context = report.with_context(**context)
                pdf_content, content_type = report_with_context._render_qweb_pdf(report_name, ids)
            finally:
                # Restore original partner languages
                for partner_id, original_lang in original_partner_langs.items():
                    request.env.cr.execute(
                        "UPDATE res_partner SET lang = %s WHERE id = %s",
                        (original_lang, partner_id)
                    )
                    _logger.info(f'Restored partner {partner_id} lang to {original_lang}')

                # Invalidate cache for all affected partners
                if original_partner_langs:
                    partners = request.env['res.partner'].browse(list(original_partner_langs.keys()))
                    partners.invalidate_recordset(['lang'])

            # Build filename
            filename = f'{report_name.replace(".", "_")}_{docids}.pdf'

            # Return PDF response
            response_headers = [
                ('Content-Type', 'application/pdf'),
                ('Content-Length', len(pdf_content)),
                ('Content-Disposition', f'attachment; filename="{filename}"'),
            ]

            return request.make_response(pdf_content, headers=response_headers)

        except Exception as e:
            _logger.exception(f'Error generating report {report_name}: {e}')
            return Response(
                json.dumps({'error': str(e)}),
                status=500,
                content_type='application/json'
            )
