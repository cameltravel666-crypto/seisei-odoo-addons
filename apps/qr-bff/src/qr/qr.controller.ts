import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { QrService, CreateOrderRequest } from './qr.service';

@Controller('qr')
@UseGuards(ThrottlerGuard)
export class QrController {
  constructor(private readonly qrService: QrService) {}

  /**
   * GET /v1/qr/:token/context
   * Get context information (tenant_db, table info, etc.) for a QR token
   */
  @Get(':token/context')
  async getContext(@Param('token') token: string) {
    return this.qrService.getContext(token);
  }

  /**
   * GET /v1/qr/:token/menu
   * Get menu items for a QR token
   */
  @Get(':token/menu')
  async getMenu(@Param('token') token: string) {
    return this.qrService.getMenu(token);
  }

  /**
   * POST /v1/qr/:token/order
   * Create a new order
   *
   * Body:
   * {
   *   "items": [
   *     { "product_id": 1, "qty": 2, "notes": "No onion" }
   *   ],
   *   "client_order_id": "unique-client-id-123"
   * }
   */
  @Post(':token/order')
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @Param('token') token: string,
    @Body() body: CreateOrderRequest,
  ) {
    return this.qrService.createOrder(token, body);
  }

  /**
   * GET /v1/qr/:token/order/:orderId
   * Get order status and details
   */
  @Get(':token/order/:orderId')
  async getOrder(
    @Param('token') token: string,
    @Param('orderId') orderId: string,
  ) {
    return this.qrService.getOrder(token, orderId);
  }

  /**
   * Health check endpoint
   */
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      service: 'qr-bff',
      timestamp: new Date().toISOString(),
    };
  }
}
