/** @odoo-module **/

import { Component, useState } from "@odoo/owl";

export class AccountReportHeader extends Component {
    static template = "seisei_account_reports.AccountReportHeader";
    static props = {};

    setup() {
        this.controller = useState(this.env.controller);
    }

    get columns() {
        return this.controller.columnHeaders || [];
    }
}
