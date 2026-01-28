import { Logger } from '@nestjs/common';

export class QrLogger {
  private logger: Logger;

  constructor(context: string) {
    this.logger = new Logger(context);
  }

  /**
   * Log a QR request with relevant context
   */
  logRequest(params: {
    action: string;
    token?: string;
    tenantDb?: string;
    orderId?: string;
    latency?: number;
    status: 'success' | 'error';
    error?: string;
  }) {
    const { action, token, tenantDb, orderId, latency, status, error } = params;
    const tokenShort = token ? `${token.substring(0, 8)}...` : 'N/A';

    const message = [
      `[${action}]`,
      `token=${tokenShort}`,
      tenantDb ? `db=${tenantDb}` : '',
      orderId ? `order=${orderId}` : '',
      latency !== undefined ? `latency=${latency}ms` : '',
      `status=${status}`,
      error ? `error=${error}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (status === 'error') {
      this.logger.error(message);
    } else {
      this.logger.log(message);
    }
  }

  log(message: string) {
    this.logger.log(message);
  }

  error(message: string, trace?: string) {
    this.logger.error(message, trace);
  }

  warn(message: string) {
    this.logger.warn(message);
  }

  debug(message: string) {
    this.logger.debug(message);
  }
}
