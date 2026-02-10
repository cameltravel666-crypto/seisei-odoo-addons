/** @odoo-module **/

import { Component, useState } from "@odoo/owl";

export class AccountReportFilters extends Component {
    static template = "seisei_account_reports.AccountReportFilters";
    static props = {};

    setup() {
        this.controller = useState(this.env.controller);
        this.state = useState({
            showJournals: false,
        });
    }

    get dateFrom() {
        return this.controller.options?.date?.date_from || "";
    }

    get dateTo() {
        return this.controller.options?.date?.date_to || "";
    }

    get isRangeMode() {
        return this.controller.options?.date?.mode === "range";
    }

    get showDraftFilter() {
        return this.controller.filters?.show_draft;
    }

    get isDraftIncluded() {
        return this.controller.options?.all_entries;
    }

    get showJournalFilter() {
        return this.controller.filters?.show_journals;
    }

    get journals() {
        return this.controller.options?.journals || [];
    }

    get journalGroupName() {
        return this.controller.options?.name_journal_group || "All Journals";
    }

    get hideZeroLines() {
        return this.controller.options?.hide_0_lines;
    }

    async onDateFromChange(ev) {
        const dateFrom = ev.target.value;
        const dateTo = this.dateTo;
        await this.controller.updateDate(dateFrom, dateTo);
    }

    async onDateToChange(ev) {
        const dateFrom = this.dateFrom;
        const dateTo = ev.target.value;
        await this.controller.updateDate(dateFrom, dateTo);
    }

    async onToggleDraft(ev) {
        await this.controller.toggleAllEntries();
    }

    toggleJournalDropdown(ev) {
        ev.stopPropagation();
        this.state.showJournals = !this.state.showJournals;
    }

    async onToggleJournal(ev, journalId) {
        ev.stopPropagation();
        await this.controller.toggleJournal(journalId);
    }

    async onToggleHideZero(ev) {
        await this.controller.toggleHideZeroLines();
    }
}
