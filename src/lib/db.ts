import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

function createPrismaClient() {
  if (!connectionString) {
    console.error('[Prisma] DATABASE_URL environment variable is not set');
    throw new Error('DATABASE_URL environment variable is not set');
  }

  try {
    // Prisma 7: 直接使用 PrismaClient，DATABASE_URL 从环境变量读取
    const client = new PrismaClient({
      datasourceUrl: connectionString,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

    console.log('[Prisma] Client created successfully');
    return client;
  } catch (err) {
    console.error('[Prisma] Failed to create client:', err);
    throw err;
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
