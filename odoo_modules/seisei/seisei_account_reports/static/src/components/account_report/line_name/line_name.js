/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

export class AccountReportLineName extends Component {
    static template = "seisei_account_reports.AccountReportLineName";
    static props = {
        line: Object,
    };

    setup() {
        this.controller = useState(this.env.controller);
    }

    get indentClass() {
        const level = this.props.line.level || 0;
        return `o_account_report_line_indent_${Math.min(level, 4)}`;
    }

    get showUnfoldButton() {
        return this.props.line.unfoldable && !this.props.line.load_more;
    }

    get isUnfolded() {
        return this.props.line.unfolded;
    }

    get foldUnfoldTitle() {
        return this.isUnfolded ? _t("Fold") : _t("Unfold");
    }

    async onClickName(ev) {
        const line = this.props.line;

        // Load more
        if (line.load_more) {
            ev.preventDefault();
            await this.controller.loadMore(line.id, line.offset, line.parent_id);
            return;
        }

        // Action
        if (line.action_id) {
            ev.preventDefault();
            await this.controller.executeLineAction(line.id, line.action_id);
            return;
        }
    }

    async toggleFold(ev) {
        ev.preventDefault();
        ev.stopPropagation();

        const line = this.props.line;
        if (line.unfolded) {
            this.controller.foldLine(line.id);
        } else {
            await this.controller.unfoldLine(line.id);
        }
    }
}
