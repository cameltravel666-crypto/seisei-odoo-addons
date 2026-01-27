/** @odoo-module */
/**
 * QR Order Print Extension for POS
 *
 * This module patches the POS Store to listen for QR order notifications
 * and triggers printing on the POS frontend via YLHC Recorder.
 *
 * The notification flow:
 * 1. QR order is submitted (backend)
 * 2. Backend calls pos.config._notify('QR_ORDER_PRINT', data)
 * 3. This module receives the notification via data.onNotified
 * 4. Calls this.printChanges() to trigger actual printing through YLHC Recorder
 */

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

// Patch PosOrder to ensure qr_source is properly initialized
patch(PosOrder.prototype, {
    setup(vals) {
        super.setup(vals);
        // Explicitly store qr_source from server data
        this.qr_source = vals.qr_source || false;
    },
});

patch(PosStore.prototype, {
    /**
     * @override
     * Initialize QR print listener after server data is processed
     */
    async afterProcessServerData() {
        await super.afterProcessServerData(...arguments);
        console.log("[QR Print] afterProcessServerData complete, initializing QR print listener");
        this._initQrPrintListener();
        this._logQrSourceDebug();
    },

    /**
     * Debug: Log all orders and their qr_source status
     */
    _logQrSourceDebug() {
        if (this.models && this.models["pos.order"]) {
            const allOrders = this.models["pos.order"].getAll();
            console.log("[QR Debug] All orders:", allOrders.length);
            allOrders.forEach(o => {
                console.log(`[QR Debug] Order ${o.id} (${o.name}): qr_source=${o.qr_source}, table_id=${o.table_id?.id}`);
            });
        }
    },

    /**
     * @override
     * Get orders for a table
     * QR orders are included but will be handled specially
     */
    getTableOrders(tableId) {
        const orders = super.getTableOrders(tableId);
        console.log(`[QR Filter] getTableOrders(${tableId}) called, found ${orders?.length} orders`);
        // 不过滤 QR 订单，让 POS 能正确加载它们
        // QR 订单应该能被正常结账
        return orders;
    },

    /**
     * @override
     * Get floating orders (orders without a table)
     * Filter out QR orders from floating buttons to prevent confusion
     */
    getFloatingOrders() {
        const orders = super.getFloatingOrders();
        console.log(`[QR Filter] getFloatingOrders() called, found ${orders?.length} orders`);
        // 只过滤浮动订单（没有桌台的订单），防止 QR 订单显示为独立按钮
        return this._filterOutQrOrders(orders, 'floating');
    },

    /**
     * Helper method to filter out QR orders from order lists
     */
    _filterOutQrOrders(orders, context = '') {
        if (!orders || !Array.isArray(orders)) {
            console.log(`[QR Filter] ${context}: orders is null or not array`);
            return orders;
        }
        const filtered = orders.filter(order => {
            const isQr = order.qr_source === true;
            console.log(`[QR Filter] ${context}: Order ${order.id} (${order.name}) qr_source=${order.qr_source} -> ${isQr ? 'HIDE' : 'SHOW'}`);
            // If qr_source is true, this order came from QR and should not appear as button
            if (isQr) {
                return false;
            }
            return true;
        });
        console.log(`[QR Filter] ${context}: ${orders.length} -> ${filtered.length} orders after filter`);
        return filtered;
    },

    _initQrPrintListener() {
        // Use the data service's onNotified method which is already connected to the correct channel
        if (this.data && this.data.onNotified) {
            console.log("[QR Print] Subscribing to QR notifications");
            this.data.connectWebSocket('QR_ORDER_PRINT', this._handleQrPrintNotification.bind(this));
            this.data.connectWebSocket('QR_ORDER_SYNC', this._handleQrOrderSync.bind(this));
            console.log("[QR Print] Subscription complete");
        } else {
            console.warn("[QR Print] data.onNotified not available, retrying in 1 second");
            setTimeout(() => this._initQrPrintListener(), 1000);
        }
    },

    /**
     * Handle QR order sync notification
     * This loads the complete order data (including lines) into POS models
     */
    async _handleQrOrderSync(notificationData) {
        console.log("[QR Sync] Received order sync notification:", notificationData);

        try {
            const { order: orderData, lines: linesData, table_id } = notificationData;

            if (!orderData || !orderData.id) {
                console.warn("[QR Sync] Invalid order data");
                return;
            }

            // Reload the order from server to ensure we have complete data
            if (this.data && this.data.read) {
                console.log("[QR Sync] Reloading order data from server...");

                // Use the data service to reload orders
                await this.data.read('pos.order', [orderData.id]);

                // Also reload the order lines
                if (linesData && linesData.length > 0) {
                    const lineIds = linesData.map(l => l.id);
                    await this.data.read('pos.order.line', lineIds);
                }

                console.log(`[QR Sync] Order ${orderData.id} synced with ${linesData?.length || 0} lines`);
            }
        } catch (error) {
            console.error("[QR Sync] Failed to sync order:", error);
        }
    },

    _handleQrPrintNotification(notificationData) {
        console.log("[QR Print] Received print notification:", notificationData);

        const {
            order_id,
            order_name,
            config_id,
            lines,
            table_name,
            qr_order_name,
            is_batch
        } = notificationData;

        // Verify this is for our POS config
        if (config_id && config_id !== this.config?.id) {
            console.log("[QR Print] Ignoring notification for different config");
            return;
        }

        // Trigger print
        this._triggerQrOrderPrint(order_id, order_name, lines, table_name, qr_order_name, is_batch);
    },

    async _triggerQrOrderPrint(orderId, orderName, lines, tableName, qrOrderName, isBatch = false) {
        console.log(`[QR Print] Triggering print for order ${orderName} (QR: ${qrOrderName})${isBatch ? ' [BATCH/加菜]' : ''}`);

        try {
            // Build order changes structure for printing
            // This structure matches what POS uses in sendOrderInPreparation
            const orderChange = {
                new: (lines || []).map(line => ({
                    product_id: line.product_id,
                    name: line.product_name,
                    quantity: line.qty,
                    note: line.note || "",
                    customer_note: line.note || "",
                    pos_categ_id: line.categ_id || false,
                    pos_categ_sequence: line.categ_sequence || 0,
                })),
                cancelled: [],
                generalNote: tableName ? `桌号: ${tableName}` : "",
                modeUpdate: false,
            };

            console.log("[QR Print] Order changes:", orderChange);

            // Try to find the order in local models
            let order = null;

            // First try to find in local models
            if (this.models && this.models["pos.order"]) {
                const orders = this.models["pos.order"].getAll();
                order = orders.find(o => o.id === orderId);
            }

            // If not found, create a minimal order-like object for printing
            if (!order) {
                order = this.get_order();
                if (!order || order.id !== orderId) {
                    // Create a minimal order-like object for printing
                    order = {
                        id: orderId,
                        name: orderName,
                        pos_reference: orderName,
                        table_id: null,
                        getCustomerNote: () => tableName ? `桌号: ${tableName}` : "",
                    };
                }
            }

            // Call printChanges - this is the same method POS uses
            if (typeof this.printChanges === "function") {
                console.log("[QR Print] Calling printChanges");
                const result = await this.printChanges(order, orderChange);
                console.log("[QR Print] Print completed, result:", result);
            } else {
                console.error("[QR Print] printChanges method not available");
            }
        } catch (error) {
            console.error("[QR Print] Print failed:", error);
        }
    },
});

console.log("[QR Print] QR Print extension loaded");
