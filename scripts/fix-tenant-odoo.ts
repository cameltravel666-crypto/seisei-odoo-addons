/**
 * Fix tenant Odoo connection settings
 * Usage: npx tsx scripts/fix-tenant-odoo.ts TEN-DEMO01 https://testodoo.seisei.tokyo odoo18test
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

async function main() {
  const [tenantCode, odooBaseUrl, odooDb] = process.argv.slice(2);

  if (!tenantCode || !odooBaseUrl || !odooDb) {
    console.error('Usage: npx tsx scripts/fix-tenant-odoo.ts <tenantCode> <odooBaseUrl> <odooDb>');
    console.error('Example: npx tsx scripts/fix-tenant-odoo.ts TEN-DEMO01 https://testodoo.seisei.tokyo odoo18test');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Find tenant
    const tenant = await prisma.tenant.findUnique({
      where: { tenantCode },
    });

    if (!tenant) {
      console.error(`Tenant ${tenantCode} not found`);
      process.exit(1);
    }

    console.log('Current settings:');
    console.log(`  odooBaseUrl: ${tenant.odooBaseUrl}`);
    console.log(`  odooDb: ${tenant.odooDb}`);
    console.log('');

    // Update tenant
    const updated = await prisma.tenant.update({
      where: { tenantCode },
      data: {
        odooBaseUrl,
        odooDb,
      },
    });

    console.log('Updated settings:');
    console.log(`  odooBaseUrl: ${updated.odooBaseUrl}`);
    console.log(`  odooDb: ${updated.odooDb}`);
    console.log('');
    console.log('Tenant updated successfully!');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
