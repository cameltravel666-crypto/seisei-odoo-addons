/** @odoo-module **/

export class AccountReportController {
    constructor(env, action) {
        this.env = env;
        this.action = action;
        this.orm = env.services.orm;
        this.actionService = env.services.action;

        this.lines = [];
        this.options = {};
        this.reportName = "";
        this.reportId = null;
        this.columnHeaders = [];
        this.columns = [];
        this.buttons = [];
        this.filters = {};
        this.display = {};
        this.loadMoreLimit = 80;
        this.multiPeriod = false;

        this.isLoading = false;
        this.cachedFilterOptions = {};
    }

    get context() {
        return this.action.context || {};
    }

    async load() {
        this.reportId = this.context.report_id;
        if (!this.reportId) {
            return;
        }

        // Get initial options
        this.options = await this.orm.call(
            "account.report",
            "get_options",
            [this.reportId],
            { previous_options: this.context.options || {} }
        );

        await this.displayReport();
    }

    async displayReport() {
        this.isLoading = true;
        try {
            const result = await this.orm.call(
                "account.report",
                "get_report_information",
                [this.reportId, this.options]
            );

            this.lines = result.lines || [];
            this.columnHeaders = result.column_headers_render_data || [];
            this.columns = result.columns || [];
            this.reportName = result.report?.name || "";
            this.loadMoreLimit = result.report?.load_more_limit || 80;
            this.buttons = result.buttons || [];
            this.filters = result.filters || {};
            this.display = result.display || {};
            this.multiPeriod = result.multi_period || false;
            this.cachedFilterOptions = { ...this.options };
        } finally {
            this.isLoading = false;
        }
    }

    async reload(filterName, newOptions) {
        if (newOptions) {
            Object.assign(this.options, newOptions);
        }

        // Re-fetch options from server
        this.options = await this.orm.call(
            "account.report",
            "get_options",
            [this.reportId],
            { previous_options: this.options }
        );

        await this.displayReport();
    }

    // =========================================================================
    // Line fold/unfold
    // =========================================================================

    async unfoldLine(lineId) {
        if (!this.options.unfolded_lines) {
            this.options.unfolded_lines = [];
        }
        if (!this.options.unfolded_lines.includes(lineId)) {
            this.options.unfolded_lines.push(lineId);
        }

        const result = await this.orm.call(
            "account.report",
            "get_expanded_lines",
            [this.reportId, this.options, lineId]
        );

        if (result.lines) {
            // Insert expanded lines after the parent
            const parentIndex = this.lines.findIndex(l => l.id === lineId);
            if (parentIndex !== -1) {
                // Mark parent as unfolded
                this.lines[parentIndex].unfolded = true;
                // Insert children after parent
                this.lines.splice(parentIndex + 1, 0, ...result.lines);
            }
        }
    }

    foldLine(lineId) {
        // Remove from unfolded list
        if (this.options.unfolded_lines) {
            this.options.unfolded_lines = this.options.unfolded_lines.filter(
                id => id !== lineId
            );
        }

        // Mark as folded
        const parentIndex = this.lines.findIndex(l => l.id === lineId);
        if (parentIndex !== -1) {
            this.lines[parentIndex].unfolded = false;

            // Remove all children lines
            const childrenToRemove = [];
            for (let i = parentIndex + 1; i < this.lines.length; i++) {
                if (this._isChildOf(this.lines[i], lineId)) {
                    childrenToRemove.push(i);
                } else {
                    break;
                }
            }
            // Remove in reverse to preserve indices
            for (let i = childrenToRemove.length - 1; i >= 0; i--) {
                this.lines.splice(childrenToRemove[i], 1);
            }
        }
    }

    _isChildOf(line, parentId) {
        if (line.parent_id === parentId) return true;
        // Check parent chain
        let currentParentId = line.parent_id;
        while (currentParentId) {
            if (currentParentId === parentId) return true;
            const parentLine = this.lines.find(l => l.id === currentParentId);
            if (!parentLine) break;
            currentParentId = parentLine.parent_id;
        }
        return false;
    }

    // =========================================================================
    // Load more
    // =========================================================================

    async loadMore(lineId, offset, parentLineId) {
        const result = await this.orm.call(
            "account.report",
            "get_expanded_lines",
            [this.reportId, this.options, parentLineId],
            { offset: offset, limit: this.loadMoreLimit }
        );

        if (result.lines) {
            // Replace the "load more" line with new lines
            const loadMoreIndex = this.lines.findIndex(l => l.id === lineId);
            if (loadMoreIndex !== -1) {
                this.lines.splice(loadMoreIndex, 1, ...result.lines);
            }
        }
    }

    // =========================================================================
    // Actions
    // =========================================================================

    async reportAction(ev, actionName, params = {}, fromButton = false) {
        ev?.preventDefault?.();

        const result = await this.orm.call(
            "account.report",
            actionName,
            [this.reportId, this.options, params]
        );

        if (result && result.type) {
            this.actionService.doAction(result);
        }
    }

    async buttonAction(ev, button) {
        ev?.preventDefault?.();

        if (button.action === "export_to_pdf") {
            await this.exportPdf();
        } else if (button.action === "export_to_xlsx") {
            await this.exportXlsx();
        } else {
            await this.reportAction(ev, button.action, {}, true);
        }
    }

    async auditCell(lineId, expressionLabel, reportLineId, columnGroupKey) {
        const params = {
            report_line_id: reportLineId,
            expression_label: expressionLabel,
            calling_line_dict_id: lineId,
            column_group_key: columnGroupKey || "default",
        };

        const result = await this.orm.call(
            "account.report",
            "action_audit_cell",
            [this.reportId, this.options, params]
        );

        if (result && result.type) {
            this.actionService.doAction(result);
        }
    }

    async executeLineAction(lineId, actionId) {
        const params = {
            actionId: actionId,
            id: lineId,
        };

        const result = await this.orm.call(
            "account.report",
            "execute_action",
            [this.reportId, this.options, params]
        );

        if (result && result.type) {
            this.actionService.doAction(result);
        }
    }

    // =========================================================================
    // Export
    // =========================================================================

    async exportPdf() {
        const result = await this.orm.call(
            "account.report",
            "export_to_pdf",
            [this.reportId, this.options]
        );

        if (result && result.type) {
            this.actionService.doAction(result);
        }
    }

    async exportXlsx() {
        const result = await this.orm.call(
            "account.report",
            "export_to_xlsx",
            [this.reportId, this.options]
        );

        if (result && result.file_content && result.file_name) {
            const link = document.createElement("a");
            link.href = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + result.file_content;
            link.download = result.file_name;
            link.click();
        }
    }

    // =========================================================================
    // Filters
    // =========================================================================

    async updateDate(dateFrom, dateTo) {
        this.options.date = {
            ...this.options.date,
            date_from: dateFrom,
            date_to: dateTo,
        };
        await this.reload();
    }

    async toggleAllEntries() {
        this.options.all_entries = !this.options.all_entries;
        await this.reload();
    }

    async toggleJournal(journalId) {
        const journal = this.options.journals?.find(j => j.id === journalId);
        if (journal) {
            journal.selected = !journal.selected;
            await this.reload();
        }
    }

    async toggleHideZeroLines() {
        this.options.hide_0_lines = !this.options.hide_0_lines;
        await this.reload();
    }

    async toggleUnfoldAll() {
        this.options.unfold_all = !this.options.unfold_all;
        this.options.unfolded_lines = [];
        await this.reload();
    }

    async updateComparison(filter, numberPeriod) {
        this.options.comparison = {
            ...this.options.comparison,
            filter: filter,
            number_period: numberPeriod || 1,
        };
        // Reset unfold state when changing comparison
        this.options.unfolded_lines = [];
        await this.reload();
    }
}
