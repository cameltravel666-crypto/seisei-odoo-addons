# -*- coding: utf-8 -*-
"""
OCR Batch Progress API Controller
Provides real-time progress updates for batch OCR processing
"""
import json
import logging
from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)


class OcrBatchProgressController(http.Controller):
    """Controller for OCR batch progress API"""

    @http.route("/api/ocr/batch/progress/<int:batch_id>", type="http", auth="user", methods=["GET"], csrf=False)
    def get_batch_progress(self, batch_id, **kwargs):
        """
        Get current progress of a batch OCR job.
        
        Returns JSON:
        {
            "success": true,
            "data": {
                "id": 1,
                "state": "processing",
                "total": 10,
                "processed": 3,
                "success": 3,
                "failed": 0,
                "progress_percent": 30.0,
                "eta_seconds": 105,
                "eta_display": "1 min 45 sec",
                "current_move": "BILL/2026/0001"
            }
        }
        """
        try:
            batch = request.env["ocr.batch.progress"].sudo().browse(batch_id)
            if not batch.exists():
                return Response(
                    json.dumps({"success": False, "error": "Batch not found"}),
                    content_type="application/json",
                    status=404
                )

            return Response(
                json.dumps({"success": True, "data": batch.get_status()}),
                content_type="application/json",
                status=200
            )
        except Exception as e:
            _logger.exception(f"[OCR Batch API] Error getting progress: {e}")
            return Response(
                json.dumps({"success": False, "error": str(e)}),
                content_type="application/json",
                status=500
            )

    @http.route("/api/ocr/batch/active", type="http", auth="user", methods=["GET"], csrf=False)
    def get_active_batches(self, **kwargs):
        """Get all active (queued or processing) batches for current user"""
        try:
            batches = request.env["ocr.batch.progress"].sudo().search([
                ("user_id", "=", request.env.uid),
                ("state", "in", ["queued", "processing"]),
            ], order="create_date desc", limit=5)

            data = [b.get_status() for b in batches]

            return Response(
                json.dumps({"success": True, "data": data}),
                content_type="application/json",
                status=200
            )
        except Exception as e:
            _logger.exception(f"[OCR Batch API] Error getting active batches: {e}")
            return Response(
                json.dumps({"success": False, "error": str(e)}),
                content_type="application/json",
                status=500
            )
