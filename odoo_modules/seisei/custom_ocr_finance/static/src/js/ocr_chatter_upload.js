/** @odoo-module **/

/**
 * OCR Upload Zone - Universal OCR for account.move and hr.expense
 * Supports paste, drag & drop, click upload
 * Auto-saves record if needed before uploading
 */

class OcrChatterUpload {
    constructor() {
        this.observer = null;
        this.uploadZone = null;
        this.isUploading = false;
        this.processingTimeout = null;
        this.currentModel = null; // 'account.move' or 'hr.expense'
    }

    start() {
        this.observer = new MutationObserver(() => this.checkAndInject());
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.checkAndInject();
        document.addEventListener('paste', (e) => this.handlePaste(e));
    }

    /**
     * Detect current model from URL and page elements
     */
    detectModel() {
        const url = window.location.href;

        // Check for account.move (invoices, bills, refunds)
        if (url.includes('account.move') ||
            url.includes('/bills/') ||
            url.includes('/invoices/') ||
            url.includes('/refunds/') ||
            document.querySelector('.o_field_widget[name="move_type"]')) {
            return 'account.move';
        }

        // Check for hr.expense
        if (url.includes('hr.expense') ||
            url.includes('/expenses/') ||
            document.querySelector('.o_field_widget[name="total_amount_company"]') ||
            document.querySelector('.o_field_widget[name="employee_id"]')) {
            // Make sure it's expense page, not just any page with employee_id
            if (document.querySelector('.o_field_widget[name="total_amount"]') ||
                document.querySelector('.o_field_widget[name="product_id"]')) {
                return 'hr.expense';
            }
        }

        return null;
    }

    checkAndInject() {
        this.currentModel = this.detectModel();
        if (!this.currentModel) return;

        const chatter = document.querySelector('.o-mail-Chatter, .o_Chatter');
        if (!chatter || chatter.querySelector('.ocr-upload-zone')) return;

        this.injectUploadZone(chatter);
    }

    getUploadConfig() {
        if (this.currentModel === 'hr.expense') {
            return {
                icon: 'fa-receipt',
                title: 'Upload Receipt',
                subtitle: 'Drag & drop, paste, or click<br/>Auto-extract expense data',
            };
        }
        // Default for account.move
        return {
            icon: 'fa-file-invoice',
            title: 'Upload Invoice',
            subtitle: 'Drag & drop, paste, or click<br/>Auto-compress to 100KB',
        };
    }

    injectUploadZone(chatter) {
        const config = this.getUploadConfig();
        const container = document.createElement('div');
        container.className = 'ocr-upload-zone-container';
        container.innerHTML = `
            <div class="ocr-section-header"><i class="fa fa-camera"></i> OCR UPLOAD</div>
            <div class="ocr-upload-zone">
                <div class="ocr-upload-content">
                    <div class="ocr-upload-icon"><i class="fa ${config.icon}"></i></div>
                    <div class="ocr-upload-title">${config.title}</div>
                    <div class="ocr-upload-subtitle">${config.subtitle}</div>
                    <div class="ocr-shortcut-hint"><kbd>Ctrl</kbd>+<kbd>V</kbd> to paste</div>
                </div>
                <div class="ocr-upload-progress" style="display:none">
                    <div class="ocr-progress-bar"><div class="ocr-progress-fill"></div></div>
                    <div class="ocr-progress-text">Processing...</div>
                </div>
            </div>`;

        chatter.insertBefore(container, chatter.firstChild);
        this.uploadZone = container.querySelector('.ocr-upload-zone');
        this.setupEvents();
    }

    setupEvents() {
        if (!this.uploadZone) return;

        this.uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadZone.classList.add('dragging');
        });

        this.uploadZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.uploadZone.classList.remove('dragging');
        });

        this.uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadZone.classList.remove('dragging');
            if (e.dataTransfer?.files?.[0]) this.processFile(e.dataTransfer.files[0]);
        });

        this.uploadZone.addEventListener('click', () => {
            if (this.isUploading) return;
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,application/pdf';
            input.onchange = (e) => e.target.files?.[0] && this.processFile(e.target.files[0]);
            input.click();
        });
    }

    handlePaste(e) {
        this.currentModel = this.detectModel();
        if (!this.currentModel) return;

        const active = document.activeElement;
        if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) this.processFile(file);
                break;
            }
        }
    }

    async processFile(file) {
        // Reset stuck state after 60 seconds
        if (this.processingTimeout) clearTimeout(this.processingTimeout);

        if (this.isUploading) {
            console.log('OCR already processing, please wait...');
            return;
        }

        this.isUploading = true;
        this.processingTimeout = setTimeout(() => {
            this.isUploading = false;
            this.showProgress(false);
        }, 60000);

        this.showProgress(true, 5, 'Preparing...');

        try {
            let resId = this.getRecordId();

            if (!resId) {
                this.showProgress(true, 10, 'Saving record...');
                resId = await this.saveRecord();
                if (!resId) throw new Error('Please save the record first');
            }

            let processedFile = file;
            if (file.type.startsWith('image/') && file.size > 100 * 1024) {
                this.showProgress(true, 25, 'Compressing...');
                processedFile = await this.compressImage(file, 100 * 1024);
            }

            this.showProgress(true, 45, 'Uploading...');
            const base64 = await this.fileToBase64(processedFile);

            this.showProgress(true, 65, 'Running OCR...');

            // Call appropriate RPC based on model
            const rpcConfig = this.getRpcConfig(resId, base64, processedFile);
            const result = await this.callRpc(rpcConfig.url, rpcConfig.params);

            this.showProgress(true, 100, 'Complete!');

            if (result?.success !== false) {
                this.toast('OCR completed!', 'success');
                setTimeout(() => window.location.reload(), 500);
            } else {
                throw new Error(result?.error || 'OCR failed');
            }
        } catch (error) {
            console.error('OCR error:', error);
            this.toast('Error: ' + error.message, 'danger');
            this.showProgress(false);
        } finally {
            this.isUploading = false;
            if (this.processingTimeout) clearTimeout(this.processingTimeout);
        }
    }

    getRpcConfig(resId, base64, file) {
        const kwargs = {
            image_data: base64.split(',')[1],
            filename: file.name || 'image.jpg',
            mimetype: file.type || 'image/jpeg',
        };

        if (this.currentModel === 'hr.expense') {
            return {
                url: '/web/dataset/call_kw/hr.expense/action_upload_and_ocr',
                params: {
                    model: 'hr.expense',
                    method: 'action_upload_and_ocr',
                    args: [[resId]],
                    kwargs,
                },
            };
        }

        // Default: account.move
        return {
            url: '/web/dataset/call_kw/account.move/action_upload_and_ocr',
            params: {
                model: 'account.move',
                method: 'action_upload_and_ocr',
                args: [[resId]],
                kwargs,
            },
        };
    }

    getRecordId() {
        // URL patterns
        for (const p of [/[?&]id=(\d+)/, /\/(\d+)(?:[?#]|$)/, /#.*id=(\d+)/]) {
            const m = window.location.href.match(p);
            if (m?.[1]) return parseInt(m[1]);
        }
        if (window.location.href.includes('/new')) return null;

        const form = document.querySelector('.o_form_view');
        const id = form?.dataset?.resId;
        return id && id !== 'false' ? parseInt(id) : null;
    }

    async saveRecord() {
        const btn = document.querySelector('.o_form_button_save, button[data-hotkey="s"]');
        if (btn && !btn.disabled) {
            btn.click();
            await new Promise(r => setTimeout(r, 1500));
            return this.getRecordId();
        }
        return null;
    }

    showProgress(show, percent = 0, text = '') {
        if (!this.uploadZone) return;
        const content = this.uploadZone.querySelector('.ocr-upload-content');
        const progress = this.uploadZone.querySelector('.ocr-upload-progress');
        const fill = this.uploadZone.querySelector('.ocr-progress-fill');
        const txt = this.uploadZone.querySelector('.ocr-progress-text');

        if (show) {
            content && (content.style.display = 'none');
            progress && (progress.style.display = 'block');
            fill && (fill.style.width = percent + '%');
            txt && (txt.textContent = text);
        } else {
            content && (content.style.display = 'block');
            progress && (progress.style.display = 'none');
        }
    }

    toast(msg, type) {
        const t = document.createElement('div');
        t.className = 'ocr-toast ocr-toast-' + type;
        t.innerHTML = '<i class="fa ' + (type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle') + '"></i><span>' + msg + '</span>';
        document.body.appendChild(t);
        setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 300); }, 3000);
    }

    async compressImage(file, maxSize) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height;
                    if (w > 1600 || h > 1600) {
                        const r = Math.min(1600/w, 1600/h);
                        w = Math.round(w * r);
                        h = Math.round(h * r);
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFF';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);

                    let q = 0.8;
                    const compress = () => canvas.toBlob(b => {
                        if (b.size <= maxSize || q <= 0.1) resolve(new File([b], 'img.jpg', {type: 'image/jpeg'}));
                        else { q -= 0.1; compress(); }
                    }, 'image/jpeg', q);
                    compress();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async callRpc(url, params) {
        const res = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({jsonrpc: '2.0', method: 'call', params, id: Date.now()}),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.data?.message || data.error.message);
        return data.result;
    }
}

const ocr = new OcrChatterUpload();
document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', () => ocr.start())
    : ocr.start();
