/** @odoo-module **/

import { Component, useState, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";

export class MultiFileUploadWidget extends Component {
    static template = "ocr_file.MultiFileUploadWidget";
    static props = {
        ...standardWidgetProps,
        taskId: { type: Number, optional: true },
    };

    setup() {
        this.state = useState({
            uploading: false,
            selectedFiles: [],
            uploadProgress: 0,
        });
        this.fileInputRef = useRef("fileInput");
        this.notification = useService("notification");
        this.action = useService("action");
        this.orm = useService("orm");
    }

    get taskId() {
        return this.props.record?.resId || this.props.taskId;
    }

    onFileSelect(ev) {
        const files = ev.target.files;
        if (files.length > 0) {
            this.state.selectedFiles = Array.from(files);
            // Auto-upload after selection
            this.onUploadClick();
        }
    }

    async onUploadClick() {
        if (!this.state.selectedFiles.length) {
            this.notification.add("Please select files first", { type: "warning" });
            return;
        }

        if (!this.taskId) {
            this.notification.add("Please save the task first", { type: "warning" });
            return;
        }

        this.state.uploading = true;
        this.state.uploadProgress = 0;

        try {
            const formData = new FormData();
            for (const file of this.state.selectedFiles) {
                formData.append("files", file);
            }

            const response = await fetch(`/api/ocr_file/upload_files/${this.taskId}`, {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                this.notification.add(`${result.count} file(s) uploaded`, { type: "success" });
                this.state.selectedFiles = [];
                if (this.fileInputRef.el) {
                    this.fileInputRef.el.value = "";
                }
                // Reload the record to show new files
                if (this.props.record) {
                    await this.props.record.load();
                }
            } else {
                this.notification.add(`Upload failed: ${result.error}`, { type: "danger" });
            }
        } catch (error) {
            console.error("Upload error:", error);
            this.notification.add(`Upload error: ${error.message}`, { type: "danger" });
        } finally {
            this.state.uploading = false;
        }
    }

    triggerFileInput() {
        if (this.fileInputRef.el) {
            this.fileInputRef.el.click();
        }
    }
}

MultiFileUploadWidget.template = "ocr_file.MultiFileUploadWidget";

registry.category("view_widgets").add("multi_file_upload", {
    component: MultiFileUploadWidget,
});
