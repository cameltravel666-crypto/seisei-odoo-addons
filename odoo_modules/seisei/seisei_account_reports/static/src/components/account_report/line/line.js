/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { AccountReportLineName } from "../line_name/line_name";
import { AccountReportLineCell } from "../line_cell/line_cell";

export class AccountReportLine extends Component {
    static template = "seisei_account_reports.AccountReportLine";
    static components = {
        AccountReportLineName,
        AccountReportLineCell,
    };
    static props = {
        line: Object,
    };

    setup() {
        this.controller = useState(this.env.controller);
    }

    get cssClass() {
        const classes = ["o_account_report_line"];
        const level = this.props.line.level || 0;
        classes.push(`o_account_report_level_${Math.min(level, 3)}`);
        if (this.props.line.load_more) {
            classes.push("o_account_report_load_more_line");
        }
        return classes.join(" ");
    }
}
