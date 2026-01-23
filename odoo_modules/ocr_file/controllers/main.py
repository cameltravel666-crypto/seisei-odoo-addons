# -*- coding: utf-8 -*-

import json
import logging
import os
from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)

# Token for authentication
OCR_CALLBACK_TOKEN = os.getenv("OCR_CALLBACK_TOKEN", "seisei_ocr_token_2024")


class OcrFileController(http.Controller):

    @http.route('/api/ocr_file/callback', type='json', auth='none', methods=['POST'], csrf=False)
    def ocr_file_callback(self, **kwargs):
        """
        Webhook endpoint for OCR service callback.

        Expected Payload:
        {
            "odoo_id": 12345,
            "odoo_model": "ocr.file.source",  // or "ocr.file.task"
            "task_id": 123,  // parent task id
            "status": "success",  // or "failed"
            "token": "...",
            "extracted_data": {
                "invoice_date": "2023-12-25",
                "total_amount": 150.00,
                "currency": "JPY",
                "vendor_name": "Company Name",
                "tax_id": "T1234567890123",
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
            _logger.info(f"[OCR File Callback] Received callback: {json.dumps(data, ensure_ascii=False)[:500]}")

            # Validate token
            token = data.get('token')
            if token != OCR_CALLBACK_TOKEN:
                _logger.warning(f"[OCR File Callback] Invalid token received")
                return {'success': False, 'error': 'Invalid token'}

            # Get record ID and model
            record_id = data.get('odoo_id')
            model_name = data.get('odoo_model', 'ocr.file.source')
            task_id = data.get('task_id')

            if not record_id:
                _logger.error("[OCR File Callback] Missing odoo_id")
                return {'success': False, 'error': 'Missing odoo_id'}

            # Handle based on model type
            if model_name == 'ocr.file.source':
                return self._handle_source_callback(record_id, task_id, data)
            else:
                # Legacy support for ocr.file.task
                return self._handle_task_callback(record_id, data)

        except Exception as e:
            _logger.exception(f"[OCR File Callback] Error processing callback: {e}")
            return {'success': False, 'error': str(e)}

    def _handle_source_callback(self, source_id, task_id, data):
        """Handle callback for ocr.file.source model"""
        OcrSource = request.env['ocr.file.source'].sudo()
        source = OcrSource.browse(int(source_id))

        if not source.exists():
            _logger.error(f"[OCR File Callback] Source not found: {source_id}")
            return {'success': False, 'error': f'Source {source_id} not found'}

        status = data.get('status', 'success')
        extracted = data.get('extracted_data', {})

        if status == 'success':
            update_vals = {
                'state': 'done',
                'ocr_raw_data': json.dumps(data, ensure_ascii=False, indent=2),
                'extracted_invoice_number': extracted.get('invoice_number'),
                'extracted_vendor_name': extracted.get('vendor_name'),
                'extracted_tax_id': extracted.get('tax_id'),
                'extracted_total_amount': extracted.get('total_amount', 0),
                'extracted_currency': extracted.get('currency', 'JPY'),
                'ocr_error_message': False,
            }

            # Parse invoice date
            invoice_date = extracted.get('invoice_date')
            if invoice_date:
                try:
                    update_vals['extracted_invoice_date'] = invoice_date
                except Exception:
                    _logger.warning(f"[OCR File Callback] Invalid date format: {invoice_date}")

            # Store line items as JSON
            line_items = extracted.get('line_items')
            if line_items:
                update_vals['extracted_line_items'] = json.dumps(line_items, ensure_ascii=False)

            source.write(update_vals)
            _logger.info(f"[OCR File Callback] Source {source_id} updated successfully")

        elif status == 'failed':
            error_msg = data.get('error_message', 'Unknown error')
            source.write({
                'state': 'failed',
                'ocr_error_message': error_msg,
                'ocr_raw_data': json.dumps(data, ensure_ascii=False, indent=2),
            })
            _logger.warning(f"[OCR File Callback] Source {source_id} OCR failed: {error_msg}")

        # Check if all sources are done and update parent task
        if source.task_id:
            source.task_id._check_all_sources_done()

        return {'success': True, 'message': f'Source {source_id} updated'}

    def _handle_task_callback(self, task_id, data):
        """Handle callback for ocr.file.task model (legacy)"""
        OcrTask = request.env['ocr.file.task'].sudo()
        task = OcrTask.browse(int(task_id))

        if not task.exists():
            _logger.error(f"[OCR File Callback] Task not found: {task_id}")
            return {'success': False, 'error': f'Task {task_id} not found'}

        status = data.get('status', 'success')

        if status == 'success':
            task.write({
                'state': 'done',
                'ocr_processed_at': request.env['fields'].Datetime.now(),
            })
            _logger.info(f"[OCR File Callback] Task {task_id} updated successfully")
            return {'success': True, 'message': f'Task {task_id} updated'}

        elif status == 'failed':
            error_msg = data.get('error_message', 'Unknown error')
            task.write({
                'state': 'failed',
                'ocr_error_message': error_msg,
            })
            _logger.warning(f"[OCR File Callback] Task {task_id} OCR failed: {error_msg}")
            return {'success': True, 'message': f'Task {task_id} marked as failed'}

        return {'success': False, 'error': f'Unknown status: {status}'}

    @http.route('/api/ocr_file/status/<int:record_id>', type='json', auth='user', methods=['GET'])
    def ocr_file_status(self, record_id):
        """Get OCR status for a specific task"""
        try:
            task = request.env['ocr.file.task'].browse(record_id)
            if not task.exists():
                return {'success': False, 'error': 'Task not found'}

            sources_status = []
            for source in task.source_file_ids:
                sources_status.append({
                    'id': source.id,
                    'filename': source.source_filename,
                    'state': source.state,
                    'error': source.ocr_error_message,
                })

            return {
                'success': True,
                'data': {
                    'record_id': record_id,
                    'state': task.state,
                    'ocr_error_message': task.ocr_error_message,
                    'ocr_processed_at': str(task.ocr_processed_at) if task.ocr_processed_at else None,
                    'has_output': task.has_output,
                    'source_files': sources_status,
                }
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    @http.route('/api/ocr_file/health', type='http', auth='none', methods=['GET'], csrf=False)
    def health_check(self):
        """Health check endpoint"""
        return Response(
            json.dumps({'status': 'ok', 'service': 'Odoo OCR File Module'}),
            content_type='application/json',
            status=200
        )

    @http.route('/api/ocr_file/upload_files/<int:task_id>', type='http', auth='user', methods=['POST'], csrf=False)
    def upload_files(self, task_id, **kwargs):
        """
        Upload multiple files to a task.
        Accepts multipart/form-data with multiple files under 'files' key.
        """
        import base64

        try:
            task = request.env['ocr.file.task'].browse(task_id)
            if not task.exists():
                return Response(
                    json.dumps({'success': False, 'error': 'Task not found'}),
                    content_type='application/json',
                    status=404
                )

            # Get uploaded files
            files = request.httprequest.files.getlist('files')
            if not files:
                return Response(
                    json.dumps({'success': False, 'error': 'No files uploaded'}),
                    content_type='application/json',
                    status=400
                )

            OcrSource = request.env['ocr.file.source']
            created_count = 0

            for idx, file in enumerate(files):
                if file and file.filename:
                    file_data = file.read()
                    b64_data = base64.b64encode(file_data).decode('utf-8')

                    OcrSource.create({
                        'task_id': task_id,
                        'source_file': b64_data,
                        'source_filename': file.filename,
                        'state': 'pending',
                        'sequence': 10 + idx,
                    })
                    created_count += 1

            _logger.info(f"[OCR File] Uploaded {created_count} files to task {task_id}")

            return Response(
                json.dumps({
                    'success': True,
                    'message': f'{created_count} file(s) uploaded',
                    'count': created_count
                }),
                content_type='application/json',
                status=200
            )

        except Exception as e:
            _logger.exception(f"[OCR File] Upload error: {e}")
            return Response(
                json.dumps({'success': False, 'error': str(e)}),
                content_type='application/json',
                status=500
            )
