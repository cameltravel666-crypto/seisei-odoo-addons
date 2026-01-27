/* @odoo-module */

import { BasePrinter } from "@point_of_sale/app/printer/base_printer";
import { _t } from "@web/core/l10n/translation";
import { templates } from "@web/core/assets";
import { createElement, append, createTextNode } from "@web/core/utils/xml";

/**
 * Sends print request to printer that is directly connected to the local network.
 */
export class EscPosPrinter extends BasePrinter {
    setup({ ip }) {
        super.setup(...arguments);
        this.url = "/pos_tcp_esc_printer/print";
        this.ip = ip;
    }

    /**
     * @override
     */
    openCashbox() {
        // const pulse = ePOSPrint([createElement("pulse")]);
        // this.sendPrintingJob(pulse);
    }

    /**
     * @override
     */
    async sendPrintingJob(img) {
        const res = await fetch(this.url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ img: img, ip: this.ip })
        });
        const body = await res.json();
        
        return {
            result: true,
            printerErrorCode: 0,
        };
    } 
}
