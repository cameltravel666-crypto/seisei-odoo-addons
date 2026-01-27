import json
import logging
from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)


class ReportLangAPIController(http.Controller):
    """Controller for PDF reports with language support."""

    @http.route("/api/report/pdf/<string:report_name>/<string:docids>",
                type="http", auth="user", methods=["GET"], csrf=False)
    def get_report_pdf(self, report_name, docids, lang=None, **kwargs):
        """Generate PDF report with specified language context."""
        try:
            ids = [int(i) for i in docids.split(",")]
            
            report = request.env["ir.actions.report"]._get_report_from_name(report_name)
            if not report:
                return Response(
                    json.dumps({"error": "Report " + report_name + " not found"}),
                    status=404, content_type="application/json"
                )
            
            # Get the model from the report
            model_name = report.model
            
            context = dict(request.env.context)
            original_partner_langs = {}
            
            if lang:
                context["lang"] = lang
                _logger.info("Generating report %s with lang=%s", report_name, lang)
                
                # Get records to find their partners
                records = request.env[model_name].browse(ids)
                
                # Temporarily override partner languages
                # This is needed because t-lang="doc.partner_id.lang" in templates
                # reads directly from the partner record, not from context
                for record in records:
                    partner = None
                    if hasattr(record, "partner_id") and record.partner_id:
                        partner = record.partner_id
                    elif hasattr(record, "partner_shipping_id") and record.partner_shipping_id:
                        partner = record.partner_shipping_id
                    
                    if partner and partner.id not in original_partner_langs:
                        original_partner_langs[partner.id] = partner.lang
                        # Temporarily set partner language using SQL
                        request.env.cr.execute(
                            "UPDATE res_partner SET lang = %s WHERE id = %s",
                            (lang, partner.id)
                        )
                        partner.invalidate_recordset(["lang"])
                        _logger.info("Temporarily set partner %s lang to %s", partner.id, lang)
            
            try:
                # Render PDF with language context
                pdf_content, _ = report.with_context(**context)._render_qweb_pdf(report_name, ids)
            finally:
                # Restore original partner languages
                for partner_id, original_lang in original_partner_langs.items():
                    request.env.cr.execute(
                        "UPDATE res_partner SET lang = %s WHERE id = %s",
                        (original_lang, partner_id)
                    )
                    _logger.info("Restored partner %s lang to %s", partner_id, original_lang)
                
                # Invalidate cache
                if original_partner_langs:
                    partners = request.env["res.partner"].browse(list(original_partner_langs.keys()))
                    partners.invalidate_recordset(["lang"])
            
            safe_name = report_name.replace(".", "_")
            filename = safe_name + "_" + docids + ".pdf"
            headers = [
                ("Content-Type", "application/pdf"),
                ("Content-Length", len(pdf_content)),
                ("Content-Disposition", "attachment; filename=\"" + filename + "\""),
            ]
            
            return request.make_response(pdf_content, headers=headers)
            
        except Exception as e:
            _logger.exception("Error generating report: %s", str(e))
            return Response(
                json.dumps({"error": str(e)}),
                status=500, content_type="application/json"
            )
