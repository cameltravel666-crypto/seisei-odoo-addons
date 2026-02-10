/** @odoo-module **/

import { Component, useState } from "@odoo/owl";

export class AccountReportButtonsBar extends Component {
    static template = "seisei_account_reports.AccountReportButtonsBar";
    static props = {};

    setup() {
        this.controller = useState(this.env.controller);
    }

    get barButtons() {
        return (this.controller.buttons || []).filter(b => b.always_show);
    }
}
