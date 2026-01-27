/** @odoo-module **/

/**
 * Product Image Clipboard - Paste images directly to product
 * Supports paste, drag & drop, click upload
 */

class ProductImageClipboard {
    constructor() {
        this.observer = null;
        this.uploadZone = null;
        this.isUploading = false;
    }

    start() {
        this.observer = new MutationObserver(() => this.checkAndInject());
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.checkAndInject();
        document.addEventListener('paste', (e) => this.handlePaste(e));
    }

    /**
     * Detect if we're on a product form page
     */
    isProductPage() {
        const url = window.location.href;

        // Check URL patterns for product pages
        if (url.includes('product.template') ||
            url.includes('product.product') ||
            url.includes('/products/') ||
            url.includes('model=product')) {
            return true;
        }

        // Check for product-specific fields
        if (document.querySelector('.o_field_widget[name="list_price"]') ||
            document.querySelector('.o_field_widget[name="standard_price"]') ||
            document.querySelector('.o_field_widget[name="categ_id"]')) {
            // Make sure it's a product page by checking for product name field
            if (document.querySelector('.o_field_widget[name="name"]') &&
                document.querySelector('.o_field_widget[name="type"]')) {
                return true;
            }
        }

        return false;
    }

    checkAndInject() {
        if (!this.isProductPage()) return;

        // Find the product image widget area
        const imageWidget = document.querySelector('.o_field_widget[name="image_1920"]');
        if (!imageWidget) return;

        // Check if already injected
        if (imageWidget.closest('.product-image-container')?.querySelector('.product-image-upload-zone')) return;

        this.injectUploadZone(imageWidget);
    }

    injectUploadZone(imageWidget) {
        // Create wrapper if not exists
        let container = imageWidget.closest('.product-image-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'product-image-container';
            imageWidget.parentNode.insertBefore(container, imageWidget);
            container.appendChild(imageWidget);
        }

        // Create upload zone
        const uploadZone = document.createElement('div');
        uploadZone.className = 'product-image-upload-zone';
        uploadZone.innerHTML = `
            <div class="piu-content">
                <div class="piu-icon"><i class="fa fa-paste"></i></div>
                <div class="piu-text">Ctrl+V</div>
            </div>
            <div class="piu-progress" style="display:none">
                <div class="piu-spinner"></div>
            </div>
        `;

        container.appendChild(uploadZone);
        this.uploadZone = uploadZone;
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
            if (e.dataTransfer?.files?.[0]) {
                const file = e.dataTransfer.files[0];
                if (file.type.startsWith('image/')) {
                    this.processImage(file);
                }
            }
        });

        this.uploadZone.addEventListener('click', () => {
            if (this.isUploading) return;
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                if (e.target.files?.[0]) {
                    this.processImage(e.target.files[0]);
                }
            };
            input.click();
        });
    }

    handlePaste(e) {
        if (!this.isProductPage()) return;

        // Don't capture if typing in input/textarea
        const active = document.activeElement;
        if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable) {
            return;
        }

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) this.processImage(file);
                break;
            }
        }
    }

    async processImage(file) {
        if (this.isUploading) {
            this.toast('Processing...', 'warning');
            return;
        }

        this.isUploading = true;
        this.showProgress(true);

        try {
            let resId = this.getRecordId();
            let model = this.getModel();

            if (!resId) {
                // Try to save record first
                resId = await this.saveRecord();
                if (!resId) {
                    throw new Error('Please save the product first');
                }
            }

            // Compress image if needed
            let processedFile = file;
            if (file.size > 500 * 1024) {
                processedFile = await this.compressImage(file, 500 * 1024);
            }

            // Convert to base64
            const base64 = await this.fileToBase64(processedFile);
            const base64Data = base64.split(',')[1];

            // Update product image via RPC
            await this.callRpc('/web/dataset/call_kw/' + model + '/write', {
                model: model,
                method: 'write',
                args: [[resId], { image_1920: base64Data }],
                kwargs: {},
            });

            this.toast('Image updated!', 'success');

            // Reload to show new image
            setTimeout(() => window.location.reload(), 300);

        } catch (error) {
            console.error('Image upload error:', error);
            this.toast('Error: ' + error.message, 'danger');
        } finally {
            this.isUploading = false;
            this.showProgress(false);
        }
    }

    getModel() {
        const url = window.location.href;
        if (url.includes('product.product')) return 'product.product';
        return 'product.template';
    }

    getRecordId() {
        // URL patterns
        const patterns = [/[?&]id=(\d+)/, /\/(\d+)(?:[?#]|$)/, /#.*id=(\d+)/];
        for (const p of patterns) {
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

    showProgress(show) {
        if (!this.uploadZone) return;
        const content = this.uploadZone.querySelector('.piu-content');
        const progress = this.uploadZone.querySelector('.piu-progress');

        if (show) {
            content && (content.style.display = 'none');
            progress && (progress.style.display = 'flex');
            this.uploadZone.classList.add('uploading');
        } else {
            content && (content.style.display = 'flex');
            progress && (progress.style.display = 'none');
            this.uploadZone.classList.remove('uploading');
        }
    }

    toast(msg, type) {
        const t = document.createElement('div');
        t.className = 'piu-toast piu-toast-' + type;
        const icon = type === 'success' ? 'fa-check-circle' :
                     type === 'warning' ? 'fa-exclamation-triangle' : 'fa-exclamation-circle';
        t.innerHTML = '<i class="fa ' + icon + '"></i><span>' + msg + '</span>';
        document.body.appendChild(t);
        setTimeout(() => {
            t.classList.add('fade-out');
            setTimeout(() => t.remove(), 300);
        }, 2500);
    }

    async compressImage(file, maxSize) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height;

                    // Resize if too large
                    const maxDim = 1024;
                    if (w > maxDim || h > maxDim) {
                        const r = Math.min(maxDim / w, maxDim / h);
                        w = Math.round(w * r);
                        h = Math.round(h * r);
                    }

                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFF';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);

                    let quality = 0.9;
                    const compress = () => canvas.toBlob(blob => {
                        if (blob.size <= maxSize || quality <= 0.1) {
                            resolve(new File([blob], 'product_image.jpg', { type: 'image/jpeg' }));
                        } else {
                            quality -= 0.1;
                            compress();
                        }
                    }, 'image/jpeg', quality);
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'call',
                params,
                id: Date.now(),
            }),
        });
        const data = await res.json();
        if (data.error) {
            throw new Error(data.error.data?.message || data.error.message);
        }
        return data.result;
    }
}

const productImageClipboard = new ProductImageClipboard();
document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', () => productImageClipboard.start())
    : productImageClipboard.start();
