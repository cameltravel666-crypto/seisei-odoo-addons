import json
import logging
from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)

# Token for authentication
import os
OCR_CALLBACK_TOKEN = os.getenv("OCR_CALLBACK_TOKEN", "seisei_ocr_token_2024")


class OcrCallbackController(http.Controller):

    @http.route('/api/ocr/callback', type='json', auth='none', methods=['POST'], csrf=False)
    def ocr_callback(self, **kwargs):
        """
        Webhook endpoint for OCR service callback.

        Expected Payload:
        {
            "odoo_record_id": 12345,
            "status": "success",  // or "failed"
            "token": "...",
            "extracted_data": {
                "invoice_date": "2023-12-25",
                "total_amount": 150.00,
                "currency": "CNY",
                "vendor_name": "Starbucks Coffee",
                "tax_id": "91310000...",
                "invoice_number": "INV-2023-001",
                "line_items": [...]
            },
            "raw_ocr_text": "...",
            "error_message": "..."  // only if status is "failed"
        }
        """
        try:
            # Get JSON data
            data = request.jsonrequest
            _logger.info(f"[OCR Callback] Received callback: {json.dumps(data, ensure_ascii=False)[:500]}")

            # Validate token
            token = data.get('token')
            if token != OCR_CALLBACK_TOKEN:
                _logger.warning(f"[OCR Callback] Invalid token received")
                return {'success': False, 'error': 'Invalid token'}

            # Get record ID
            record_id = data.get('odoo_record_id')
            if not record_id:
                _logger.error("[OCR Callback] Missing odoo_record_id")
                return {'success': False, 'error': 'Missing odoo_record_id'}

            # Find the invoice record
            AccountMove = request.env['account.move'].sudo()
            invoice = AccountMove.browse(int(record_id))

            if not invoice.exists():
                _logger.error(f"[OCR Callback] Invoice not found: {record_id}")
                return {'success': False, 'error': f'Invoice {record_id} not found'}

            # Check status
            status = data.get('status', 'success')

            if status == 'success':
                # Update invoice with OCR data
                invoice.update_from_ocr_data(data)
                _logger.info(f"[OCR Callback] Invoice {record_id} updated successfully")

                # Update batch progress if invoice is part of a batch
                self._update_batch_progress(invoice, success=True)

                return {'success': True, 'message': f'Invoice {record_id} updated'}

            elif status == 'failed':
                # Mark as failed
                error_msg = data.get('error_message', 'Unknown error')
                invoice.write({
                    'ocr_status': 'failed',
                    'ocr_error_message': error_msg,
                    'ocr_raw_data': json.dumps(data, ensure_ascii=False, indent=2),
                })
                _logger.warning(f"[OCR Callback] Invoice {record_id} OCR failed: {error_msg}")

                # Update batch progress if invoice is part of a batch
                self._update_batch_progress(invoice, success=False, error=error_msg)

                return {'success': True, 'message': f'Invoice {record_id} marked as failed'}

            else:
                return {'success': False, 'error': f'Unknown status: {status}'}

        except Exception as e:
            _logger.exception(f"[OCR Callback] Error processing callback: {e}")
            return {'success': False, 'error': str(e)}

    def _update_batch_progress(self, invoice, success=True, error=None):
        """
        Update batch progress when an invoice OCR completes via callback.

        Finds the batch that contains this invoice and updates its progress.
        """
        try:
            BatchProgress = request.env['ocr.batch.progress'].sudo()

            # Find batch that contains this invoice
            batch = BatchProgress.search([
                ('move_ids', 'in', [invoice.id]),
                ('state', 'in', ['queued', 'processing']),
            ], limit=1)

            if batch:
                # Start processing if still queued
                if batch.state == 'queued':
                    batch.start_processing()

                # Update progress
                batch.update_progress(
                    current_move=invoice,
                    success=success,
                    error=error
                )
                _logger.info(f"[OCR Callback] Updated batch {batch.id} progress: {batch.processed_count}/{batch.total_count}")

        except Exception as e:
            _logger.error(f"[OCR Callback] Error updating batch progress: {e}")

    @http.route('/api/ocr/status/<int:record_id>', type='json', auth='user', methods=['GET'])
    def ocr_status(self, record_id):
        """Get OCR status for a specific invoice"""
        try:
            invoice = request.env['account.move'].browse(record_id)
            if not invoice.exists():
                return {'success': False, 'error': 'Invoice not found'}

            return {
                'success': True,
                'data': {
                    'record_id': record_id,
                    'ocr_status': invoice.ocr_status,
                    'ocr_confidence': invoice.ocr_confidence,
                    'ocr_error_message': invoice.ocr_error_message,
                    'ocr_processed_at': str(invoice.ocr_processed_at) if invoice.ocr_processed_at else None,
                }
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    @http.route('/api/ocr/health', type='http', auth='none', methods=['GET'], csrf=False)
    def health_check(self):
        """Health check endpoint"""
        return Response(
            json.dumps({'status': 'ok', 'service': 'Odoo OCR Module'}),
            content_type='application/json',
            status=200
        )

    # ==================== Batch Progress API ====================

    @http.route('/api/ocr/batch/progress/<int:batch_id>', type='http', auth='user', methods=['GET'], csrf=False)
    def get_batch_progress(self, batch_id, **kwargs):
        """
        Get progress of a batch OCR job.

        Returns:
            JSON with progress information:
            {
                "success": true,
                "data": {
                    "batch_id": 1,
                    "state": "processing",
                    "total_count": 10,
                    "processed_count": 3,
                    "success_count": 3,
                    "failed_count": 0,
                    "progress_percent": 30.0,
                    "current_record": "Invoice #123",
                    "eta_display": "2m 30s",
                    "eta_seconds": 150
                }
            }
        """
        try:
            BatchProgress = request.env['ocr.batch.progress']
            batch = BatchProgress.browse(batch_id)

            if not batch.exists():
                return Response(
                    json.dumps({'success': False, 'error': 'Batch not found'}),
                    content_type='application/json',
                    status=404
                )

            return Response(
                json.dumps({'success': True, 'data': batch.get_status()}),
                content_type='application/json',
                status=200
            )

        except Exception as e:
            _logger.exception(f"[Batch Progress API] Error: {e}")
            return Response(
                json.dumps({'success': False, 'error': str(e)}),
                content_type='application/json',
                status=500
            )

    @http.route('/api/ocr/batch/active', type='http', auth='user', methods=['GET'], csrf=False)
    def get_active_batches(self, **kwargs):
        """
        Get all active batch OCR jobs for the current user.

        Returns:
            JSON list of active batches
        """
        try:
            BatchProgress = request.env['ocr.batch.progress']
            batches = BatchProgress.get_active_batches(user_id=request.env.user.id)

            return Response(
                json.dumps({'success': True, 'data': batches}),
                content_type='application/json',
                status=200
            )

        except Exception as e:
            _logger.exception(f"[Batch Progress API] Error: {e}")
            return Response(
                json.dumps({'success': False, 'error': str(e)}),
                content_type='application/json',
                status=500
            )

    @http.route('/api/ocr/batch/cancel/<int:batch_id>', type='http', auth='user', methods=['POST'], csrf=False)
    def cancel_batch(self, batch_id, **kwargs):
        """Cancel a batch OCR job."""
        try:
            BatchProgress = request.env['ocr.batch.progress']
            batch = BatchProgress.browse(batch_id)

            if not batch.exists():
                return Response(
                    json.dumps({'success': False, 'error': 'Batch not found'}),
                    content_type='application/json',
                    status=404
                )

            # Only allow cancelling own batches
            if batch.user_id.id != request.env.user.id:
                return Response(
                    json.dumps({'success': False, 'error': 'Not authorized'}),
                    content_type='application/json',
                    status=403
                )

            batch.cancel()
            return Response(
                json.dumps({'success': True, 'message': 'Batch cancelled'}),
                content_type='application/json',
                status=200
            )

        except Exception as e:
            _logger.exception(f"[Batch Progress API] Cancel error: {e}")
            return Response(
                json.dumps({'success': False, 'error': str(e)}),
                content_type='application/json',
                status=500
            )
