import { PrismaClient, ModuleCode, ProductType, ProductCategory, Role, MembershipStatus, EntitlementStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...\n');

  // ============================================
  // 1. Subscription Products (from Odoo 19)
  // ============================================
  console.log('1. Creating subscription products...');

  const products = [
    // === 基础套餐 (BASE_PLAN) ===
    {
      productCode: 'SW-PLAN-START',
      name: 'Starter',
      nameZh: '入门版',
      nameJa: 'スターター',
      description: 'Basic POS features for small shops',
      descriptionZh: '基础POS功能，适合小型店铺',
      descriptionJa: '小規模店舗向けの基本POS機能',
      productType: 'BASE_PLAN' as ProductType,
      category: 'PLAN' as ProductCategory,
      priceMonthly: 0,
      includedModules: ['DASHBOARD', 'POS'],
      maxUsers: 2,
      maxTerminals: 1,
      trialDays: 14,
      odoo19ProductId: 36,
      sortOrder: 1,
    },
    {
      productCode: 'SW-PLAN-OPS-B',
      name: 'Ops Basic',
      nameZh: '运营基础版',
      nameJa: 'Ops ベーシック',
      description: 'For small to medium F&B businesses',
      descriptionZh: '适合中小型餐饮店铺',
      descriptionJa: '中小規模の飲食店向け',
      productType: 'BASE_PLAN' as ProductType,
      category: 'PLAN' as ProductCategory,
      priceMonthly: 9800,
      includedModules: ['DASHBOARD', 'POS', 'INVENTORY'],
      maxUsers: 5,
      maxTerminals: 2,
      trialDays: 14,
      odoo19ProductId: 37,
      sortOrder: 2,
    },
    {
      productCode: 'SW-PLAN-OPS-A',
      name: 'Ops Auto',
      nameZh: '运营自动版',
      nameJa: 'Ops オート',
      description: 'Automated operations for chain stores',
      descriptionZh: '自动化运营，适合连锁店铺',
      descriptionJa: 'チェーン店向けの自動化運営',
      productType: 'BASE_PLAN' as ProductType,
      category: 'PLAN' as ProductCategory,
      priceMonthly: 19800,
      includedModules: ['DASHBOARD', 'POS', 'INVENTORY', 'PURCHASE'],
      maxUsers: 10,
      maxTerminals: 5,
      trialDays: 14,
      odoo19ProductId: 38,
      sortOrder: 3,
    },

    // === 功能模块 (MODULE) ===
    {
      productCode: 'SW-MOD-CRM',
      name: 'Customer Management',
      nameZh: '会员管理',
      nameJa: '顧客管理',
      description: 'Loyalty points and coupon management',
      descriptionZh: '会员积分、优惠券管理',
      descriptionJa: 'ポイント・クーポン管理',
      productType: 'MODULE' as ProductType,
      category: 'MODULE' as ProductCategory,
      priceMonthly: 3000,
      includedModules: [],
      enablesModule: 'CRM',
      odoo19ProductId: 42,
      sortOrder: 10,
    },
    {
      productCode: 'SW-MOD-CASH',
      name: 'Cash Book',
      nameZh: '现金账簿',
      nameJa: '現金出納帳',
      description: 'Daily cash transaction records',
      descriptionZh: '现金收支记录',
      descriptionJa: '現金収支の記録',
      productType: 'MODULE' as ProductType,
      category: 'MODULE' as ProductCategory,
      priceMonthly: 3000,
      includedModules: [],
      enablesModule: 'ACCOUNTING',
      odoo19ProductId: 43,
      sortOrder: 11,
    },
    {
      productCode: 'SW-MOD-ACC-P',
      name: 'Accounting Pro',
      nameZh: '会计专业版',
      nameJa: '会計プロ',
      description: 'Professional accounting features',
      descriptionZh: '专业会计功能',
      descriptionJa: 'プロフェッショナル会計機能',
      productType: 'MODULE' as ProductType,
      category: 'MODULE' as ProductCategory,
      priceMonthly: 9800,
      includedModules: [],
      enablesModule: 'FINANCE',
      odoo19ProductId: 44,
      sortOrder: 12,
    },
    {
      productCode: 'SW-MOD-ACC-E',
      name: 'Accounting Enterprise',
      nameZh: '会计企业版',
      nameJa: '会計エンタープライズ',
      description: 'Enterprise-grade accounting',
      descriptionZh: '企业级会计功能',
      descriptionJa: 'エンタープライズ級会計機能',
      productType: 'MODULE' as ProductType,
      category: 'MODULE' as ProductCategory,
      priceMonthly: 19800,
      includedModules: [],
      enablesModule: 'FINANCE',
      odoo19ProductId: 45,
      sortOrder: 13,
    },
    {
      productCode: 'SW-MOD-PAYROLL',
      name: 'Payroll',
      nameZh: '工资管理',
      nameJa: '給与計算',
      description: 'Employee payroll calculation',
      descriptionZh: '员工工资计算',
      descriptionJa: '従業員給与計算',
      productType: 'MODULE' as ProductType,
      category: 'MODULE' as ProductCategory,
      priceMonthly: 9800,
      includedModules: [],
      enablesModule: 'HR',
      odoo19ProductId: 46,
      sortOrder: 14,
    },
    {
      productCode: 'SW-MOD-QR',
      name: 'Table Service',
      nameZh: '桌台服务',
      nameJa: 'テーブルサービス',
      description: 'QR ordering and table management: table status, QR codes, orders',
      descriptionZh: '桌台管理与扫码点餐：开台管理、QR码、订单接收',
      descriptionJa: 'テーブル管理とQRオーダー：テーブル状態、QRコード、注文受付',
      productType: 'MODULE' as ProductType,
      category: 'MODULE' as ProductCategory,
      priceMonthly: 2980,
      includedModules: [],
      enablesModule: 'QR_ORDERING',
      odoo19ProductId: 39,
      sortOrder: 15,
    },
    {
      productCode: 'SW-MOD-RECPT',
      name: 'Receipt Issuance',
      nameZh: '发票开具',
      nameJa: '領収書発行',
      description: 'Electronic receipt issuance',
      descriptionZh: '电子发票功能',
      descriptionJa: '電子領収書発行',
      productType: 'MODULE' as ProductType,
      category: 'MODULE' as ProductCategory,
      priceMonthly: 3000,
      includedModules: [],
      odoo19ProductId: 40,
      sortOrder: 16,
    },
    {
      productCode: 'SW-MOD-BI',
      name: 'Advanced BI Analytics',
      nameZh: '高级数据分析',
      nameJa: '高度なBI分析',
      description: 'Deep business insights: multi-dimensional analysis, YoY comparison, sales forecasting, Excel/PDF export',
      descriptionZh: '深度商业洞察：多维度分析、同比对比、销售预测、Excel/PDF导出、数据大屏',
      descriptionJa: '多次元分析、前年比較、売上予測、Excel/PDF出力、データダッシュボード',
      productType: 'MODULE' as ProductType,
      category: 'MODULE' as ProductCategory,
      priceMonthly: 12800,
      includedModules: [],
      enablesModule: 'BI',
      odoo19ProductId: 41,
      sortOrder: 17,
    },

    // === 终端许可 (TERMINAL) ===
    {
      productCode: 'SW-TERM-POS-ADD',
      name: 'Additional POS Terminal',
      nameZh: 'POS追加终端',
      nameJa: '追加POSターミナル',
      description: 'Additional POS terminal license',
      descriptionZh: '额外POS终端许可',
      descriptionJa: '追加POSターミナルライセンス',
      productType: 'ADDON' as ProductType,
      category: 'TERMINAL' as ProductCategory,
      priceMonthly: 1500,
      includedModules: [],
      odoo19ProductId: 47,
      sortOrder: 20,
    },
    {
      productCode: 'SW-TERM-KDS',
      name: 'KDS License',
      nameZh: 'KDS许可',
      nameJa: 'KDSライセンス',
      description: 'Kitchen display system license',
      descriptionZh: '厨房显示系统许可',
      descriptionJa: 'キッチンディスプレイシステムライセンス',
      productType: 'ADDON' as ProductType,
      category: 'TERMINAL' as ProductCategory,
      priceMonthly: 3500,
      includedModules: [],
      odoo19ProductId: 48,
      sortOrder: 21,
    },
    {
      productCode: 'SW-TERM-PRINT',
      name: 'Print Hub',
      nameZh: '打印中心',
      nameJa: 'プリントハブ',
      description: 'Centralized print management',
      descriptionZh: '打印管理中心',
      descriptionJa: '印刷管理センター',
      productType: 'ADDON' as ProductType,
      category: 'TERMINAL' as ProductCategory,
      priceMonthly: 1980,
      includedModules: [],
      odoo19ProductId: 49,
      sortOrder: 22,
    },
    {
      productCode: 'SW-TERM-PRINT-ADD',
      name: 'Additional Print Endpoint',
      nameZh: '追加打印端点',
      nameJa: '追加プリントエンドポイント',
      description: 'Additional print endpoint',
      descriptionZh: '额外打印端点',
      descriptionJa: '追加印刷エンドポイント',
      productType: 'ADDON' as ProductType,
      category: 'TERMINAL' as ProductCategory,
      priceMonthly: 300,
      includedModules: [],
      odoo19ProductId: 50,
      sortOrder: 23,
    },
    {
      productCode: 'SW-TERM-EMP-ADD',
      name: 'Additional Payroll Employee',
      nameZh: '追加工资员工',
      nameJa: '追加給与計算対象者',
      description: 'Additional employee for payroll',
      descriptionZh: '额外工资计算员工',
      descriptionJa: '追加給与計算対象従業員',
      productType: 'ADDON' as ProductType,
      category: 'TERMINAL' as ProductCategory,
      priceMonthly: 200,
      includedModules: [],
      odoo19ProductId: 51,
      sortOrder: 24,
    },

    // === 运维服务 (MAINTENANCE) ===
    {
      productCode: 'SV-MNT-BASIC',
      name: 'Basic Maintenance',
      nameZh: '基础运维',
      nameJa: '基本メンテナンス',
      description: 'Basic technical support',
      descriptionZh: '基础技术支持',
      descriptionJa: '基本テクニカルサポート',
      productType: 'SERVICE' as ProductType,
      category: 'MAINTENANCE' as ProductCategory,
      priceMonthly: 980,
      includedModules: [],
      odoo19ProductId: 61,
      sortOrder: 30,
    },
    {
      productCode: 'SV-MNT-ADV',
      name: 'Advanced Maintenance',
      nameZh: '高级运维',
      nameJa: '高度メンテナンス',
      description: 'Advanced support with priority response',
      descriptionZh: '高级技术支持，优先响应',
      descriptionJa: '優先対応付き高度サポート',
      productType: 'SERVICE' as ProductType,
      category: 'MAINTENANCE' as ProductCategory,
      priceMonthly: 2980,
      includedModules: [],
      odoo19ProductId: 62,
      sortOrder: 31,
    },
    {
      productCode: 'SV-RPL',
      name: 'Express Replacement',
      nameZh: '先出交换',
      nameJa: 'エクスプレス交換',
      description: 'Quick device replacement service (one-time)',
      descriptionZh: '设备快速更换服务（单次）',
      descriptionJa: '機器即時交換サービス（1回）',
      productType: 'SERVICE' as ProductType,
      category: 'MAINTENANCE' as ProductCategory,
      priceMonthly: 12000,
      includedModules: [],
      odoo19ProductId: 63,
      sortOrder: 32,
    },

    // === 导入服务 (ONBOARDING) ===
    {
      productCode: 'SV-DEP-LITE',
      name: 'Lite Onboarding',
      nameZh: '轻量导入',
      nameJa: 'ライト導入',
      description: 'Basic system onboarding',
      descriptionZh: '基础系统导入服务',
      descriptionJa: '基本システム導入サービス',
      productType: 'SERVICE' as ProductType,
      category: 'ONBOARDING' as ProductCategory,
      priceMonthly: 50000,
      includedModules: [],
      odoo19ProductId: 52,
      sortOrder: 40,
    },
    {
      productCode: 'SV-DEP-STD',
      name: 'Standard Onboarding',
      nameZh: '标准导入',
      nameJa: 'スタンダード導入',
      description: 'Standard system onboarding',
      descriptionZh: '标准系统导入服务',
      descriptionJa: '標準システム導入サービス',
      productType: 'SERVICE' as ProductType,
      category: 'ONBOARDING' as ProductCategory,
      priceMonthly: 150000,
      includedModules: [],
      odoo19ProductId: 53,
      sortOrder: 41,
    },
    {
      productCode: 'SV-DEP-PRO',
      name: 'Professional Onboarding',
      nameZh: '专业导入',
      nameJa: 'プロフェッショナル導入',
      description: 'Professional system onboarding',
      descriptionZh: '专业系统导入服务',
      descriptionJa: 'プロフェッショナルシステム導入サービス',
      productType: 'SERVICE' as ProductType,
      category: 'ONBOARDING' as ProductCategory,
      priceMonthly: 300000,
      includedModules: [],
      odoo19ProductId: 54,
      sortOrder: 42,
    },

    // === 硬件租赁 (RENTAL) ===
    {
      productCode: 'HW-L-PRN-80',
      name: 'Receipt Printer Rental',
      nameZh: '小票打印机租赁',
      nameJa: 'レシートプリンターレンタル',
      description: '80mm receipt printer monthly rental',
      descriptionZh: '80mm小票打印机月租',
      descriptionJa: '80mmレシートプリンター月額レンタル',
      productType: 'HARDWARE' as ProductType,
      category: 'RENTAL' as ProductCategory,
      priceMonthly: 690,
      includedModules: [],
      odoo19ProductId: 58,
      sortOrder: 50,
    },
    {
      productCode: 'HW-L-KDS',
      name: 'KDS Terminal Rental',
      nameZh: '厨显终端租赁',
      nameJa: 'KDS端末レンタル',
      description: 'Kitchen display terminal monthly rental',
      descriptionZh: '厨房显示终端月租',
      descriptionJa: 'キッチンディスプレイ端末月額レンタル',
      productType: 'HARDWARE' as ProductType,
      category: 'RENTAL' as ProductCategory,
      priceMonthly: 3480,
      includedModules: [],
      odoo19ProductId: 59,
      sortOrder: 51,
    },
    {
      productCode: 'HW-L-POS-DS',
      name: 'POS Set Rental',
      nameZh: 'POS套装租赁',
      nameJa: 'POSセットレンタル',
      description: 'Dual-screen POS set monthly rental',
      descriptionZh: 'POS双屏套装月租',
      descriptionJa: 'デュアルスクリーンPOSセット月額レンタル',
      productType: 'HARDWARE' as ProductType,
      category: 'RENTAL' as ProductCategory,
      priceMonthly: 3980,
      includedModules: [],
      odoo19ProductId: 60,
      sortOrder: 52,
    },
  ];

  for (const product of products) {
    await prisma.subscriptionProduct.upsert({
      where: { productCode: product.productCode },
      update: {
        name: product.name,
        nameZh: product.nameZh,
        nameJa: product.nameJa,
        description: product.description,
        descriptionZh: product.descriptionZh,
        descriptionJa: product.descriptionJa,
        productType: product.productType,
        category: product.category,
        priceMonthly: product.priceMonthly,
        includedModules: product.includedModules,
        enablesModule: product.enablesModule,
        maxUsers: product.maxUsers,
        maxTerminals: product.maxTerminals,
        trialDays: product.trialDays || 0,
        odoo19ProductId: product.odoo19ProductId,
        sortOrder: product.sortOrder,
      },
      create: product,
    });
  }
  console.log(`   Created ${products.length} subscription products\n`);

  // ============================================
  // 2. Legacy Subscription Plans (for backward compatibility)
  // ============================================
  console.log('2. Creating legacy subscription plans...');

  const plans = [
    {
      planCode: 'starter',
      name: 'Starter',
      allowedModules: ['DASHBOARD', 'POS'],
      maxUsers: 2,
      priceMonthly: 0,
      priceYearly: 0,
      trialDays: 14,
      odoo19ProductId: 36,
    },
    {
      planCode: 'ops-basic',
      name: 'Ops Basic',
      allowedModules: ['DASHBOARD', 'POS', 'INVENTORY'],
      maxUsers: 5,
      priceMonthly: 9800,
      priceYearly: 98000,
      trialDays: 14,
      odoo19ProductId: 37,
    },
    {
      planCode: 'ops-auto',
      name: 'Ops Auto',
      allowedModules: ['DASHBOARD', 'POS', 'INVENTORY', 'PURCHASE'],
      maxUsers: 10,
      priceMonthly: 19800,
      priceYearly: 198000,
      trialDays: 14,
      odoo19ProductId: 38,
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { planCode: plan.planCode },
      update: plan,
      create: plan,
    });
  }
  console.log(`   Created ${plans.length} legacy plans\n`);

  // ============================================
  // 3. Demo Tenant
  // ============================================
  console.log('3. Creating demo tenant...');

  const tenantData = {
    tenantCode: 'TEN-DEMO01',
    name: 'Demo Store',
    odooBaseUrl: process.env.DEFAULT_ODOO_URL || 'http://localhost:8069',
    odooDb: process.env.DEFAULT_ODOO_DB || 'odoo',
    planCode: 'ops-basic',
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
  console.log(`   Created tenant: ${demoTenant.tenantCode}\n`);

  // ============================================
  // 4. Tenant Features
  // ============================================
  console.log('4. Creating tenant features...');

  const enabledModules: ModuleCode[] = [
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
    'PRODUCTS',
    'CONTACTS',
  ];

  for (const moduleCode of enabledModules) {
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
  console.log(`   Created ${enabledModules.length} tenant features\n`);

  // ============================================
  // 5. Entitlements for Demo Tenant
  // ============================================
  console.log('5. Creating entitlements for demo tenant...');

  await prisma.entitlements.upsert({
    where: { tenantId: demoTenant.id },
    update: {
      modules: enabledModules,
      maxUsers: 10,
      maxStores: 3,
      maxTerminals: 5,
      status: 'ACTIVE' as EntitlementStatus,
      source: 'manual',
    },
    create: {
      tenantId: demoTenant.id,
      modules: enabledModules,
      maxUsers: 10,
      maxStores: 3,
      maxTerminals: 5,
      status: 'ACTIVE' as EntitlementStatus,
      source: 'manual',
    },
  });
  console.log('   Created entitlements for demo tenant\n');

  // ============================================
  // 6. Demo Users with Memberships
  // ============================================
  console.log('6. Creating demo users with memberships...');

  const demoUsers = [
    {
      odooUserId: 2,
      odooLogin: 'admin',
      displayName: 'Demo Admin',
      email: 'admin@demo.seisei.co.jp',
      isAdmin: true,
      role: 'ORG_ADMIN' as Role,
      storeScope: [] as string[],
    },
    {
      odooUserId: 6,
      odooLogin: 'manager',
      displayName: 'Demo Manager',
      email: 'manager@demo.seisei.co.jp',
      isAdmin: false,
      role: 'MANAGER' as Role,
      storeScope: ['1'] as string[],  // Specific store
    },
    {
      odooUserId: 7,
      odooLogin: 'operator',
      displayName: 'Demo Operator',
      email: 'operator@demo.seisei.co.jp',
      isAdmin: false,
      role: 'OPERATOR' as Role,
      storeScope: [] as string[],
    },
  ];

  for (const userData of demoUsers) {
    // Create or update user
    const user = await prisma.user.upsert({
      where: {
        tenantId_odooUserId: {
          tenantId: demoTenant.id,
          odooUserId: userData.odooUserId,
        },
      },
      update: {
        displayName: userData.displayName,
        email: userData.email,
        isAdmin: userData.isAdmin,
      },
      create: {
        tenantId: demoTenant.id,
        odooUserId: userData.odooUserId,
        odooLogin: userData.odooLogin,
        displayName: userData.displayName,
        email: userData.email,
        isAdmin: userData.isAdmin,
      },
    });

    // Create or update membership
    await prisma.membership.upsert({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: demoTenant.id,
        },
      },
      update: {
        role: userData.role,
        storeScope: userData.storeScope,
        status: 'ACTIVE' as MembershipStatus,
      },
      create: {
        userId: user.id,
        tenantId: demoTenant.id,
        role: userData.role,
        storeScope: userData.storeScope,
        status: 'ACTIVE' as MembershipStatus,
        activatedAt: new Date(),
      },
    });

    console.log(`   Created user: ${userData.displayName} (${userData.role})`);
  }
  console.log('');

  // ============================================
  // 7. Expense Types
  // ============================================
  console.log('7. Creating expense types...');

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
  console.log(`   Created ${expenseTypes.length} expense types\n`);

  console.log('✅ Seed completed!');
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
