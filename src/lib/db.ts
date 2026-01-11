import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
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
    const pool = globalForPrisma.pool ?? new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.pool = pool;
    }

    const client = new PrismaClient({
      adapter,
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
