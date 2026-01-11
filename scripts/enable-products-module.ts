import 'dotenv/config';
import { prisma } from '../src/lib/db';

async function main() {
  console.log('Enabling PRODUCTS module for all tenants...\n');

  // Get all tenants
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true, tenantCode: true },
  });

  console.log(`Found ${tenants.length} active tenant(s)\n`);

  for (const tenant of tenants) {
    try {
      // Check if PRODUCTS feature already exists
      const existing = await prisma.tenantFeature.findUnique({
        where: {
          tenantId_moduleCode: {
            tenantId: tenant.id,
            moduleCode: 'PRODUCTS',
          },
        },
      });

      if (existing) {
        if (existing.isAllowed && existing.isVisible) {
          console.log(`✓ ${tenant.name} (${tenant.tenantCode}): PRODUCTS already enabled`);
        } else {
          // Update to enable
          await prisma.tenantFeature.update({
            where: { id: existing.id },
            data: { isAllowed: true, isVisible: true },
          });
          console.log(`✓ ${tenant.name} (${tenant.tenantCode}): PRODUCTS enabled (was disabled)`);
        }
      } else {
        // Create new feature
        await prisma.tenantFeature.create({
          data: {
            tenantId: tenant.id,
            moduleCode: 'PRODUCTS',
            isAllowed: true,
            isVisible: true,
          },
        });
        console.log(`✓ ${tenant.name} (${tenant.tenantCode}): PRODUCTS created and enabled`);
      }
    } catch (error) {
      console.error(`✗ ${tenant.name} (${tenant.tenantCode}): ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('\nDone!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
