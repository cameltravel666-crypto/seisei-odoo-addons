import { PrismaClient, ModuleCode } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // Create subscription plans
  const plans = [
    {
      planCode: 'basic',
      name: 'Basic Plan',
      allowedModules: ['DASHBOARD', 'POS'],
      maxUsers: 3,
      priceMonthly: 0,
    },
    {
      planCode: 'standard',
      name: 'Standard Plan',
      allowedModules: ['DASHBOARD', 'POS', 'INVENTORY', 'EXPENSES', 'APPROVALS'],
      maxUsers: 10,
      priceMonthly: 9800,
    },
    {
      planCode: 'premium',
      name: 'Premium Plan',
      allowedModules: [
        'DASHBOARD',
        'POS',
        'INVENTORY',
        'PURCHASE',
        'SALES',
        'CRM',
        'EXPENSES',
        'ACCOUNTING',
        'APPROVALS',
        'HR',
        'MAINTENANCE',
        'DOCUMENTS',
      ],
      maxUsers: 50,
      priceMonthly: 29800,
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { planCode: plan.planCode },
      update: plan,
      create: plan,
    });
  }

  console.log('Created subscription plans');

  // Create demo tenant
  const tenantData = {
    tenantCode: 'TEN-DEMO01',
    name: 'Demo Store',
    odooBaseUrl: process.env.DEFAULT_ODOO_URL || 'http://localhost:8069',
    odooDb: process.env.DEFAULT_ODOO_DB || 'odoo',
    planCode: 'premium',
    isActive: true,
  };
  const demoTenant = await prisma.tenant.upsert({
    where: { tenantCode: 'TEN-DEMO01' },
    update: {
      odooBaseUrl: tenantData.odooBaseUrl,
      odooDb: tenantData.odooDb,
    },
    create: tenantData,
  });

  console.log('Created demo tenant:', demoTenant.tenantCode);

  // Create tenant features for demo tenant
  const allModules: ModuleCode[] = [
    'DASHBOARD',
    'POS',
    'INVENTORY',
    'PURCHASE',
    'SALES',
    'CRM',
    'EXPENSES',
    'ACCOUNTING',
    'APPROVALS',
    'HR',
    'MAINTENANCE',
    'DOCUMENTS',
  ];

  for (const moduleCode of allModules) {
    await prisma.tenantFeature.upsert({
      where: {
        tenantId_moduleCode: {
          tenantId: demoTenant.id,
          moduleCode,
        },
      },
      update: {},
      create: {
        tenantId: demoTenant.id,
        moduleCode,
        isAllowed: true,
        isVisible: true,
      },
    });
  }

  console.log('Created tenant features');

  // Create expense types
  const expenseTypes = [
    { code: 'CASH_PURCHASE', nameEn: 'Cash Purchases', nameZh: '现金采购', nameJa: '現金仕入高', sortOrder: 1 },
    { code: 'TAXES_DUTIES', nameEn: 'Taxes & Duties', nameZh: '税费', nameJa: '租税公課', sortOrder: 2 },
    { code: 'PACKING_FREIGHT', nameEn: 'Packing & Freight', nameZh: '包装运费', nameJa: '荷造運賃', sortOrder: 3 },
    { code: 'UTILITIES', nameEn: 'Utilities', nameZh: '水电费', nameJa: '水道光熱費', sortOrder: 4 },
    { code: 'TRAVEL', nameEn: 'Travel & Transportation', nameZh: '差旅交通费', nameJa: '旅費交通費', sortOrder: 5 },
    { code: 'COMMUNICATION', nameEn: 'Communication', nameZh: '通信费', nameJa: '通信費', sortOrder: 6 },
    { code: 'ENTERTAINMENT', nameEn: 'Entertainment', nameZh: '招待费', nameJa: '接待交際費', sortOrder: 7 },
    { code: 'CONSUMABLES', nameEn: 'Consumables', nameZh: '消耗品', nameJa: '消耗品費', sortOrder: 8 },
    { code: 'WAGES', nameEn: 'Wages & Salaries', nameZh: '工资', nameJa: '給料賃金', sortOrder: 9 },
    { code: 'RENT', nameEn: 'Rent', nameZh: '租金', nameJa: '地代家賃', sortOrder: 10 },
    { code: 'MISCELLANEOUS', nameEn: 'Miscellaneous', nameZh: '杂费', nameJa: '雑費', sortOrder: 11 },
    { code: 'ACCOUNTS_PAYABLE', nameEn: 'Accounts Payable', nameZh: '应付款项', nameJa: '買掛金支払', sortOrder: 12 },
    { code: 'CURRENT_DEPOSIT', nameEn: 'Current Account Deposit', nameZh: '活期存款', nameJa: '当座預金預入', sortOrder: 13 },
    { code: 'SAVINGS_DEPOSIT', nameEn: 'Savings Deposit', nameZh: '储蓄存款', nameJa: '普通預金預入', sortOrder: 14 },
    { code: 'OWNER_DRAWING', nameEn: "Owner's Drawing", nameZh: '业主借款', nameJa: '事業主貸', sortOrder: 15 },
  ];

  for (const expenseType of expenseTypes) {
    await prisma.expenseType.upsert({
      where: { code: expenseType.code },
      update: expenseType,
      create: expenseType,
    });
  }

  console.log('Created expense types');

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
