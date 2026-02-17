/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

class PosSalesDashboard extends Component {
  static template = "pos_sales_dashboard.Dashboard";
  static props = {
    action: { type: Object, optional: true },
    "*": true,
  };

  setup() {
    this.orm = useService("orm");
    this.state = useState({
      mode: "day",
      dateStr: this._todayStr(),
      configId: null,
      loading: true,
      kpis: {},
      comparison: {},
      ranking: [],
      configs: [],
      currency: {},
    });

    onWillStart(async () => {
      await this.loadData();
    });
  }

  get labels() {
    return {
      title: _t("Sales Dashboard"),
      daily: _t("Daily"),
      monthly: _t("Monthly"),
      allStores: _t("All Stores"),
      totalSales: _t("Total Sales"),
      orderCount: _t("Order Count"),
      avgAmount: _t("Avg per Order"),
      foodSales: _t("Food Sales"),
      drinkSales: _t("Drink Sales"),
      rankingTitle: _t("Product Ranking Top 10"),
      product: _t("Product"),
      qty: _t("Quantity"),
      amount: _t("Amount"),
      noData: _t("No data available"),
    };
  }

  get modeLabel() {
    return this.state.mode === "day"
      ? _t("vs prev day")
      : _t("vs prev month");
  }

  _todayStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  async loadData() {
    this.state.loading = true;
    try {
      const configIds = this.state.configId ? [this.state.configId] : [];
      const result = await this.orm.call(
        "pos.sales.dashboard",
        "get_dashboard_data",
        [this.state.dateStr, this.state.mode, configIds],
      );
      this.state.kpis = result.kpis || {};
      this.state.comparison = result.comparison || {};
      this.state.ranking = result.ranking || [];
      this.state.configs = result.configs || [];
      this.state.currency = result.currency || {};
      this.state.loading = false;
    } catch {
      this.state.loading = false;
    }
  }

  async onModeChange(mode) {
    this.state.mode = mode;
    await this.loadData();
  }

  async onDateChange(ev) {
    this.state.dateStr = ev.target.value;
    await this.loadData();
  }

  async onConfigChange(ev) {
    const val = ev.target.value;
    this.state.configId = val ? parseInt(val, 10) : null;
    await this.loadData();
  }

  formatCurrency(value) {
    const cur = this.state.currency;
    if (!cur.symbol) return String(Math.round(value));
    const formatted =
      cur.decimal_places === 0
        ? Math.round(value).toLocaleString()
        : Number(value).toLocaleString(undefined, {
            minimumFractionDigits: cur.decimal_places,
            maximumFractionDigits: cur.decimal_places,
          });
    return cur.position === "before"
      ? `${cur.symbol}${formatted}`
      : `${formatted}${cur.symbol}`;
  }

  formatPct(value) {
    if (value === 0) return "±0%";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value}%`;
  }

  pctClass(value) {
    if (value > 0) return "text-success";
    if (value < 0) return "text-danger";
    return "text-muted";
  }
}

registry.category("actions").add("pos_sales_dashboard_main", PosSalesDashboard);
