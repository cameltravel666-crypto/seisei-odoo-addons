import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { QrLogger } from '../common/logger';
import {
  OdooConnectionError,
  OdooAuthError,
  OdooRpcError,
} from '../common/errors';

interface AuthCache {
  uid: number;
  timestamp: number;
}

@Injectable()
export class OdooClient implements OnModuleInit {
  private client: AxiosInstance;
  private logger = new QrLogger('OdooClient');
  private authCache: Map<string, AuthCache> = new Map();
  private readonly AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private odooUrl: string;
  private serviceLogin: string;
  private servicePassword: string;
  private timeout: number;
  private retries: number;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.odooUrl = this.configService.get<string>('odoo.url')!;
    this.serviceLogin = this.configService.get<string>('odoo.serviceLogin')!;
    this.servicePassword = this.configService.get<string>(
      'odoo.servicePassword',
    )!;
    this.timeout = this.configService.get<number>('odoo.timeout')!;
    this.retries = this.configService.get<number>('odoo.retries')!;

    this.client = axios.create({
      baseURL: this.odooUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.logger.log(`OdooClient initialized with URL: ${this.odooUrl}`);
  }

  /**
   * Build the X-Odoo-dbfilter header value for a given tenant database
   * Uses exact match format (not regex) for seisei_db_router
   */
  buildDbHeader(tenantDb: string): string {
    // seisei_db_router expects exact database name in the header
    return tenantDb;
  }

  /**
   * Authenticate with Odoo and cache the UID
   */
  async authenticate(tenantDb: string): Promise<number> {
    const cacheKey = `${tenantDb}:${this.serviceLogin}`;
    const cached = this.authCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.AUTH_CACHE_TTL) {
      return cached.uid;
    }

    const startTime = Date.now();
    try {
      const response = await this.client.post(
        '/jsonrpc',
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            service: 'common',
            method: 'authenticate',
            args: [tenantDb, this.serviceLogin, this.servicePassword, {}],
          },
          id: Date.now(),
        },
        {
          headers: {
            'X-Odoo-dbfilter': this.buildDbHeader(tenantDb),
          },
        },
      );

      const latency = Date.now() - startTime;

      if (response.data.error) {
        this.logger.logRequest({
          action: 'authenticate',
          tenantDb,
          latency,
          status: 'error',
          error: response.data.error.message || 'Authentication failed',
        });
        throw new OdooAuthError(tenantDb);
      }

      const uid = response.data.result;
      if (!uid) {
        this.logger.logRequest({
          action: 'authenticate',
          tenantDb,
          latency,
          status: 'error',
          error: 'Invalid credentials',
        });
        throw new OdooAuthError(tenantDb);
      }

      // Cache the authentication
      this.authCache.set(cacheKey, { uid, timestamp: Date.now() });

      this.logger.logRequest({
        action: 'authenticate',
        tenantDb,
        latency,
        status: 'success',
      });

      return uid;
    } catch (error) {
      if (error instanceof OdooAuthError) {
        throw error;
      }
      const axiosError = error as AxiosError;
      throw new OdooConnectionError(
        axiosError.message || 'Connection failed',
      );
    }
  }

  /**
   * Execute a method on an Odoo model using JSON-RPC
   */
  async executeKw<T = any>(
    tenantDb: string,
    model: string,
    method: string,
    args: any[] = [],
    kwargs: Record<string, any> = {},
    retryCount = 0,
  ): Promise<T> {
    const uid = await this.authenticate(tenantDb);
    const startTime = Date.now();

    try {
      const response = await this.client.post(
        '/jsonrpc',
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            service: 'object',
            method: 'execute_kw',
            args: [
              tenantDb,
              uid,
              this.servicePassword,
              model,
              method,
              args,
              kwargs,
            ],
          },
          id: Date.now(),
        },
        {
          headers: {
            'X-Odoo-dbfilter': this.buildDbHeader(tenantDb),
          },
        },
      );

      const latency = Date.now() - startTime;

      if (response.data.error) {
        const errorMsg =
          response.data.error.data?.message ||
          response.data.error.message ||
          'RPC Error';

        this.logger.logRequest({
          action: `executeKw:${model}.${method}`,
          tenantDb,
          latency,
          status: 'error',
          error: errorMsg,
        });

        throw new OdooRpcError(`${model}.${method}`, errorMsg);
      }

      this.logger.logRequest({
        action: `executeKw:${model}.${method}`,
        tenantDb,
        latency,
        status: 'success',
      });

      return response.data.result as T;
    } catch (error) {
      if (error instanceof OdooRpcError) {
        throw error;
      }

      const axiosError = error as AxiosError;

      // Retry on connection errors
      if (retryCount < this.retries && this.isRetryableError(axiosError)) {
        this.logger.warn(
          `Retrying ${model}.${method} (attempt ${retryCount + 1})`,
        );
        return this.executeKw(
          tenantDb,
          model,
          method,
          args,
          kwargs,
          retryCount + 1,
        );
      }

      throw new OdooConnectionError(axiosError.message || 'Connection failed');
    }
  }

  private isRetryableError(error: AxiosError): boolean {
    // Retry on network errors or 5xx server errors
    if (!error.response) {
      return true; // Network error
    }
    return error.response.status >= 500;
  }
}
