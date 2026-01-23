# 🎯 Seisei BizNexus 订阅管理完整方案

**日期**: 2026-01-11  
**基于**: 实际双服务器环境

---

## 📊 实际环境架构

### 服务器配置

```
┌──────────────────────────────────────────────────────────────┐
│  Seisei BizNexus (Next.js + Capacitor)                       │
│  https://biznexus.seisei.tokyo                               │
│  - 前端应用（iOS/Android/Web）                                 │
│  - 租户管理、用户认证                                           │
│  - 订阅状态展示                                                │
└──────────────────────────────────────────────────────────────┘
         ↓ RPC API              ↓ RPC API              ↓ Prisma
    ┌──────────┐          ┌──────────┐          ┌──────────┐
    │ Odoo 19  │          │ Odoo 18  │          │PostgreSQL│
    │ 企业版    │          │ 社区版    │          │ (Prisma) │
    └──────────┘          └──────────┘          └──────────┘
```

### 服务器 1: Odoo 19 企业版（订阅管理）

| 项目 | 值 |
|------|-----|
| **IP 地址** | 13.159.193.191 |
| **端口** | 8069 |
| **访问地址** | http://13.159.193.191:8069/odoo |
| **数据库** | ERP |
| **版本** | Odoo 19 企业版 |
| **SSH Key** | `/Users/taozhang/Projects/Pem/odoo 19 owner Server.pem` |
| **SSH 用户** | ubuntu |
| **用途** | **订阅管理**（subscription, invoice, payment） |

### 服务器 2: Odoo 18 社区版（业务数据）

| 项目 | 值 |
|------|-----|
| **IP 地址** | 54.65.127.141 |
| **端口** | 8069 |
| **访问地址** | http://54.65.127.141:8069 |
| **数据库** | test001, odoo 等 |
| **版本** | Odoo 18 社区版 |
| **SSH Key** | `~/Projects/Pem/odoo-2025.pem` |
| **SSH 用户** | ubuntu |
| **用途** | **业务数据**（POS, Inventory, CRM, Sales 等） |

### 服务器 3: Seisei BizNexus (Next.js)

| 项目 | 值 |
|------|-----|
| **IP 地址** | 54.65.127.141 (与 Odoo 18 同服务器) |
| **端口** | 3000 |
| **访问地址** | https://biznexus.seisei.tokyo |
| **数据库** | PostgreSQL (Prisma) |
| **用途** | **前端应用 + 租户管理** |

---

## 🎯 订阅管理策略

### 核心理念

```
订阅信息 = Odoo 19 (权威源) + PostgreSQL (本地缓存)
业务数据 = Odoo 18
用户界面 = Seisei BizNexus
```

### 数据流

```
1. 创建订阅:
   BizNexus → Odoo 19 (创建订阅) → PostgreSQL (缓存)

2. 计费:
   Odoo 19 (生成发票) → BizNexus (通知) → PostgreSQL (更新)

3. 功能权限:
   BizNexus → PostgreSQL (TenantFeature) → Odoo 18 (业务数据)
```

---

## 🔧 Step 1: 在 Odoo 19 上配置订阅管理

### 1.1 安装订阅模块

```bash
# SSH 连接到 Odoo 19 服务器
ssh -i "/Users/taozhang/Projects/Pem/odoo 19 owner Server.pem" ubuntu@13.159.193.191

# 确认 Odoo 运行方式
sudo docker ps | grep odoo || sudo systemctl status odoo

# 进入 Odoo 容器（如果是 Docker）
sudo docker exec -it <container_name> bash

# 或者直接在服务器执行（如果是 systemd）
# 以下步骤在 Odoo Web UI 完成更安全
```

**在 Odoo 19 Web UI 中**：
1. 访问 http://13.159.193.191:8069/odoo
2. 登录到 `ERP` 数据库
3. Apps → 搜索 `Subscriptions`
4. 安装以下模块：
   - ✅ `sale_subscription` - 订阅管理核心
   - ✅ `sale` - 销售订单
   - ✅ `account` - 会计/发票
   - ✅ `payment` - 支付处理

### 1.2 创建订阅产品

在 Odoo 19 中：**Subscriptions → Configuration → Subscription Products**

创建 3 个订阅产品：

#### 产品 1: BizNexus Basic

```
产品名称: BizNexus Basic Plan
产品类型: Service
计费周期: Monthly (1 month)
价格: ¥5,000
允许的模块:
  - DASHBOARD
  - POS
```

#### 产品 2: BizNexus Standard

```
产品名称: BizNexus Standard Plan
产品类型: Service
计费周期: Monthly (1 month)
价格: ¥15,000
允许的模块:
  - DASHBOARD
  - POS
  - INVENTORY
  - PURCHASE
  - SALES
  - CRM
```

#### 产品 3: BizNexus Premium

```
产品名称: BizNexus Premium Plan
产品类型: Service
计费周期: Monthly (1 month)
价格: ¥30,000
允许的模块:
  - ALL_MODULES
```

### 1.3 配置支付方式

**Accounting → Configuration → Payment Providers**

配置日本常用支付方式：
- 银行转账
- 信用卡（Stripe）
- PayPay（如需要）

---

## 🔧 Step 2: 更新 Seisei BizNexus 环境配置

### 2.1 更新 .env 文件

```bash
cd /opt/seisei-erp

# 备份现有 .env
sudo cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# 添加 Odoo 19 配置
sudo bash -c 'cat >> .env << EOF

# ================================
# Odoo 19 Subscription Management
# ================================
ODOO19_URL="http://13.159.193.191:8069"
ODOO19_DB="ERP"
ODOO19_USERNAME="admin"
ODOO19_PASSWORD="<your_password>"

# ================================
# Odoo 18 Business Data (已存在)
# ================================
ODOO_URL="http://10.0.1.184:8069"
ODOO_DB="test001"
ODOO_USERNAME="admin"
ODOO_PASSWORD="admin"

# ================================
# Cron Job Secret
# ================================
CRON_SECRET="<generate_random_secret_here>"
EOF'

# 重启服务应用新配置
cd /opt/seisei-erp
sudo docker compose down
sudo docker compose up -d
```

### 2.2 在 Next.js 中添加 Odoo 19 客户端

```bash
# 在本地开发
cd /Users/taozhang/Projects/Seisei\ ERP
```

创建文件：`src/lib/odoo19.ts`

```typescript
/**
 * Odoo 19 RPC Client for Subscription Management
 */

import { OdooRPC } from './odoo-rpc';

export class Odoo19Client {
  private client: OdooRPC;
  private authenticated = false;

  constructor() {
    this.client = new OdooRPC({
      baseUrl: process.env.ODOO19_URL || 'http://13.159.193.191:8069',
      db: process.env.ODOO19_DB || 'ERP',
      username: process.env.ODOO19_USERNAME || 'admin',
      password: process.env.ODOO19_PASSWORD || '',
    });
  }

  private async ensureAuth() {
    if (!this.authenticated) {
      await this.client.authenticate();
      this.authenticated = true;
    }
  }

  /**
   * 创建或获取客户 (Partner)
   */
  async createOrGetPartner(tenantData: {
    name: string;
    email?: string;
    phone?: string;
  }): Promise<number> {
    await this.ensureAuth();

    // 查找现有客户
    const partnerIds = await this.client.search('res.partner', [
      ['name', '=', tenantData.name],
    ]);

    if (partnerIds.length > 0) {
      return partnerIds[0];
    }

    // 创建新客户
    return await this.client.create('res.partner', {
      name: tenantData.name,
      email: tenantData.email,
      phone: tenantData.phone,
      is_company: true,
      customer_rank: 1,
    });
  }

  /**
   * 创建订阅
   */
  async createSubscription(params: {
    partnerId: number;
    productId: number;
    startDate: Date;
    trialDays?: number;
  }): Promise<number> {
    await this.ensureAuth();

    const nextInvoiceDate = new Date(params.startDate);
    if (params.trialDays) {
      nextInvoiceDate.setDate(nextInvoiceDate.getDate() + params.trialDays);
    } else {
      nextInvoiceDate.setMonth(nextInvoiceDate.getMonth() + 1);
    }

    // 创建销售订单（订阅类型）
    const orderId = await this.client.create('sale.order', {
      partner_id: params.partnerId,
      state: 'draft',
      order_line: [[0, 0, {
        product_id: params.productId,
        product_uom_qty: 1,
      }]],
    });

    // 确认订单
    await this.client.callKw('sale.order', 'action_confirm', [[orderId]]);

    return orderId;
  }

  /**
   * 获取订阅列表
   */
  async getSubscriptions(partnerId: number) {
    await this.ensureAuth();

    const subscriptions = await this.client.searchRead(
      'sale.order',
      [
        ['partner_id', '=', partnerId],
        ['state', '!=', 'cancel'],
      ],
      ['name', 'date_order', 'amount_total', 'state', 'invoice_status']
    );

    return subscriptions;
  }

  /**
   * 获取订阅产品列表
   */
  async getSubscriptionProducts() {
    await this.ensureAuth();

    const products = await this.client.searchRead(
      'product.template',
      [
        ['name', 'ilike', 'BizNexus'],
        ['type', '=', 'service'],
      ],
      ['id', 'name', 'list_price', 'description']
    );

    return products;
  }

  /**
   * 生成发票
   */
  async createInvoice(orderId: number): Promise<number> {
    await this.ensureAuth();

    // 调用订单的创建发票方法
    const result = await this.client.callKw(
      'sale.order',
      'action_invoice_create',
      [[orderId]]
    );

    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * 获取发票信息
   */
  async getInvoice(invoiceId: number) {
    await this.ensureAuth();

    const invoices = await this.client.searchRead(
      'account.move',
      [['id', '=', invoiceId]],
      [
        'name',
        'partner_id',
        'invoice_date',
        'invoice_date_due',
        'amount_total',
        'amount_residual',
        'state',
        'payment_state',
      ]
    );

    return invoices[0];
  }

  /**
   * 记录支付
   */
  async registerPayment(params: {
    invoiceId: number;
    amount: number;
    paymentDate: Date;
    journalId: number;
  }): Promise<number> {
    await this.ensureAuth();

    const paymentId = await this.client.create('account.payment', {
      payment_type: 'inbound',
      partner_type: 'customer',
      amount: params.amount,
      date: params.paymentDate.toISOString().split('T')[0],
      journal_id: params.journalId,
    });

    // 发布支付
    await this.client.callKw('account.payment', 'action_post', [[paymentId]]);

    return paymentId;
  }

  /**
   * 取消订阅
   */
  async cancelSubscription(orderId: number): Promise<void> {
    await this.ensureAuth();

    await this.client.callKw('sale.order', 'action_cancel', [[orderId]]);
  }
}

// 导出单例
export const odoo19 = new Odoo19Client();
```

---

## 🔧 Step 3: 更新 Prisma Schema

在 `prisma/schema.prisma` 中添加：

```prisma
// ============================================
// 订阅管理（与 Odoo 19 同步）
// ============================================

model Subscription {
  id                String   @id @default(cuid())
  tenantId          String   @map("tenant_id")
  planCode          String   @map("plan_code")
  
  // Odoo 19 集成
  odoo19OrderId        Int?     @map("odoo19_order_id")
  odoo19PartnerId      Int?     @map("odoo19_partner_id")
  odoo19ProductId      Int?     @map("odoo19_product_id")
  
  // 订阅状态
  status            SubscriptionStatus @default(ACTIVE)
  startDate         DateTime @map("start_date")
  nextBillingDate   DateTime @map("next_billing_date")
  endDate           DateTime? @map("end_date")
  
  // 计费信息
  billingCycle      BillingCycle @default(MONTHLY)
  amount            Decimal
  currency          String @default("JPY")
  autoRenew         Boolean @default(true) @map("auto_renew")
  
  // 试用期
  trialEndDate      DateTime? @map("trial_end_date")
  isInTrial         Boolean @default(false) @map("is_in_trial")
  
  // 最后同步时间
  lastSyncAt        DateTime @default(now()) @map("last_sync_at")
  
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  // Relations
  tenant            Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  plan              SubscriptionPlan @relation(fields: [planCode], references: [planCode])
  invoices          Invoice[]

  @@map("subscriptions")
}

enum SubscriptionStatus {
  TRIAL
  ACTIVE
  PAST_DUE
  CANCELLED
  EXPIRED
}

enum BillingCycle {
  MONTHLY
  QUARTERLY
  YEARLY
}

model Invoice {
  id                 String   @id @default(cuid())
  subscriptionId     String   @map("subscription_id")
  tenantId           String   @map("tenant_id")
  
  // Odoo 19 发票 ID
  odoo19InvoiceId    Int?     @map("odoo19_invoice_id")
  
  invoiceNumber      String   @unique @map("invoice_number")
  amount             Decimal
  currency           String @default("JPY")
  status             InvoiceStatus @default(DRAFT)
  
  issueDate          DateTime @map("issue_date")
  dueDate            DateTime @map("due_date")
  paidDate           DateTime? @map("paid_date")
  
  periodStart        DateTime @map("period_start")
  periodEnd          DateTime @map("period_end")
  
  // 最后同步时间
  lastSyncAt        DateTime @default(now()) @map("last_sync_at")
  
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  // Relations
  subscription       Subscription @relation(fields: [subscriptionId], references: [id])
  payments           Payment[]

  @@map("invoices")
}

enum InvoiceStatus {
  DRAFT
  OPEN
  PAID
  VOID
  UNCOLLECTIBLE
}

model Payment {
  id                 String   @id @default(cuid())
  invoiceId          String   @map("invoice_id")
  tenantId           String   @map("tenant_id")
  
  // Odoo 19 支付 ID
  odoo19PaymentId    Int?     @map("odoo19_payment_id")
  
  amount             Decimal
  currency           String @default("JPY")
  paymentMethod      PaymentMethod @map("payment_method")
  status             PaymentStatus @default(PENDING)
  
  gatewayProvider    String?  @map("gateway_provider")
  gatewayTransactionId String? @map("gateway_transaction_id")
  
  paymentDate        DateTime? @map("payment_date")
  
  // 最后同步时间
  lastSyncAt        DateTime @default(now()) @map("last_sync_at")
  
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  // Relations
  invoice            Invoice @relation(fields: [invoiceId], references: [id])

  @@map("payments")
}

enum PaymentMethod {
  CREDIT_CARD
  BANK_TRANSFER
  KONBINI
  PAYPAY
  OTHER
}

enum PaymentStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  REFUNDED
}

// 更新 Tenant 模型
model Tenant {
  // ... 现有字段 ...
  subscriptions     Subscription[]
}

// 更新 SubscriptionPlan 模型
model SubscriptionPlan {
  // ... 现有字段 ...
  odoo19ProductId   Int?     @map("odoo19_product_id")
  trialDays         Int      @default(14) @map("trial_days")
  subscriptions     Subscription[]
}
```

---

## 🔧 Step 4: 数据库迁移

```bash
# 在本地开发环境
cd /Users/taozhang/Projects/Seisei\ ERP

# 生成迁移
npx prisma migrate dev --name add_subscription_management

# 部署到生产服务器
cd /opt/seisei-erp
sudo npx prisma migrate deploy
sudo npx prisma generate
```

---

## 🔧 Step 5: 创建订阅管理 API

创建文件：`src/app/api/subscriptions/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { odoo19 } from '@/lib/odoo19';

/**
 * GET /api/subscriptions
 * 获取当前租户的订阅信息
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 从 PostgreSQL 获取缓存的订阅信息
    const subscription = await prisma.subscription.findFirst({
      where: {
        tenantId: session.tenantId,
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
      include: {
        plan: true,
        invoices: {
          orderBy: { issueDate: 'desc' },
          take: 10,
        },
      },
    });

    if (!subscription) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
    }

    // 如果超过 5 分钟未同步，从 Odoo 19 同步最新状态
    const shouldSync = Date.now() - subscription.lastSyncAt.getTime() > 5 * 60 * 1000;
    
    if (shouldSync && subscription.odoo19OrderId) {
      try {
        const odooOrders = await odoo19.getSubscriptions(subscription.odoo19PartnerId!);
        const odooOrder = odooOrders.find(o => o.id === subscription.odoo19OrderId);

        if (odooOrder) {
          // 更新订阅状态
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              status: odooOrder.state === 'cancel' ? 'CANCELLED' : subscription.status,
              amount: odooOrder.amount_total,
              lastSyncAt: new Date(),
            },
          });
        }
      } catch (syncError) {
        console.error('[Subscription Sync Error]', syncError);
        // 即使同步失败，也返回缓存的数据
      }
    }

    return NextResponse.json(subscription);
  } catch (error) {
    console.error('[Subscription API]', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/subscriptions
 * 创建新订阅
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planCode, startTrial } = await request.json();

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
    });

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { planCode },
    });

    if (!tenant || !plan || !plan.odoo19ProductId) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // 1. 在 Odoo 19 创建客户
    const partnerId = await odoo19.createOrGetPartner({
      name: tenant.name,
    });

    // 2. 在 Odoo 19 创建订阅
    const startDate = new Date();
    const trialDays = startTrial ? plan.trialDays : 0;
    
    const odoo19OrderId = await odoo19.createSubscription({
      partnerId,
      productId: plan.odoo19ProductId,
      startDate,
      trialDays,
    });

    // 3. 在 PostgreSQL 创建订阅记录
    const trialEndDate = startTrial
      ? new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000)
      : null;
    const nextBillingDate = trialEndDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const subscription = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planCode: plan.planCode,
        odoo19OrderId,
        odoo19PartnerId: partnerId,
        odoo19ProductId: plan.odoo19ProductId,
        status: startTrial ? 'TRIAL' : 'ACTIVE',
        startDate,
        nextBillingDate,
        trialEndDate,
        isInTrial: !!startTrial,
        billingCycle: plan.billingCycle || 'MONTHLY',
        amount: plan.priceMonthly,
        currency: 'JPY',
      },
    });

    // 4. 初始化租户功能
    await prisma.tenantFeature.createMany({
      data: plan.allowedModules.map(moduleCode => ({
        tenantId: tenant.id,
        moduleCode: moduleCode as any,
        isAllowed: true,
        isVisible: true,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json(subscription);
  } catch (error) {
    console.error('[Create Subscription]', error);
    return NextResponse.json(
      { error: 'Failed to create subscription' },
      { status: 500 }
    );
  }
}
```

---

## 🔧 Step 6: 初始化订阅产品数据

创建种子脚本：`prisma/seed/subscription-plans.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedSubscriptionPlans() {
  console.log('🌱 Seeding subscription plans...');

  const plans = [
    {
      planCode: 'basic',
      name: 'BizNexus Basic',
      allowedModules: ['DASHBOARD', 'POS'],
      maxUsers: 3,
      priceMonthly: 5000,
      trialDays: 14,
      billingCycle: 'MONTHLY' as const,
      isActive: true,
      // 在 Odoo 19 中创建产品后，手动更新这个 ID
      odoo19ProductId: null, // TODO: 从 Odoo 19 获取产品 ID
    },
    {
      planCode: 'standard',
      name: 'BizNexus Standard',
      allowedModules: ['DASHBOARD', 'POS', 'INVENTORY', 'PURCHASE', 'SALES', 'CRM'],
      maxUsers: 10,
      priceMonthly: 15000,
      trialDays: 14,
      billingCycle: 'MONTHLY' as const,
      isActive: true,
      odoo19ProductId: null, // TODO: 从 Odoo 19 获取产品 ID
    },
    {
      planCode: 'premium',
      name: 'BizNexus Premium',
      allowedModules: [
        'DASHBOARD', 'POS', 'INVENTORY', 'PURCHASE', 'SALES', 'CRM',
        'ACCOUNTING', 'FINANCE', 'HR', 'DOCUMENTS', 'MAINTENANCE', 'APPROVALS'
      ],
      maxUsers: 50,
      priceMonthly: 30000,
      trialDays: 14,
      billingCycle: 'MONTHLY' as const,
      isActive: true,
      odoo19ProductId: null, // TODO: 从 Odoo 19 获取产品 ID
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { planCode: plan.planCode },
      update: plan,
      create: plan,
    });
    console.log(`  ✅ ${plan.name}`);
  }

  console.log('✅ Subscription plans seeded');
}

seedSubscriptionPlans()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

运行种子脚本：

```bash
cd /Users/taozhang/Projects/Seisei\ ERP
npx tsx prisma/seed/subscription-plans.ts
```

---

## 🔧 Step 7: 获取 Odoo 19 产品 ID 并更新

创建辅助脚本：`scripts/sync-odoo19-products.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { odoo19 } from '../src/lib/odoo19';

const prisma = new PrismaClient();

async function syncOdoo19Products() {
  console.log('🔄 Syncing Odoo 19 product IDs...');

  const products = await odoo19.getSubscriptionProducts();

  console.log(`Found ${products.length} subscription products in Odoo 19:`);
  products.forEach(p => console.log(`  - ${p.name} (ID: ${p.id})`));

  // 手动映射产品 ID
  const mapping = {
    'BizNexus Basic Plan': 'basic',
    'BizNexus Standard Plan': 'standard',
    'BizNexus Premium Plan': 'premium',
  };

  for (const product of products) {
    const planCode = mapping[product.name as keyof typeof mapping];
    if (planCode) {
      await prisma.subscriptionPlan.update({
        where: { planCode },
        data: { odoo19ProductId: product.id },
      });
      console.log(`  ✅ Updated ${planCode} with Odoo 19 Product ID: ${product.id}`);
    }
  }

  console.log('✅ Sync complete');
}

syncOdoo19Products()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

## 🔧 Step 8: 前端订阅管理页面

创建文件：`src/app/(app)/settings/subscription/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';

interface Subscription {
  id: string;
  status: string;
  amount: number;
  nextBillingDate: string;
  isInTrial: boolean;
  trialEndDate?: string;
  plan: {
    name: string;
    planCode: string;
  };
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    issueDate: string;
    status: string;
  }>;
}

export default function SubscriptionPage() {
  const t = useTranslations();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/subscriptions')
      .then(res => res.json())
      .then(data => {
        setSubscription(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-bold mb-4">アクティブなサブスクリプションがありません</h2>
          <button className="px-4 py-2 bg-blue-600 text-white rounded">
            プランを選択
          </button>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const badges = {
      ACTIVE: { label: 'アクティブ', class: 'bg-green-100 text-green-800' },
      TRIAL: { label: '試用中', class: 'bg-blue-100 text-blue-800' },
      PAST_DUE: { label: '支払期限超過', class: 'bg-red-100 text-red-800' },
      CANCELLED: { label: 'キャンセル済み', class: 'bg-gray-100 text-gray-800' },
    };
    const badge = badges[status as keyof typeof badges] || badges.ACTIVE;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.class}`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">サブスクリプション管理</h1>

      {/* 現在のプラン */}
      <Card className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg font-semibold">現在のプラン</h2>
          {getStatusBadge(subscription.status)}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-500">プラン名</p>
            <p className="font-medium">{subscription.plan.name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">月額料金</p>
            <p className="font-medium">¥{subscription.amount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">次回請求日</p>
            <p className="font-medium">
              {new Date(subscription.nextBillingDate).toLocaleDateString('ja-JP')}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">プランコード</p>
            <p className="font-medium uppercase">{subscription.plan.planCode}</p>
          </div>
        </div>

        {subscription.isInTrial && subscription.trialEndDate && (
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              ⏰ 試用期間は {new Date(subscription.trialEndDate).toLocaleDateString('ja-JP')} まで
            </p>
          </div>
        )}
      </Card>

      {/* 請求履歴 */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">請求履歴</h2>
        {subscription.invoices.length === 0 ? (
          <p className="text-gray-500">請求履歴はありません</p>
        ) : (
          <div className="space-y-2">
            {subscription.invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium">{invoice.invoiceNumber}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(invoice.issueDate).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">¥{invoice.amount.toLocaleString()}</p>
                  <p className="text-sm">
                    {invoice.status === 'PAID' && <span className="text-green-600">✅ 支払済み</span>}
                    {invoice.status === 'OPEN' && <span className="text-yellow-600">⏳ 未払い</span>}
                    {invoice.status === 'VOID' && <span className="text-gray-600">❌ 無効</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
```

---

## 📋 实施步骤清单

### ✅ Phase 1: Odoo 19 配置（预计 2 小时）

- [ ] 1.1 连接到 Odoo 19 服务器
- [ ] 1.2 安装订阅相关模块
- [ ] 1.3 创建 3 个订阅产品
- [ ] 1.4 配置支付方式
- [ ] 1.5 记录产品 ID

### ✅ Phase 2: 代码开发（预计 4-6 小时）

- [ ] 2.1 更新 `.env` 添加 Odoo 19 配置
- [ ] 2.2 创建 `src/lib/odoo19.ts`
- [ ] 2.3 更新 Prisma Schema
- [ ] 2.4 执行数据库迁移
- [ ] 2.5 创建订阅管理 API
- [ ] 2.6 创建前端订阅页面
- [ ] 2.7 运行种子脚本
- [ ] 2.8 同步 Odoo 19 产品 ID

### ✅ Phase 3: 测试（预计 2 小时）

- [ ] 3.1 本地测试订阅创建
- [ ] 3.2 测试 Odoo 19 连接
- [ ] 3.3 测试前端页面显示
- [ ] 3.4 测试发票生成
- [ ] 3.5 测试支付记录

### ✅ Phase 4: 部署（预计 1 小时）

- [ ] 4.1 提交代码到 Git
- [ ] 4.2 部署到生产服务器
- [ ] 4.3 运行生产环境迁移
- [ ] 4.4 更新生产环境 `.env`
- [ ] 4.5 重启服务
- [ ] 4.6 验证生产环境

---

## 🎯 总结

### 架构优势

1. **职责分离**
   - Odoo 19: 专注订阅管理和计费
   - Odoo 18: 专注业务数据
   - PostgreSQL: 本地缓存和快速查询

2. **性能优化**
   - 本地缓存减少 RPC 调用
   - 5 分钟同步策略平衡实时性和性能
   - 独立服务器避免单点故障

3. **可扩展性**
   - 易于添加新的计费周期
   - 支持多种支付方式
   - 可轻松升级/降级计划

### 下一步

1. 开始 Phase 1 - Odoo 19 配置
2. 需要我帮您执行哪个步骤？

**需要立即开始吗？** 🚀
