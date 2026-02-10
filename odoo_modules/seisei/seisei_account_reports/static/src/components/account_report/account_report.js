/** @odoo-module **/

import { Component, useState, onWillStart, onMounted, onPatched, useRef, useSubEnv } from "@odoo/owl";
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

        this.pageRef = useRef("page");

        onWillStart(async () => {
            await this.controller.load();
        });

        onMounted(() => this._updateCpHeight());
        onPatched(() => this._updateCpHeight());
    }

    _updateCpHeight() {
        const page = this.pageRef.el;
        if (!page) return;
        const cp = page.querySelector(".o_account_report_control_panel");
        if (!cp) return;
        page.style.setProperty("--cp-height", `${cp.offsetHeight}px`);
    }
}

// Register as client action
registry.category("actions").add("seisei_account_report", AccountReport);
