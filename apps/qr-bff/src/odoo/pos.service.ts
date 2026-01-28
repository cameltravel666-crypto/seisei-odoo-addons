import { Injectable } from '@nestjs/common';
import { OdooClient } from './odoo.client';
import { QrLogger } from '../common/logger';
import { OrderNotFoundError, OdooRpcError } from '../common/errors';

export interface MenuItem {
  id: number;
  name: string;
  price: number;
  description?: string;
  category_id?: number;
  category_name?: string;
  image_url?: string;
  available: boolean;
}

export interface OrderItem {
  product_id: number;
  qty: number;
  price_unit?: number;
  notes?: string;
}

export interface OrderResult {
  order_id: number;
  order_name: string;
  state: string;
  amount_total: number;
  lines: Array<{
    product_id: number;
    product_name: string;
    qty: number;
    price_unit: number;
    price_subtotal: number;
  }>;
  created_at: string;
}

@Injectable()
export class PosService {
  private logger = new QrLogger('PosService');

  constructor(private odooClient: OdooClient) {}

  /**
   * Fetch menu items for a QR table
   * Uses qr.table model to get the associated POS config and its products
   */
  async fetchMenu(
    tenantDb: string,
    tableToken: string,
  ): Promise<MenuItem[]> {
    this.logger.log(`Fetching menu for token=${tableToken.substring(0, 8)}...`);

    try {
      // First, get the qr.table record by token
      const tables = await this.odooClient.executeKw<any[]>(
        tenantDb,
        'qr.table',
        'search_read',
        [[['qr_token', '=', tableToken], ['active', '=', true]]],
        { fields: ['id', 'name', 'pos_config_id'], limit: 1 },
      );

      if (!tables || tables.length === 0) {
        throw new OdooRpcError('qr.table', 'Table not found');
      }

      const table = tables[0];
      const posConfigId = table.pos_config_id?.[0];

      if (!posConfigId) {
        throw new OdooRpcError('qr.table', 'No POS config associated');
      }

      // Get available products from the POS config
      const products = await this.odooClient.executeKw<any[]>(
        tenantDb,
        'product.product',
        'search_read',
        [[['available_in_pos', '=', true], ['active', '=', true]]],
        {
          fields: [
            'id',
            'name',
            'lst_price',
            'description_sale',
            'categ_id',
            'image_128',
          ],
          order: 'categ_id, name',
        },
      );

      return products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.lst_price || 0,
        description: p.description_sale || '',
        category_id: p.categ_id?.[0],
        category_name: p.categ_id?.[1],
        image_url: p.image_128
          ? `data:image/png;base64,${p.image_128}`
          : undefined,
        available: true,
      }));
    } catch (error) {
      this.logger.error(`Failed to fetch menu: ${error}`);
      throw error;
    }
  }

  /**
   * Create an order from QR ordering
   * Uses qr.order model if available, falls back to pos.order
   */
  async createOrder(
    tenantDb: string,
    tableToken: string,
    clientOrderId: string,
    items: OrderItem[],
  ): Promise<OrderResult> {
    this.logger.log(
      `Creating order for token=${tableToken.substring(0, 8)}... clientOrderId=${clientOrderId}`,
    );

    try {
      // Check for existing order with same client_order_id (idempotency)
      const existingOrders = await this.odooClient.executeKw<any[]>(
        tenantDb,
        'qr.order',
        'search_read',
        [[['client_order_id', '=', clientOrderId]]],
        { fields: ['id', 'name', 'state', 'amount_total'], limit: 1 },
      );

      if (existingOrders && existingOrders.length > 0) {
        const existing = existingOrders[0];
        this.logger.log(`Found existing order: ${existing.name}`);
        return this.getOrder(tenantDb, existing.id.toString());
      }

      // Get the qr.table record
      const tables = await this.odooClient.executeKw<any[]>(
        tenantDb,
        'qr.table',
        'search_read',
        [[['qr_token', '=', tableToken], ['active', '=', true]]],
        { fields: ['id', 'name', 'pos_config_id'], limit: 1 },
      );

      if (!tables || tables.length === 0) {
        throw new OdooRpcError('qr.table', 'Table not found');
      }

      const table = tables[0];

      // Prepare order lines
      const orderLines = items.map((item) => [
        0,
        0,
        {
          product_id: item.product_id,
          qty: item.qty,
          price_unit: item.price_unit,
          notes: item.notes || '',
        },
      ]);

      // Create the QR order
      const orderId = await this.odooClient.executeKw<number>(
        tenantDb,
        'qr.order',
        'create',
        [
          {
            table_id: table.id,
            client_order_id: clientOrderId,
            line_ids: orderLines,
            state: 'draft',
          },
        ],
      );

      this.logger.log(`Created order ID: ${orderId}`);

      // Fetch and return the created order
      return this.getOrder(tenantDb, orderId.toString());
    } catch (error) {
      this.logger.error(`Failed to create order: ${error}`);
      throw error;
    }
  }

  /**
   * Get order details by ID
   */
  async getOrder(tenantDb: string, orderId: string): Promise<OrderResult> {
    this.logger.log(`Getting order: ${orderId}`);

    try {
      const orders = await this.odooClient.executeKw<any[]>(
        tenantDb,
        'qr.order',
        'search_read',
        [[['id', '=', parseInt(orderId, 10)]]],
        {
          fields: [
            'id',
            'name',
            'state',
            'amount_total',
            'line_ids',
            'create_date',
          ],
          limit: 1,
        },
      );

      if (!orders || orders.length === 0) {
        throw new OrderNotFoundError(orderId);
      }

      const order = orders[0];

      // Fetch order lines
      let lines: any[] = [];
      if (order.line_ids && order.line_ids.length > 0) {
        lines = await this.odooClient.executeKw<any[]>(
          tenantDb,
          'qr.order.line',
          'search_read',
          [[['id', 'in', order.line_ids]]],
          {
            fields: [
              'product_id',
              'qty',
              'price_unit',
              'price_subtotal',
            ],
          },
        );
      }

      return {
        order_id: order.id,
        order_name: order.name || `QR-${order.id}`,
        state: order.state,
        amount_total: order.amount_total || 0,
        lines: lines.map((l) => ({
          product_id: l.product_id?.[0],
          product_name: l.product_id?.[1] || '',
          qty: l.qty,
          price_unit: l.price_unit,
          price_subtotal: l.price_subtotal,
        })),
        created_at: order.create_date,
      };
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        throw error;
      }
      this.logger.error(`Failed to get order: ${error}`);
      throw error;
    }
  }
}
