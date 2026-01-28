# -*- coding: utf-8 -*-
"""
OCR Batch Progress Tracking Model

Tracks real-time progress of batch OCR processing for UI display.
Shows total count, processed count, ETA, and per-record status.
"""

import logging
from datetime import datetime, timedelta
from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class OcrBatchProgress(models.Model):
    _name = "ocr.batch.progress"
    _description = "OCR Batch Progress"
    _order = "create_date desc"

    # Batch status
    state = fields.Selection([
        ("queued", "Queued"),
        ("processing", "Processing"),
        ("done", "Done"),
        ("failed", "Failed"),
        ("cancelled", "Cancelled"),
    ], string="State", default="queued", required=True)

    # Progress counts
    total_count = fields.Integer("Total Records", default=0)
    processed_count = fields.Integer("Processed", default=0)
    success_count = fields.Integer("Succeeded", default=0)
    failed_count = fields.Integer("Failed", default=0)

    # Computed progress
    progress_percent = fields.Float("Progress %", compute="_compute_progress", store=False)

    # Timing
    started_at = fields.Datetime("Started At")
    completed_at = fields.Datetime("Completed At")
    avg_time_per_record = fields.Float("Avg Time (s)", default=0)
    eta_seconds = fields.Integer("ETA (seconds)", compute="_compute_eta", store=False)
    eta_display = fields.Char("ETA", compute="_compute_eta", store=False)

    # Current processing
    current_record_id = fields.Integer("Current Record ID")
    current_record_name = fields.Char("Current Record")

    # Error tracking
    last_error = fields.Text("Last Error")

    # Related records
    move_ids = fields.Many2many(
        "account.move",
        "ocr_batch_progress_move_rel",
        "batch_id",
        "move_id",
        string="Invoices"
    )

    # User who started the batch
    user_id = fields.Many2one("res.users", "Started By", default=lambda self: self.env.user)

    @api.depends("total_count", "processed_count")
    def _compute_progress(self):
        for record in self:
            if record.total_count > 0:
                record.progress_percent = (record.processed_count / record.total_count) * 100
            else:
                record.progress_percent = 0

    @api.depends("total_count", "processed_count", "avg_time_per_record")
    def _compute_eta(self):
        for record in self:
            remaining = record.total_count - record.processed_count
            if remaining > 0 and record.avg_time_per_record > 0:
                eta_seconds = int(remaining * record.avg_time_per_record)
                record.eta_seconds = eta_seconds

                # Format as human readable
                if eta_seconds < 60:
                    record.eta_display = f"{eta_seconds} seconds"
                elif eta_seconds < 3600:
                    minutes = eta_seconds // 60
                    secs = eta_seconds % 60
                    record.eta_display = f"{minutes}m {secs}s"
                else:
                    hours = eta_seconds // 3600
                    minutes = (eta_seconds % 3600) // 60
                    record.eta_display = f"{hours}h {minutes}m"
            else:
                record.eta_seconds = 0
                record.eta_display = "Calculating..."

    @api.model
    def create_batch(self, move_ids):
        """
        Create a new batch progress record for the given move IDs.

        Args:
            move_ids: List of account.move IDs

        Returns:
            ocr.batch.progress record
        """
        moves = self.env["account.move"].browse(move_ids)
        valid_moves = moves.filtered(
            lambda m: m.message_main_attachment_id and
                      m.ocr_status not in ("processing", "done") and
                      m.move_type in ("in_invoice", "in_refund", "out_invoice", "out_refund")
        )

        if not valid_moves:
            return False

        batch = self.create({
            "state": "queued",
            "total_count": len(valid_moves),
            "move_ids": [(6, 0, valid_moves.ids)],
        })

        # Mark moves as queued with batch reference
        valid_moves.write({
            "ocr_status": "processing",
            "ocr_error_message": f"Batch #{batch.id}: Queued for processing...",
        })

        _logger.info(f"[OCR Batch] Created batch {batch.id} with {len(valid_moves)} records")
        return batch

    def start_processing(self):
        """Mark batch as started."""
        self.ensure_one()
        self.write({
            "state": "processing",
            "started_at": fields.Datetime.now(),
        })
        self.env.cr.commit()

    def update_progress(self, current_move=None, success=True, error=None):
        """
        Update batch progress after processing a record.

        Args:
            current_move: account.move record being processed
            success: Whether the processing succeeded
            error: Error message if failed
        """
        self.ensure_one()

        vals = {
            "processed_count": self.processed_count + 1,
        }

        if success:
            vals["success_count"] = self.success_count + 1
        else:
            vals["failed_count"] = self.failed_count + 1
            if error:
                vals["last_error"] = str(error)[:500]

        if current_move:
            vals["current_record_id"] = current_move.id
            vals["current_record_name"] = current_move.name or f"Invoice #{current_move.id}"

        # Calculate average time per record
        if self.started_at and vals["processed_count"] > 0:
            elapsed = (datetime.now() - self.started_at).total_seconds()
            vals["avg_time_per_record"] = elapsed / vals["processed_count"]

        # Check if completed
        if vals["processed_count"] >= self.total_count:
            vals["state"] = "done"
            vals["completed_at"] = fields.Datetime.now()

        self.write(vals)
        self.env.cr.commit()

        # Send bus notification for real-time progress updates
        self._send_progress_notification()

    def mark_failed(self, error=None):
        """Mark the entire batch as failed."""
        self.ensure_one()
        self.write({
            "state": "failed",
            "completed_at": fields.Datetime.now(),
            "last_error": str(error)[:500] if error else "Unknown error",
        })
        self.env.cr.commit()

    def cancel(self):
        """Cancel the batch processing."""
        self.ensure_one()
        if self.state in ("queued", "processing"):
            self.write({
                "state": "cancelled",
                "completed_at": fields.Datetime.now(),
            })
            # Reset remaining invoices
            remaining = self.move_ids.filtered(lambda m: m.ocr_status == "processing")
            remaining.write({
                "ocr_status": "pending",
                "ocr_error_message": "Batch cancelled by user",
            })
            self.env.cr.commit()

    def get_status(self):
        """
        Get batch status as dict for API response.

        Returns:
            dict with progress information
        """
        self.ensure_one()

        # Get failed records info
        failed_records = []
        for move in self.move_ids.filtered(lambda m: m.ocr_status == "failed"):
            failed_records.append({
                "id": move.id,
                "name": move.name or f"Invoice #{move.id}",
                "error": move.ocr_error_message or "Unknown error",
            })

        return {
            "batch_id": self.id,
            "state": self.state,
            "total_count": self.total_count,
            "processed_count": self.processed_count,
            "success_count": self.success_count,
            "failed_count": self.failed_count,
            "progress_percent": round(self.progress_percent, 1),
            "current_record": self.current_record_name,
            "eta_display": self.eta_display,
            "eta_seconds": self.eta_seconds,
            "avg_time_per_record": round(self.avg_time_per_record, 2),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "last_error": self.last_error,
            "failed_records": failed_records[:10],  # Limit to first 10
        }

    @api.model
    def get_active_batches(self, user_id=None):
        """
        Get active batch jobs for a user.

        Args:
            user_id: Optional user ID to filter by

        Returns:
            List of batch status dicts
        """
        domain = [("state", "in", ("queued", "processing"))]
        if user_id:
            domain.append(("user_id", "=", user_id))

        batches = self.search(domain, order="create_date desc", limit=10)
        return [b.get_status() for b in batches]

    @api.model
    def cleanup_old_batches(self, days=7):
        """Remove old completed batch records."""
        cutoff = fields.Datetime.now() - timedelta(days=days)
        old_batches = self.search([
            ("state", "in", ("done", "failed", "cancelled")),
            ("create_date", "<", cutoff),
        ])
        old_batches.unlink()
        _logger.info(f"[OCR Batch] Cleaned up {len(old_batches)} old batch records")

    def _send_progress_notification(self):
        """
        Send bus notification to update UI in real-time.
        Uses Odoo's bus to push progress updates to the user's browser.
        """
        self.ensure_one()
        try:
            # Get the bus for the user who started the batch
            channel = f"ocr_batch_progress_{self.user_id.id}"

            # Prepare notification data
            notification_data = {
                "type": "ocr_batch_progress",
                "batch_id": self.id,
                "progress": self.get_status(),
            }

            # Send via Odoo bus
            self.env["bus.bus"]._sendone(
                channel,
                "ocr_batch_progress",
                notification_data
            )

            _logger.debug(f"[OCR Batch] Sent progress notification for batch {self.id}")

        except Exception as e:
            # Don't fail the main process if notification fails
            _logger.warning(f"[OCR Batch] Failed to send notification: {e}")
