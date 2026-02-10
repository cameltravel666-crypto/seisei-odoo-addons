/** @odoo-module **/

import { Component, useState, onWillStart, useSubEnv } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { AccountReportController } from "./controller";
import { AccountReportHeader } from "./header/header";
import { AccountReportLine } from "./line/line";
import { AccountReportFilters } from "./filters/filters";
import { AccountReportButtonsBar } from "./buttons_bar/buttons_bar";

export class AccountReport extends Component {
    static template = "seisei_account_reports.AccountReport";
    static components = {
        AccountReportHeader,
        AccountReportLine,
        AccountReportFilters,
        AccountReportButtonsBar,
    };
    static props = {
        action: { type: Object, optional: true },
        "*": true,
    };

    setup() {
        this.orm = useService("orm");
        this.actionService = useService("action");

        const action = this.props.action || {};
        const controller = new AccountReportController(this.env, action);
        this.controller = useState(controller);

        useSubEnv({ controller: this.controller });

        onWillStart(async () => {
            await this.controller.load();
        });
    }
}

// Register as client action
registry.category("actions").add("seisei_account_report", AccountReport);
