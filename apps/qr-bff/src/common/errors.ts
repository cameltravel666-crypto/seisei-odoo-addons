import { HttpException, HttpStatus } from '@nestjs/common';

export class TokenNotFoundError extends HttpException {
  constructor(token: string) {
    super(
      {
        code: 'TOKEN_NOT_FOUND',
        message: `Token not found or expired: ${token.substring(0, 8)}...`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class TokenExpiredError extends HttpException {
  constructor(token: string) {
    super(
      {
        code: 'TOKEN_EXPIRED',
        message: `Token has expired: ${token.substring(0, 8)}...`,
      },
      HttpStatus.GONE,
    );
  }
}

export class TokenDisabledError extends HttpException {
  constructor(token: string) {
    super(
      {
        code: 'TOKEN_DISABLED',
        message: `Token is disabled: ${token.substring(0, 8)}...`,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class OdooConnectionError extends HttpException {
  constructor(message: string) {
    super(
      {
        code: 'ODOO_CONNECTION_ERROR',
        message: `Failed to connect to Odoo: ${message}`,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

export class OdooAuthError extends HttpException {
  constructor(tenantDb: string) {
    super(
      {
        code: 'ODOO_AUTH_ERROR',
        message: `Failed to authenticate with Odoo for database: ${tenantDb}`,
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class OdooRpcError extends HttpException {
  constructor(method: string, error: string) {
    super(
      {
        code: 'ODOO_RPC_ERROR',
        message: `Odoo RPC error in ${method}: ${error}`,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class OrderNotFoundError extends HttpException {
  constructor(orderId: string) {
    super(
      {
        code: 'ORDER_NOT_FOUND',
        message: `Order not found: ${orderId}`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
