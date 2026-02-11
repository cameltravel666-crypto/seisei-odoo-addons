/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

export class AccountReportFilters extends Component {
    static template = "seisei_account_reports.AccountReportFilters";
    static props = {};

    setup() {
        this.controller = useState(this.env.controller);
        this.state = useState({
            showJournals: false,
        });
    }

    get draftLabel() {
        return _t("Draft");
    }

    get hideZeroLabel() {
        return _t("Hide 0");
    }

    get allJournalsLabel() {
        return _t("All Journals");
    }

    get comparisonOptions() {
        return [
            { value: "no_comparison", label: _t("No Comparison") },
            { value: "monthly", label: _t("Monthly") },
            { value: "quarterly", label: _t("Quarterly") },
            { value: "semi_annual", label: _t("Semi-Annual") },
            { value: "previous_period", label: _t("Previous Period") },
            { value: "same_last_year", label: _t("Same Last Year") },
        ];
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
        return this.controller.options?.name_journal_group || this.allJournalsLabel;
    }

    get hideZeroLines() {
        return this.controller.options?.hide_0_lines;
    }

    get showComparison() {
        return this.controller.filters?.show_comparison;
    }

    get comparisonFilter() {
        return this.controller.options?.comparison?.filter || "no_comparison";
    }

    get comparisonNumberPeriod() {
        return this.controller.options?.comparison?.number_period || 1;
    }

    get isPreviousPeriod() {
        return this.comparisonFilter === "previous_period";
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

    async onComparisonChange(ev) {
        const filter = ev.target.value;
        const numberPeriod = this.comparisonNumberPeriod;
        await this.controller.updateComparison(filter, numberPeriod);
    }

    async onNumberPeriodChange(ev) {
        const numberPeriod = parseInt(ev.target.value) || 1;
        await this.controller.updateComparison("previous_period", numberPeriod);
    }
}
