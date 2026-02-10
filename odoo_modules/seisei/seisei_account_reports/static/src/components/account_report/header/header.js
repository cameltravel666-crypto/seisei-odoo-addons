/** @odoo-module **/

import { Component, useState } from "@odoo/owl";

export class AccountReportHeader extends Component {
    static template = "seisei_account_reports.AccountReportHeader";
    static props = {};

    setup() {
        this.controller = useState(this.env.controller);
    }

    get isMultiPeriod() {
        return this.controller.multiPeriod;
    }

    get periodHeaders() {
        // First row: period names with colspan
        const headers = this.controller.columnHeaders;
        if (this.isMultiPeriod && headers.length > 1) {
            return headers[0];
        }
        return [];
    }

    get columns() {
        // For multi-period: second row (label row)
        // For single period: first (only) row
        const headers = this.controller.columnHeaders;
        if (this.isMultiPeriod && headers.length > 1) {
            return headers[1];
        }
        return headers[0] || [];
    }
}
