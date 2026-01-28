/** @odoo-module **/

import { browser } from "@web/core/browser/browser";

/**
 * OCR Batch Progress Tracker
 * Shows real-time progress of batch OCR processing
 * Displays: total count, processed count, success/failed, ETA
 *
 * Uses both:
 * - Bus notifications for instant updates
 * - HTTP polling as fallback
 */

class OcrBatchProgress {
    constructor() {
        this.activeBatches = new Map();
        this.pollInterval = 2000; // 2 seconds (fallback)
        this.pollTimer = null;
        this.busChannel = null;
    }

    start() {
        // Check for active batches on page load
        this.checkActiveBatches();

        // Subscribe to bus for real-time updates
        this.subscribeToBus();

        // Start polling as fallback
        this.startPolling();
    }

    subscribeToBus() {
        // Try to subscribe to Odoo bus for real-time updates
        try {
            if (typeof odoo !== 'undefined' && odoo.bus) {
                // Get current user ID from session
                const userId = odoo.session_info?.uid || odoo.user_id;
                if (userId) {
                    this.busChannel = `ocr_batch_progress_${userId}`;

                    // Subscribe to the bus channel
                    odoo.bus.on('notification', this, this.handleBusNotification.bind(this));
                    console.log('[OCR Batch] Subscribed to bus channel:', this.busChannel);
                }
            }
        } catch (e) {
            console.warn('[OCR Batch] Could not subscribe to bus, using polling only:', e);
        }
    }

    handleBusNotification(notifications) {
        if (!Array.isArray(notifications)) {
            notifications = [notifications];
        }

        for (const notification of notifications) {
            if (notification.type === 'ocr_batch_progress') {
                const data = notification.payload || notification;
                if (data.batch_id && data.progress) {
                    console.log('[OCR Batch] Received bus update for batch', data.batch_id);
                    this.showBatchProgress(data.progress);
                }
            }
        }
    }

    async checkActiveBatches() {
        try {
            const response = await fetch('/api/ocr/batch/active', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            const data = await response.json();
            if (data.success && data.data.length > 0) {
                data.data.forEach(batch => this.showBatchProgress(batch));
            }
        } catch (error) {
            console.error('[OCR Batch] Error checking active batches:', error);
        }
    }

    startPolling() {
        if (this.pollTimer) return;

        this.pollTimer = setInterval(() => {
            if (this.activeBatches.size === 0) {
                this.stopPolling();
                return;
            }

            this.activeBatches.forEach((_, batchId) => {
                this.fetchBatchProgress(batchId);
            });
        }, this.pollInterval);
    }

    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    async fetchBatchProgress(batchId) {
        try {
            const response = await fetch(`/api/ocr/batch/progress/${batchId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            const data = await response.json();
            if (data.success) {
                this.updateBatchProgress(batchId, data.data);
            }
        } catch (error) {
            console.error(`[OCR Batch] Error fetching batch ${batchId}:`, error);
        }
    }

    showBatchProgress(batch) {
        // Create floating progress widget if not exists
        let widget = document.getElementById(`ocr-batch-widget-${batch.batch_id}`);

        if (!widget) {
            widget = this.createWidget(batch);
            document.body.appendChild(widget);
            this.activeBatches.set(batch.batch_id, true);
            this.startPolling();
        }

        this.updateWidget(widget, batch);
    }

    createWidget(batch) {
        const widget = document.createElement('div');
        widget.id = `ocr-batch-widget-${batch.batch_id}`;
        widget.className = 'ocr-batch-widget';
        widget.innerHTML = `
            <div class="ocr-batch-header">
                <span class="ocr-batch-title">
                    <i class="fa fa-file-text-o"></i> OCR Batch #${batch.batch_id}
                </span>
                <button class="ocr-batch-close" title="Hide (processing continues)">&times;</button>
            </div>
            <div class="ocr-batch-body">
                <div class="ocr-batch-progress-bar">
                    <div class="ocr-batch-progress-fill" style="width: ${batch.progress_percent}%"></div>
                </div>
                <div class="ocr-batch-stats">
                    <span class="ocr-batch-count">
                        <strong>${batch.processed_count}</strong> / ${batch.total_count}
                    </span>
                    <span class="ocr-batch-eta">${batch.eta_display}</span>
                </div>
                <div class="ocr-batch-details">
                    <span class="ocr-batch-success">
                        <i class="fa fa-check text-success"></i> ${batch.success_count}
                    </span>
                    <span class="ocr-batch-failed">
                        <i class="fa fa-times text-danger"></i> ${batch.failed_count}
                    </span>
                </div>
                <div class="ocr-batch-current">
                    ${batch.current_record ? `Processing: ${batch.current_record}` : ''}
                </div>
            </div>
            <div class="ocr-batch-footer">
                <button class="ocr-batch-cancel btn btn-sm btn-outline-secondary">Cancel</button>
            </div>
        `;

        // Event handlers
        widget.querySelector('.ocr-batch-close').addEventListener('click', () => {
            widget.style.display = 'none';
        });

        widget.querySelector('.ocr-batch-cancel').addEventListener('click', () => {
            this.cancelBatch(batch.batch_id);
        });

        return widget;
    }

    updateWidget(widget, batch) {
        // Update progress bar
        const fill = widget.querySelector('.ocr-batch-progress-fill');
        fill.style.width = `${batch.progress_percent}%`;

        // Update counts
        widget.querySelector('.ocr-batch-count').innerHTML =
            `<strong>${batch.processed_count}</strong> / ${batch.total_count}`;
        widget.querySelector('.ocr-batch-eta').textContent = batch.eta_display;
        widget.querySelector('.ocr-batch-success i + text, .ocr-batch-success').innerHTML =
            `<i class="fa fa-check text-success"></i> ${batch.success_count}`;
        widget.querySelector('.ocr-batch-failed').innerHTML =
            `<i class="fa fa-times text-danger"></i> ${batch.failed_count}`;

        // Update current record
        const current = widget.querySelector('.ocr-batch-current');
        current.textContent = batch.current_record ? `Processing: ${batch.current_record}` : '';

        // Check if completed
        if (batch.state === 'done' || batch.state === 'failed' || batch.state === 'cancelled') {
            this.handleBatchComplete(batch.batch_id, batch);
        }
    }

    updateBatchProgress(batchId, batch) {
        const widget = document.getElementById(`ocr-batch-widget-${batchId}`);
        if (widget) {
            this.updateWidget(widget, batch);
        }
    }

    handleBatchComplete(batchId, batch) {
        const widget = document.getElementById(`ocr-batch-widget-${batchId}`);
        if (!widget) return;

        this.activeBatches.delete(batchId);

        // Update UI to show completion
        widget.classList.add('ocr-batch-complete');
        const header = widget.querySelector('.ocr-batch-title');

        if (batch.state === 'done') {
            header.innerHTML = `<i class="fa fa-check-circle text-success"></i> Batch #${batchId} Complete`;
            this.showToast(`Batch OCR complete! ${batch.success_count} succeeded, ${batch.failed_count} failed.`, 'success');
        } else if (batch.state === 'failed') {
            header.innerHTML = `<i class="fa fa-exclamation-circle text-danger"></i> Batch #${batchId} Failed`;
            this.showToast(`Batch OCR failed: ${batch.last_error}`, 'danger');
        } else if (batch.state === 'cancelled') {
            header.innerHTML = `<i class="fa fa-ban text-warning"></i> Batch #${batchId} Cancelled`;
        }

        // Hide cancel button
        const cancelBtn = widget.querySelector('.ocr-batch-cancel');
        if (cancelBtn) cancelBtn.style.display = 'none';

        // Auto-hide after 10 seconds and reload
        setTimeout(() => {
            widget.remove();
            if (batch.state === 'done' && batch.success_count > 0) {
                window.location.reload();
            }
        }, 10000);
    }

    async cancelBatch(batchId) {
        if (!confirm('Cancel this batch OCR job?')) return;

        try {
            const response = await fetch(`/api/ocr/batch/cancel/${batchId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const data = await response.json();
            if (data.success) {
                this.showToast('Batch cancelled', 'info');
                this.fetchBatchProgress(batchId);
            } else {
                this.showToast(`Failed to cancel: ${data.error}`, 'danger');
            }
        } catch (error) {
            console.error('[OCR Batch] Cancel error:', error);
            this.showToast('Failed to cancel batch', 'danger');
        }
    }

    showToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `ocr-toast ocr-toast-${type}`;
        toast.innerHTML = `
            <i class="fa ${type === 'success' ? 'fa-check-circle' :
                          type === 'danger' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
}

// Initialize on page load
const ocrBatch = new OcrBatchProgress();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ocrBatch.start());
} else {
    ocrBatch.start();
}

// Export for external access
window.OcrBatchProgress = ocrBatch;
