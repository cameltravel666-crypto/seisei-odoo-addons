/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { EscPosPrinter } from "@pos_tcp_esc_printer/app/escpos_printer";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    afterProcessServerData() {
        var self = this;
        return super.afterProcessServerData(...arguments).then(function () {
            if (self.config.escpos_print && self.config.escpos_printer_ip) {
                self.hardwareProxy.printer = new EscPosPrinter({ ip: self.config.escpos_printer_ip });
            }
        });
    },
    create_printer(config) {
        if (config.printer_type === "escpos_printer") {
            return new EscPosPrinter({ ip: config.escpos_printer_ip });
        } else {
            return super.create_printer(...arguments);
        }
    },
});
