# Odoo 19 订阅管理集成方案

**项目**: Seisei BizNexus  
**日期**: 2026-01-11  
**目标**: 使用 Odoo 19 管理客户订阅，集成到基于 Odoo 18 的现有系统

---

## 📊 当前项目情况分析

### 1. 现有架构

```
┌─────────────────────────────────────────────────────┐
│  Seisei BizNexus (Next.js + Capacitor)             │
│  - 多租户 SaaS 架构                                  │
│  - 模块化功能（POS, Inventory, CRM, 等）            │
│  - 基于订阅的功能控制                                │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│  PostgreSQL 数据库 (Prisma ORM)                      │
│  - Tenant (租户)                                      │
│  - SubscriptionPlan (订阅计划)                        │
│  - TenantFeature (租户功能权限)                       │
│  - User (用户)                                        │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│  Odoo 18 服务器 (http://10.0.1.184:8069)            │
│  - 业务数据（订单、库存、客户等）                    │
│  - 不处理订阅管理                                     │
└─────────────────────────────────────────────────────┘
```

### 2. 现有订阅功能

**已实现**：
- ✅ 订阅计划模型 (`SubscriptionPlan`)
- ✅ 租户功能权限 (`TenantFeature`)
- ✅ 用户模块偏好 (`UserModulePref`)
- ✅ 功能可见性控制 (`src/lib/features.ts`)

**缺失**：
- ❌ 订阅生命周期管理（创建、续费、取消）
- ❌ 支付处理
- ❌ 账单生成
- ❌ 自动化订阅到期处理

---

## 🎯 解决方案：双 Odoo 架构

### 方案概述

```
┌──────────────────────────────────────────────────────────┐
│  Seisei BizNexus Frontend (Next.js)                      │
│  - 用户界面                                               │
│  - 功能权限检查                                           │
└──────────────────────────────────────────────────────────┘
           ↓ Auth & Business Data    ↓ Subscription Data
    ┌──────────────┐           ┌──────────────────┐
    │  Odoo 18     │           │   PostgreSQL     │
    │  (业务数据)   │           │   (订阅元数据)    │
    └──────────────┘           └──────────────────┘
                                        ↕ Sync
                              ┌──────────────────┐
                              │   Odoo 19        │
                              │   (订阅管理)      │
                              │   - Subscriptions│
                              │   - Invoices     │
                              │   - Payments     │
                              └──────────────────┘
```

---

## 🏗️ 实施方案

### 阶段 1: Odoo 19 订阅模块配置

#### 1.1 安装 Odoo 19 订阅管理

```bash
# 在服务器上安装 Odoo 19（独立实例）
# 端口：8070 (避免与 Odoo 18 的 8069 冲突)

# 安装必需模块
1. sale_subscription - 订阅管理核心
2. sale - 销售订单
3. account - 会计/发票
4. payment - 支付处理
5. website_sale - 在线商店（可选）
```

#### 1.2 配置订阅产品

在 Odoo 19 中创建订阅产品：

```python
# 订阅计划产品配置
products = [
    {
        "name": "BizNexus Basic Plan",
        "product_code": "BIZNEXUS-BASIC",
        "recurring_rule_type": "monthly",
        "recurring_interval": 1,
        "list_price": 5000.00,  # JPY 5,000/月
        "features": ["POS", "DASHBOARD"]
    },
    {
        "name": "BizNexus Standard Plan",
        "product_code": "BIZNEXUS-STANDARD",
        "recurring_rule_type": "monthly",
        "recurring_interval": 1,
        "list_price": 15000.00,  # JPY 15,000/月
        "features": ["POS", "DASHBOARD", "INVENTORY", "PURCHASE", "SALES"]
    },
    {
        "name": "BizNexus Premium Plan",
        "product_code": "BIZNEXUS-PREMIUM",
        "recurring_rule_type": "monthly",
        "recurring_interval": 1,
        "list_price": 30000.00,  # JPY 30,000/月
        "features": ["ALL_MODULES"]
    }
]
```

### 阶段 2: PostgreSQL 数据库扩展

#### 2.1 更新 Prisma Schema

```prisma
// ============================================
// 订阅管理增强
// ============================================

model Subscription {
  id                String   @id @default(cuid())
  tenantId          String   @map("tenant_id")
  planCode          String   @map("plan_code")
  
  // Odoo 19 集成字段
  odoo19SubscriptionId Int?   @map("odoo19_subscription_id")
  odoo19PartnerId      Int?   @map("odoo19_partner_id")
  
  // 订阅状态
  status            SubscriptionStatus @default(ACTIVE)
  startDate         DateTime @map("start_date")
  nextBillingDate   DateTime @map("next_billing_date")
  endDate           DateTime? @map("end_date")
  
  // 计费信息
  billingCycle      BillingCycle @default(MONTHLY)
  amount            Decimal
  currency          String @default("JPY")
  
  // 自动续费
  autoRenew         Boolean @default(true) @map("auto_renew")
  cancelAtPeriodEnd Boolean @default(false) @map("cancel_at_period_end")
  
  // 试用期
  trialEndDate      DateTime? @map("trial_end_date")
  isInTrial         Boolean @default(false) @map("is_in_trial")
  
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
  
  // 发票信息
  invoiceNumber      String   @unique @map("invoice_number")
  amount             Decimal
  currency           String @default("JPY")
  status             InvoiceStatus @default(DRAFT)
  
  // 日期
  issueDate          DateTime @map("issue_date")
  dueDate            DateTime @map("due_date")
  paidDate           DateTime? @map("paid_date")
  
  // 计费周期
  periodStart        DateTime @map("period_start")
  periodEnd          DateTime @map("period_end")
  
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
  
  // 支付信息
  amount             Decimal
  currency           String @default("JPY")
  paymentMethod      PaymentMethod @map("payment_method")
  status             PaymentStatus @default(PENDING)
  
  // 支付网关信息
  gatewayProvider    String?  @map("gateway_provider") // stripe, paypal, etc.
  gatewayTransactionId String? @map("gateway_transaction_id")
  
  paymentDate        DateTime? @map("payment_date")
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

// 更新 Tenant 模型添加订阅关系
model Tenant {
  // ... 现有字段 ...
  
  // 新增关系
  subscriptions     Subscription[]
}

// 更新 SubscriptionPlan 模型
model SubscriptionPlan {
  // ... 现有字段 ...
  
  // 新增字段
  odoo19ProductId   Int?     @map("odoo19_product_id")
  billingCycle      BillingCycle @default(MONTHLY) @map("billing_cycle")
  trialDays         Int      @default(0) @map("trial_days")
  
  // 新增关系
  subscriptions     Subscription[]
}
```

#### 2.2 数据库迁移

```bash
# 生成迁移
cd /opt/seisei-erp
npx prisma migrate dev --name add_subscription_management

# 应用到生产
npx prisma migrate deploy
```

### 阶段 3: Odoo 19 集成 API

#### 3.1 创建 Odoo 19 RPC 客户端

```typescript
// src/lib/odoo19.ts

import { OdooRPC } from './odoo-rpc';

export class Odoo19SubscriptionClient {
  private client: OdooRPC;

  constructor() {
    this.client = new OdooRPC({
      baseUrl: process.env.ODOO19_URL || 'http://10.0.1.184:8070',
      db: process.env.ODOO19_DB || 'subscriptions',
      username: process.env.ODOO19_USERNAME || 'admin',
      password: process.env.ODOO19_PASSWORD || 'admin',
    });
  }

  /**
   * 创建或获取客户（Partner）
   */
  async createOrGetPartner(tenantData: {
    name: string;
    email?: string;
    phone?: string;
  }): Promise<number> {
    await this.client.authenticate();

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
    });
  }

  /**
   * 创建订阅
   */
  async createSubscription(params: {
    partnerId: number;
    productId: number;
    startDate: Date;
    nextInvoiceDate: Date;
  }): Promise<number> {
    await this.client.authenticate();

    return await this.client.create('sale.subscription', {
      partner_id: params.partnerId,
      template_id: params.productId, // 订阅模板
      date_start: params.startDate.toISOString().split('T')[0],
      recurring_next_date: params.nextInvoiceDate.toISOString().split('T')[0],
      stage_id: 1, // Draft
    });
  }

  /**
   * 激活订阅
   */
  async activateSubscription(subscriptionId: number): Promise<void> {
    await this.client.authenticate();

    await this.client.callKw('sale.subscription', 'set_open', [[subscriptionId]]);
  }

  /**
   * 取消订阅
   */
  async cancelSubscription(subscriptionId: number): Promise<void> {
    await this.client.authenticate();

    await this.client.callKw('sale.subscription', 'set_close', [[subscriptionId]]);
  }

  /**
   * 生成发票
   */
  async generateInvoice(subscriptionId: number): Promise<number> {
    await this.client.authenticate();

    const result = await this.client.callKw(
      'sale.subscription',
      'recurring_invoice',
      [[subscriptionId]]
    );

    return result; // Invoice ID
  }

  /**
   * 获取订阅详情
   */
  async getSubscription(subscriptionId: number) {
    await this.client.authenticate();

    const subscriptions = await this.client.searchRead(
      'sale.subscription',
      [['id', '=', subscriptionId]],
      [
        'code',
        'partner_id',
        'template_id',
        'date_start',
        'date',
        'recurring_next_date',
        'recurring_total',
        'stage_id',
      ]
    );

    return subscriptions[0];
  }

  /**
   * 获取发票详情
   */
  async getInvoice(invoiceId: number) {
    await this.client.authenticate();

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
    paymentMethod: string;
  }): Promise<number> {
    await this.client.authenticate();

    // 创建支付
    const paymentId = await this.client.create('account.payment', {
      payment_type: 'inbound',
      partner_type: 'customer',
      amount: params.amount,
      date: params.paymentDate.toISOString().split('T')[0],
      journal_id: 1, // Bank journal
      payment_method_id: 1, // Manual
    });

    // 关联到发票
    await this.client.callKw('account.payment', 'post', [[paymentId]]);

    return paymentId;
  }

  /**
   * Webhook: 同步订阅状态
   */
  async syncSubscriptionStatus(subscriptionId: number): Promise<{
    status: string;
    nextInvoiceDate: string;
    amount: number;
  }> {
    const subscription = await this.getSubscription(subscriptionId);

    return {
      status: subscription.stage_id[1], // e.g., "In Progress"
      nextInvoiceDate: subscription.recurring_next_date,
      amount: subscription.recurring_total,
    };
  }
}
```

#### 3.2 创建订阅管理 API

```typescript
// src/app/api/subscriptions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Odoo19SubscriptionClient } from '@/lib/odoo19';

const odoo19 = new Odoo19SubscriptionClient();

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

    // 同步 Odoo 19 状态
    if (subscription.odoo19SubscriptionId) {
      const odooStatus = await odoo19.syncSubscriptionStatus(
        subscription.odoo19SubscriptionId
      );

      // 更新本地状态（如果不同）
      if (odooStatus.nextInvoiceDate !== subscription.nextBillingDate.toISOString()) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            nextBillingDate: new Date(odooStatus.nextInvoiceDate),
          },
        });
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

    if (!tenant || !plan) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // 1. 在 Odoo 19 创建客户
    const partnerId = await odoo19.createOrGetPartner({
      name: tenant.name,
    });

    // 2. 在 Odoo 19 创建订阅
    const startDate = new Date();
    const trialEndDate = startTrial
      ? new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000)
      : null;
    const nextBillingDate = trialEndDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const odoo19SubscriptionId = await odoo19.createSubscription({
      partnerId,
      productId: plan.odoo19ProductId!,
      startDate,
      nextInvoiceDate: nextBillingDate,
    });

    // 激活订阅
    await odoo19.activateSubscription(odoo19SubscriptionId);

    // 3. 在 PostgreSQL 创建订阅记录
    const subscription = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planCode: plan.planCode,
        odoo19SubscriptionId,
        odoo19PartnerId: partnerId,
        status: startTrial ? 'TRIAL' : 'ACTIVE',
        startDate,
        nextBillingDate,
        trialEndDate,
        isInTrial: !!startTrial,
        billingCycle: plan.billingCycle,
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

#### 3.3 创建发票和支付 API

```typescript
// src/app/api/subscriptions/invoices/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Odoo19SubscriptionClient } from '@/lib/odoo19';

const odoo19 = new Odoo19SubscriptionClient();

/**
 * POST /api/subscriptions/invoices
 * 生成新发票
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { subscriptionId } = await request.json();

    const subscription = await prisma.subscription.findFirst({
      where: {
        id: subscriptionId,
        tenantId: session.tenantId,
      },
    });

    if (!subscription || !subscription.odoo19SubscriptionId) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // 在 Odoo 19 生成发票
    const odoo19InvoiceId = await odoo19.generateInvoice(
      subscription.odoo19SubscriptionId
    );

    // 获取发票详情
    const odooInvoice = await odoo19.getInvoice(odoo19InvoiceId);

    // 在 PostgreSQL 创建发票记录
    const invoice = await prisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        tenantId: subscription.tenantId,
        odoo19InvoiceId,
        invoiceNumber: odooInvoice.name,
        amount: odooInvoice.amount_total,
        currency: 'JPY',
        status: odooInvoice.state === 'draft' ? 'DRAFT' : 'OPEN',
        issueDate: new Date(odooInvoice.invoice_date),
        dueDate: new Date(odooInvoice.invoice_date_due),
        periodStart: subscription.nextBillingDate,
        periodEnd: new Date(
          subscription.nextBillingDate.getTime() + 30 * 24 * 60 * 60 * 1000
        ),
      },
    });

    // 更新订阅的下次计费日期
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        nextBillingDate: new Date(
          subscription.nextBillingDate.getTime() + 30 * 24 * 60 * 60 * 1000
        ),
      },
    });

    return NextResponse.json(invoice);
  } catch (error) {
    console.error('[Generate Invoice]', error);
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}
```

### 阶段 4: 定时任务与自动化

#### 4.1 创建定时任务处理器

```typescript
// src/lib/cron/subscription-tasks.ts

import { prisma } from '../db';
import { Odoo19SubscriptionClient } from '../odoo19';

const odoo19 = new Odoo19SubscriptionClient();

/**
 * 每日任务：处理订阅到期和计费
 */
export async function processSubscriptionBilling() {
  console.log('[Cron] Processing subscription billing...');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 查找需要计费的订阅
  const dueSubscriptions = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      nextBillingDate: {
        lte: today,
      },
    },
    include: {
      tenant: true,
    },
  });

  for (const subscription of dueSubscriptions) {
    try {
      // 生成发票
      if (subscription.odoo19SubscriptionId) {
        const odoo19InvoiceId = await odoo19.generateInvoice(
          subscription.odoo19SubscriptionId
        );

        const odooInvoice = await odoo19.getInvoice(odoo19InvoiceId);

        await prisma.invoice.create({
          data: {
            subscriptionId: subscription.id,
            tenantId: subscription.tenantId,
            odoo19InvoiceId,
            invoiceNumber: odooInvoice.name,
            amount: subscription.amount,
            currency: subscription.currency,
            status: 'OPEN',
            issueDate: today,
            dueDate: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000), // 14 days
            periodStart: subscription.nextBillingDate,
            periodEnd: new Date(
              subscription.nextBillingDate.getTime() + 30 * 24 * 60 * 60 * 1000
            ),
          },
        });

        // 更新下次计费日期
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            nextBillingDate: new Date(
              subscription.nextBillingDate.getTime() + 30 * 24 * 60 * 60 * 1000
            ),
          },
        });

        console.log(
          `[Cron] Generated invoice for subscription ${subscription.id}`
        );
      }
    } catch (error) {
      console.error(
        `[Cron] Failed to process subscription ${subscription.id}:`,
        error
      );
    }
  }
}

/**
 * 每日任务：处理试用期到期
 */
export async function processTrialExpirations() {
  console.log('[Cron] Processing trial expirations...');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiredTrials = await prisma.subscription.findMany({
    where: {
      status: 'TRIAL',
      trialEndDate: {
        lte: today,
      },
    },
  });

  for (const subscription of expiredTrials) {
    try {
      if (subscription.autoRenew) {
        // 转为付费订阅
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'ACTIVE',
            isInTrial: false,
          },
        });

        // 生成第一张发票
        if (subscription.odoo19SubscriptionId) {
          await odoo19.generateInvoice(subscription.odoo19SubscriptionId);
        }

        console.log(`[Cron] Converted trial to paid: ${subscription.id}`);
      } else {
        // 取消订阅
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'CANCELLED',
          },
        });

        if (subscription.odoo19SubscriptionId) {
          await odoo19.cancelSubscription(subscription.odoo19SubscriptionId);
        }

        console.log(`[Cron] Cancelled expired trial: ${subscription.id}`);
      }
    } catch (error) {
      console.error(
        `[Cron] Failed to process trial ${subscription.id}:`,
        error
      );
    }
  }
}

/**
 * 每日任务：处理逾期支付
 */
export async function processOverdueInvoices() {
  console.log('[Cron] Processing overdue invoices...');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      status: 'OPEN',
      dueDate: {
        lt: today,
      },
    },
    include: {
      subscription: true,
    },
  });

  for (const invoice of overdueInvoices) {
    try {
      // 标记订阅为逾期
      await prisma.subscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          status: 'PAST_DUE',
        },
      });

      // TODO: 发送提醒邮件

      console.log(`[Cron] Marked subscription ${invoice.subscriptionId} as past due`);
    } catch (error) {
      console.error(`[Cron] Failed to process overdue invoice ${invoice.id}:`, error);
    }
  }
}
```

#### 4.2 配置 Cron Job

```typescript
// src/app/api/cron/subscriptions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  processSubscriptionBilling,
  processTrialExpirations,
  processOverdueInvoices,
} from '@/lib/cron/subscription-tasks';

/**
 * Cron endpoint - 由外部调度器调用
 * 例如：GitHub Actions, AWS CloudWatch Events, 或 cron job
 */
export async function GET(request: NextRequest) {
  // 验证 cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await Promise.all([
      processSubscriptionBilling(),
      processTrialExpirations(),
      processOverdueInvoices(),
    ]);

    return NextResponse.json({ success: true, timestamp: new Date() });
  } catch (error) {
    console.error('[Cron]', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
```

#### 4.3 部署 Cron Job

```bash
# 方案 1: 使用服务器 crontab
# 编辑 crontab
crontab -e

# 添加每日凌晨 2:00 执行
0 2 * * * curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://biznexus.seisei.tokyo/api/cron/subscriptions

# 方案 2: 使用 Vercel Cron (如果部署在 Vercel)
# vercel.json
{
  "crons": [
    {
      "path": "/api/cron/subscriptions",
      "schedule": "0 2 * * *"
    }
  ]
}
```

### 阶段 5: 前端界面

#### 5.1 订阅管理页面

```typescript
// src/app/(app)/settings/subscription/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

export default function SubscriptionPage() {
  const t = useTranslations();
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/subscriptions')
      .then(res => res.json())
      .then(data => {
        setSubscription(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">订阅管理</h1>

      {/* 当前订阅 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">当前订阅</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">计划</p>
            <p className="font-medium">{subscription.plan.name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">状态</p>
            <p className="font-medium">
              {subscription.status === 'ACTIVE' && '✅ 活跃'}
              {subscription.status === 'TRIAL' && '🔄 试用中'}
              {subscription.status === 'PAST_DUE' && '⚠️ 逾期'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">下次计费日期</p>
            <p className="font-medium">
              {new Date(subscription.nextBillingDate).toLocaleDateString('ja-JP')}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">金额</p>
            <p className="font-medium">
              ¥{subscription.amount.toLocaleString()} / 月
            </p>
          </div>
        </div>

        {subscription.isInTrial && (
          <div className="mt-4 p-3 bg-blue-50 rounded">
            <p className="text-sm text-blue-800">
              试用期至: {new Date(subscription.trialEndDate).toLocaleDateString('ja-JP')}
            </p>
          </div>
        )}
      </div>

      {/* 发票历史 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">发票历史</h2>
        <div className="space-y-2">
          {subscription.invoices.map((invoice: any) => (
            <div
              key={invoice.id}
              className="flex justify-between items-center p-3 bg-gray-50 rounded"
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
                  {invoice.status === 'PAID' && '✅ 已支付'}
                  {invoice.status === 'OPEN' && '⏳ 待支付'}
                  {invoice.status === 'VOID' && '❌ 作废'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## 📋 实施步骤总结

### Step 1: 准备工作（1天）

```bash
# 1. 在服务器上安装 Odoo 19
docker run -d -p 8070:8069 --name odoo19 \
  -e POSTGRES_USER=odoo19 \
  -e POSTGRES_PASSWORD=odoo19 \
  -e POSTGRES_DB=subscriptions \
  odoo:19.0

# 2. 安装订阅模块
# 访问 http://54.65.127.141:8070
# Apps > Search "subscription" > Install

# 3. 更新 .env
cd /opt/seisei-erp
sudo bash -c 'cat >> .env << EOF

# Odoo 19 Subscription Management
ODOO19_URL="http://host.docker.internal:8070"
ODOO19_DB="subscriptions"
ODOO19_USERNAME="admin"
ODOO19_PASSWORD="admin"
CRON_SECRET="your-random-cron-secret-here"
EOF'
```

### Step 2: 数据库迁移（0.5天）

```bash
# 1. 更新 Prisma schema（使用上面提供的代码）
cd /opt/seisei-erp

# 2. 生成并应用迁移
npx prisma migrate dev --name add_subscription_management

# 3. 更新类型
npx prisma generate
```

### Step 3: 实现 API（2-3天）

```bash
# 创建以下文件：
1. src/lib/odoo19.ts
2. src/app/api/subscriptions/route.ts
3. src/app/api/subscriptions/invoices/route.ts
4. src/app/api/cron/subscriptions/route.ts
5. src/lib/cron/subscription-tasks.ts
```

### Step 4: 前端界面（1-2天）

```bash
# 创建订阅管理页面
1. src/app/(app)/settings/subscription/page.tsx
2. 更新导航添加订阅入口
```

### Step 5: 测试与部署（1天）

```bash
# 1. 本地测试
npm run dev

# 2. 构建
npm run build

# 3. 部署
docker-compose up -d --build

# 4. 配置 Cron
crontab -e
# 添加: 0 2 * * * curl -H "Authorization: Bearer SECRET" https://biznexus.seisei.tokyo/api/cron/subscriptions
```

---

## 🎯 优势总结

| 特性 | 方案优势 |
|------|---------|
| **双 Odoo 架构** | Odoo 18 处理业务，Odoo 19 专注订阅 |
| **数据一致性** | PostgreSQL 存储元数据，Odoo 19 存储详细记录 |
| **可扩展性** | 支持多种支付网关、计费周期 |
| **自动化** | Cron 任务自动处理计费、到期、逾期 |
| **用户体验** | 清晰的订阅和发票管理界面 |

---

## 📞 下一步行动

1. **立即开始**：安装 Odoo 19 实例
2. **配置订阅产品**：在 Odoo 19 中创建订阅计划
3. **数据库迁移**：更新 Prisma schema
4. **API 开发**：实现订阅管理接口
5. **前端开发**：创建订阅管理页面
6. **测试上线**：全流程测试后部署

需要我开始实施某个具体步骤吗？
