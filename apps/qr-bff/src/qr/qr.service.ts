import { Injectable } from '@nestjs/common';
import { TokenService, TokenInfo } from './token.service';
import { PosService, MenuItem, OrderItem, OrderResult } from '../odoo/pos.service';
import { QrLogger } from '../common/logger';

export interface ContextResponse {
  tenant_db: string;
  store_id?: number;
  table_id?: number;
  table_name?: string;
  status: string;
  lang?: string;
}

export interface MenuResponse {
  tenant_db: string;
  items: MenuItem[];
  categories: Array<{
    id: number;
    name: string;
  }>;
}

export interface CreateOrderRequest {
  items: OrderItem[];
  client_order_id: string;
  notes?: string;
}

export interface OrderResponse {
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
export class QrService {
  private logger = new QrLogger('QrService');

  constructor(
    private tokenService: TokenService,
    private posService: PosService,
  ) {}

  /**
   * Get context information for a QR token
   */
  async getContext(token: string): Promise<ContextResponse> {
    const startTime = Date.now();

    const tokenInfo = await this.tokenService.getTokenInfo(token);

    this.logger.logRequest({
      action: 'getContext',
      token,
      tenantDb: tokenInfo.tenantDb,
      latency: Date.now() - startTime,
      status: 'success',
    });

    return {
      tenant_db: tokenInfo.tenantDb,
      store_id: tokenInfo.storeId,
      table_id: tokenInfo.tableId,
      table_name: tokenInfo.tableName,
      status: tokenInfo.status,
      lang: 'ja_JP', // Default to Japanese
    };
  }

  /**
   * Get menu for a QR token
   */
  async getMenu(token: string): Promise<MenuResponse> {
    const startTime = Date.now();

    const tokenInfo = await this.tokenService.getTokenInfo(token);
    const items = await this.posService.fetchMenu(tokenInfo.tenantDb, token);

    // Extract unique categories
    const categoryMap = new Map<number, string>();
    items.forEach((item) => {
      if (item.category_id && item.category_name) {
        categoryMap.set(item.category_id, item.category_name);
      }
    });

    const categories = Array.from(categoryMap.entries()).map(([id, name]) => ({
      id,
      name,
    }));

    this.logger.logRequest({
      action: 'getMenu',
      token,
      tenantDb: tokenInfo.tenantDb,
      latency: Date.now() - startTime,
      status: 'success',
    });

    return {
      tenant_db: tokenInfo.tenantDb,
      items,
      categories,
    };
  }

  /**
   * Create an order
   */
  async createOrder(
    token: string,
    request: CreateOrderRequest,
  ): Promise<OrderResponse> {
    const startTime = Date.now();

    const tokenInfo = await this.tokenService.getTokenInfo(token);

    const result = await this.posService.createOrder(
      tokenInfo.tenantDb,
      token,
      request.client_order_id,
      request.items,
    );

    this.logger.logRequest({
      action: 'createOrder',
      token,
      tenantDb: tokenInfo.tenantDb,
      orderId: result.order_id.toString(),
      latency: Date.now() - startTime,
      status: 'success',
    });

    return result;
  }

  /**
   * Get order status
   */
  async getOrder(token: string, orderId: string): Promise<OrderResponse> {
    const startTime = Date.now();

    const tokenInfo = await this.tokenService.getTokenInfo(token);
    const result = await this.posService.getOrder(tokenInfo.tenantDb, orderId);

    this.logger.logRequest({
      action: 'getOrder',
      token,
      tenantDb: tokenInfo.tenantDb,
      orderId,
      latency: Date.now() - startTime,
      status: 'success',
    });

    return result;
  }
}
