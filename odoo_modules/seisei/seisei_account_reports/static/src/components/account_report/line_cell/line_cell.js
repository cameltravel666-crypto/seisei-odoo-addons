/** @odoo-module **/

import { Component, useState } from "@odoo/owl";

export class AccountReportLineCell extends Component {
    static template = "seisei_account_reports.AccountReportLineCell";
    static props = {
        line: Object,
        column: Object,
        columnIndex: Number,
    };

    setup() {
        this.controller = useState(this.env.controller);
    }

    get isAuditable() {
        return this.props.column.auditable && !this.props.column.is_zero;
    }

    async onClickCell(ev) {
        ev.preventDefault();
        if (!this.isAuditable) return;

        await this.controller.auditCell(
            this.props.line.id,
            this.props.column.expression_label,
            this.props.column.report_line_id,
        );
    }
}
