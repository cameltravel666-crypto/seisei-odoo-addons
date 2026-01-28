import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { QrLogger } from '../common/logger';
import {
  TokenNotFoundError,
  TokenExpiredError,
  TokenDisabledError,
} from '../common/errors';

export interface TokenInfo {
  token: string;
  tenantDb: string;
  storeId?: number;
  tableId?: number;
  tableName?: string;
  expiresAt?: Date;
  status: 'active' | 'disabled' | 'expired';
}

const TOKEN_PREFIX = 'qr:token:';
const TOKEN_TTL = 365 * 24 * 60 * 60; // 1 year in seconds

@Injectable()
export class TokenService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis | null = null;
  private logger = new QrLogger('TokenService');
  private domainDbMap: Record<string, string>;

  constructor(private configService: ConfigService) {
    this.domainDbMap = this.configService.get('domainDbMap') || {};
  }

  async onModuleInit() {
    const redisConfig = this.configService.get('redis');
    if (!redisConfig) {
      this.logger.warn('Redis not configured, using fallback mode');
      return;
    }

    try {
      this.redis = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password || undefined,
        db: redisConfig.db,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.error('Redis connection failed after 3 retries');
            return null;
          }
          return Math.min(times * 200, 1000);
        },
      });

      this.redis.on('connect', () => {
        this.logger.log('Connected to Redis');
      });

      this.redis.on('error', (err) => {
        this.logger.error(`Redis error: ${err.message}`);
      });
    } catch (error) {
      this.logger.error(`Failed to initialize Redis: ${error}`);
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  /**
   * Get token info from Redis or fallback to default mapping
   */
  async getTokenInfo(token: string): Promise<TokenInfo> {
    // Try Redis first
    if (this.redis) {
      try {
        const data = await this.redis.get(`${TOKEN_PREFIX}${token}`);
        if (data) {
          const tokenData = JSON.parse(data);

          // Check expiration
          if (tokenData.expiresAt && new Date(tokenData.expiresAt) < new Date()) {
            throw new TokenExpiredError(token);
          }

          // Check status
          if (tokenData.status === 'disabled') {
            throw new TokenDisabledError(token);
          }

          return {
            token,
            tenantDb: tokenData.tenantDb,
            storeId: tokenData.storeId,
            tableId: tokenData.tableId,
            tableName: tokenData.tableName,
            expiresAt: tokenData.expiresAt
              ? new Date(tokenData.expiresAt)
              : undefined,
            status: tokenData.status || 'active',
          };
        }
      } catch (error) {
        if (
          error instanceof TokenExpiredError ||
          error instanceof TokenDisabledError
        ) {
          throw error;
        }
        this.logger.warn(`Redis lookup failed: ${error}`);
      }
    }

    // Fallback: use default database (for demo/testing)
    const defaultDb = this.configService.get<string>('defaultDb');
    if (defaultDb) {
      this.logger.log(
        `Token not in Redis, using default db: ${defaultDb}`,
      );
      return {
        token,
        tenantDb: defaultDb,
        status: 'active',
      };
    }

    throw new TokenNotFoundError(token);
  }

  /**
   * Create or update a token in Redis
   */
  async setToken(
    token: string,
    info: Omit<TokenInfo, 'token'>,
  ): Promise<void> {
    if (!this.redis) {
      this.logger.warn('Redis not available, token not persisted');
      return;
    }

    const data = {
      tenantDb: info.tenantDb,
      storeId: info.storeId,
      tableId: info.tableId,
      tableName: info.tableName,
      expiresAt: info.expiresAt?.toISOString(),
      status: info.status,
    };

    await this.redis.setex(
      `${TOKEN_PREFIX}${token}`,
      TOKEN_TTL,
      JSON.stringify(data),
    );

    this.logger.log(`Token saved: ${token.substring(0, 8)}... -> ${info.tenantDb}`);
  }

  /**
   * Delete a token from Redis
   */
  async deleteToken(token: string): Promise<void> {
    if (!this.redis) {
      return;
    }
    await this.redis.del(`${TOKEN_PREFIX}${token}`);
  }

  /**
   * Disable a token (soft delete)
   */
  async disableToken(token: string): Promise<void> {
    const info = await this.getTokenInfo(token);
    info.status = 'disabled';
    await this.setToken(token, info);
  }
}
