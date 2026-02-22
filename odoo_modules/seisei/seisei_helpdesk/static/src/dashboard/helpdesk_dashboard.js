/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

const DEFAULT_LABELS = {
  title: "Helpdesk Dashboard",
  myTickets: "My Tickets",
  myPerformance: "My Performance",
  customerCare: "Customer Care",
  allTickets: "All Tickets",
  highPriority: "High Priority",
  urgent: "Urgent",
  count: "Count",
  avgOpenHours: "Avg Open Hours",
  slaFailed: "SLA Failed",
  todayClosed: "Today Closed",
  slaSuccessRate: "SLA Success Rate",
  last7Days: "Last 7 Days",
  closedTickets: "Closed",
  avgPerDay: "Avg/Day",
  dailyTarget: "Daily Target",
  open: "Open",
  unassigned: "Unassigned",
  noTeams: "No teams configured",
};

class HelpdeskDashboard extends Component {
  static template = "seisei_helpdesk.Dashboard";
  static props = {
    action: { type: Object, optional: true },
    "*": true,
  };

  setup() {
    this.orm = useService("orm");
    this.actionService = useService("action");
    this.state = useState({
      loading: true,
      data: {},
    });

    onWillStart(async () => {
      await this.loadData();
    });
  }

  get labels() {
    return this.state.data.labels || DEFAULT_LABELS;
  }

  async loadData() {
    this.state.loading = true;
    try {
      const result = await this.orm.call(
        "seisei.helpdesk.team",
        "retrieve_dashboard",
        [],
      );
      this.state.data = result;
    } catch {
      this.state.data = {
        my_all: { count: 0, avg_hours: 0, sla_failed: 0 },
        my_high: { count: 0, avg_hours: 0, sla_failed: 0 },
        my_urgent: { count: 0, avg_hours: 0, sla_failed: 0 },
        today_closed: 0,
        today_sla_success_rate: 0,
        "7days_closed": 0,
        "7days_avg_closed": 0,
        "7days_sla_success_rate": 0,
        target_closed: 5,
        teams: [],
        show_sla: false,
      };
    }
    this.state.loading = false;
  }

  get progressPct() {
    const target = this.state.data.target_closed || 5;
    const closed = this.state.data.today_closed || 0;
    return Math.min(Math.round((closed / target) * 100), 100);
  }

  // ── Navigation helpers ──

  openMyTickets(priority) {
    const domain = [["is_closed", "=", false]];
    let name = this.labels.allTickets;
    if (priority === "high") {
      domain.push(["priority", "=", "2"]);
      name = this.labels.highPriority;
    } else if (priority === "urgent") {
      domain.push(["priority", "=", "3"]);
      name = this.labels.urgent;
    }
    this.actionService.doAction({
      type: "ir.actions.act_window",
      name,
      res_model: "seisei.helpdesk.ticket",
      view_mode: "list,form",
      views: [
        [false, "list"],
        [false, "form"],
      ],
      domain,
      context: { search_default_my_tickets: 1 },
    });
  }

  openTeamTickets(teamId, filter) {
    const domain = [
      ["team_id", "=", teamId],
      ["is_closed", "=", false],
    ];
    if (filter === "unassigned") {
      domain.push(["user_id", "=", false]);
    } else if (filter === "urgent") {
      domain.push(["priority", "=", "3"]);
    }
    this.actionService.doAction({
      type: "ir.actions.act_window",
      name: "Tickets",
      res_model: "seisei.helpdesk.ticket",
      view_mode: "list,kanban,form",
      views: [
        [false, "list"],
        [false, "kanban"],
        [false, "form"],
      ],
      domain,
    });
  }
}

registry
  .category("actions")
  .add("seisei_helpdesk_dashboard_main", HelpdeskDashboard);
