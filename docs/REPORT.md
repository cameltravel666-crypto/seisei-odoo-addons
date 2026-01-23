# Seisei ERP 现状盘点报告

## 1. 系统架构概览

### 1.1 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| **Frontend** | Next.js (App Router) + React | 16.1.1 / 19.x |
| **Backend** | Next.js API Routes (Serverless) | 16.1.1 |
| **Database** | PostgreSQL + Prisma ORM | Prisma 7.2.0 |
| **Authentication** | JWT (HS256) + HttpOnly Cookie | jose 6.1.3 |
| **State Management** | Zustand | - |
| **Payment** | Stripe API | 20.1.2 |
| **Mobile** | Capacitor (iOS/Android) | 8.0.0 |
| **i18n** | next-intl | 4.7.0 (EN/ZH/JA) |
| **Odoo Integration** | JSON-RPC 2.0 | Odoo 18 CE + 19 EE |

### 1.2 目录结构

```
/Users/taozhang/Projects/Seisei ERP/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── (app)/        # 受保护路由（需认证）
│   │   ├── api/          # 76+ API endpoints
│   │   ├── auth/         # OAuth 回调
│   │   ├── login/        # 登录页
│   │   └── register/     # 注册流程
│   ├── components/       # React 组件
│   ├── lib/              # 核心业务逻辑
│   ├── hooks/            # React Hooks
│   ├── stores/           # Zustand stores
│   └── types/            # TypeScript 类型
├── prisma/               # 数据库 schema
├── seisei_billing/       # Odoo 19 计费模块
├── ios/                  # iOS Capacitor
├── android/              # Android Capacitor
└── docs/                 # 文档
```

---

## 2. 多租户标识处理

### 2.1 关键标识符

| 标识符 | 位置 | 用途 |
|--------|------|------|
| `tenantCode` | Tenant.tenantCode | 唯一租户标识 (TEN-xxxxx) |
| `tenantId` | UUID | 数据库主键 |
| `companyId` | Tenant.companyId | Odoo 公司 ID |
| `odooUserId` | User.odooUserId | Odoo 用户 ID |
| `warehouseId` | Tenant.warehouseId | Odoo 仓库 ID |

### 2.2 当前实现

**Prisma Schema 位置**: `/prisma/schema.prisma`

```prisma
model Tenant {
  id              String   @id @default(uuid())
  tenantCode      String   @unique              // TEN-xxxxx 格式
  name            String
  odooBaseUrl     String                        // 租户的 Odoo 服务器
  odooDb          String                        // 租户的数据库名
  companyId       Int?                          // Odoo company_id
  warehouseId     Int?                          // Odoo warehouse_id
  planCode        String   @default("basic")    // 订阅计划
  stripeCustomerId String? @unique              // Stripe 客户 ID
  odoo19PartnerId Int?                          // Odoo 19 合作伙伴 ID

  users           User[]
  sessions        Session[]
  features        TenantFeature[]
  subscription    Subscription?
}
```

### 2.3 租户隔离方式

1. **数据库级**: 所有查询必须带 `tenantId` 过滤
2. **JWT 级**: Token 包含 `tenantId`，每次请求验证
3. **会话级**: Session 绑定特定 tenant
4. **Odoo 连接**: 每个租户连接自己的 Odoo 实例

---

## 3. 用户/账号模型

### 3.1 当前用户模型

**位置**: `/prisma/schema.prisma`

```prisma
model User {
  id           String   @id @default(uuid())
  tenantId     String
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  odooUserId   Int                              // Odoo 用户 ID
  odooLogin    String                           // Odoo 登录名
  displayName  String                           // 显示名称
  email        String?
  isAdmin      Boolean  @default(false)         // 管理员标志
  createdAt    DateTime @default(now())

  sessions     Session[]
  modulePref   UserModulePref[]

  @@unique([tenantId, odooUserId])              // 复合唯一约束
}
```

### 3.2 问题分析

| 问题 | 描述 | 风险等级 |
|------|------|----------|
| **无角色模型** | 只有 `isAdmin` 布尔值，无细粒度角色 | 🔴 高 |
| **无 Membership** | 用户直接绑定租户，无中间层 | 🟡 中 |
| **无权限表** | 权限硬编码在前端/API 中 | 🔴 高 |
| **无门店范围** | 无法限制用户访问特定门店 | 🟡 中 |

---

## 4. 权限判断位置

### 4.1 当前权限判定链路

```
┌─────────────────────────────────────────────────────────────────────┐
│                        当前权限判定链路                               │
└─────────────────────────────────────────────────────────────────────┘

  iOS/Android App                Web Browser
       │                              │
       └──────────┬───────────────────┘
                  │
                  ▼
    ┌─────────────────────────┐
    │   前端判断 (UI 级别)      │  ← 仅做 UI 隐藏，非强制
    │   - useFeatureGate()    │
    │   - useModules()        │
    │   - isAdmin check       │
    └───────────┬─────────────┘
                │
                ▼
    ┌─────────────────────────┐
    │   Next.js API Route     │  ← 验证 JWT Token
    │   - getSession()        │
    │   - 检查 tenantId        │
    └───────────┬─────────────┘
                │
                ▼
    ┌─────────────────────────┐
    │   TenantFeature 表      │  ← 检查模块是否开通
    │   - isAllowed           │     (通过 Subscription)
    │   - isVisible           │
    └───────────┬─────────────┘
                │
                ▼
    ┌─────────────────────────┐
    │   Odoo 18 JSON-RPC      │  ← Odoo 内部权限
    │   - Session 验证         │     (最终执行点)
    │   - Model Allowlist     │
    └─────────────────────────┘
```

### 4.2 权限检查代码位置

| 文件 | 功能 | 检查方式 |
|------|------|----------|
| `/src/lib/auth.ts` | JWT 验证 | `getSession()` 解析 token |
| `/src/lib/features.ts` | 功能开关 | `TenantFeature` 表查询 |
| `/src/hooks/use-feature-gate.ts` | 前端 Feature Gate | 调用 API 获取 entitlements |
| `/src/lib/odoo.ts:allowlist` | Odoo 模型白名单 | 硬编码的模型列表 |

### 4.3 问题: 无服务端角色/权限强制执行

当前系统缺少:
- ❌ RoleGuard / PermissionGuard
- ❌ EntitlementGuard (模块开通检查中间件)
- ❌ 细粒度 API 权限控制
- ❌ 操作级权限 (read/write/delete)

---

## 5. 订阅状态/模块开关

### 5.1 订阅归属对象分析

**当前状态: 租户级订阅 (Tenant-Level) ✅**

```prisma
model Subscription {
  id              String   @id @default(uuid())
  tenantId        String   @unique              // 一个租户一个订阅
  tenant          Tenant   @relation(...)
  status          SubscriptionStatus            // TRIAL|ACTIVE|PAST_DUE|CANCELLED|EXPIRED
  billingCycle    BillingCycle                  // MONTHLY|QUARTERLY|YEARLY
  totalAmount     Decimal
  stripeSubscriptionId String? @unique

  items           SubscriptionItem[]
}

model SubscriptionItem {
  id              String   @id @default(uuid())
  subscriptionId  String
  productId       String                        // 指向 SubscriptionProduct
  quantity        Int      @default(1)
  unitPrice       Decimal
  status          SubscriptionStatus
}
```

**关键发现**: 订阅主体已经是 Tenant，但缺少:
- ❌ 用户数量限制 (`maxUsers`)
- ❌ 额度控制 (`limits`)
- ❌ 来源追踪 (`source=stripe`)

### 5.2 模块开关实现

**TenantFeature 表**:
```prisma
model TenantFeature {
  id         String   @id @default(uuid())
  tenantId   String
  tenant     Tenant   @relation(...)
  moduleCode ModuleCode                    // POS|INVENTORY|PURCHASE|...
  isAllowed  Boolean  @default(false)      // 是否允许访问
  isVisible  Boolean  @default(true)       // 是否显示

  @@unique([tenantId, moduleCode])
}

enum ModuleCode {
  POS, INVENTORY, PURCHASE, SALES, CRM, EXPENSES,
  ACCOUNTING, FINANCE, APPROVALS, HR, MAINTENANCE,
  DOCUMENTS, DASHBOARD, PRODUCTS, CONTACTS, ANALYTICS, QR_ORDERING
}
```

### 5.3 前端 Feature Gate

**位置**: `/src/hooks/use-feature-gate.ts`

```typescript
export function useFeatureGate() {
  const { data: entitlements } = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => fetch('/api/me/entitlements').then(r => r.json())
  });

  const isModuleAllowed = (moduleCode: string) => {
    return entitlements?.modules?.includes(moduleCode);
  };

  return { isModuleAllowed, entitlements };
}
```

---

## 6. Stripe 计费集成

### 6.1 当前实现

**位置**: `/src/lib/stripe.ts`, `/src/app/api/stripe/webhook/route.ts`

| 组件 | 状态 | 说明 |
|------|------|------|
| Customer 映射 | ✅ 已实现 | `Tenant.stripeCustomerId` |
| Subscription 映射 | ✅ 已实现 | `Subscription.stripeSubscriptionId` |
| Product 映射 | ✅ 已实现 | `SubscriptionProduct.stripeProductId` |
| Price 映射 | ✅ 已实现 | `stripePriceMonthly`, `stripePriceYearly` |
| Webhook 处理 | ⚠️ 部分 | 基本事件已处理 |

### 6.2 Webhook 事件处理

**当前处理的事件**:
- `checkout.session.completed` - 创建订阅
- `customer.subscription.created` - 更新状态
- `customer.subscription.updated` - 同步更改
- `customer.subscription.deleted` - 取消处理
- `invoice.paid` - 支付确认
- `invoice.payment_failed` - 支付失败

**缺失的处理**:
- ❌ `customer.subscription.trial_will_end` - 试用即将结束通知
- ❌ 自动更新 `Entitlements` 表
- ❌ 审计日志记录

### 6.3 问题: Entitlements 未与 Stripe 同步

当前 `TenantFeature` 是静态设置，未与 Stripe 订阅状态自动同步。

---

## 7. 审计/日志系统

### 7.1 当前状态: **严重缺失** 🔴

| 审计类型 | 状态 | 说明 |
|----------|------|------|
| 用户操作日志 | ❌ 缺失 | 无 AuditLog 表 |
| 权限变更日志 | ❌ 缺失 | 无法追溯谁给谁授权 |
| 订阅变更日志 | ⚠️ 仅时间戳 | `updatedAt` 不记录具体变更 |
| 财务审计 | ❌ 缺失 | Invoice/Payment 无变更记录 |

### 7.2 现有的日志机制

仅有以下基础日志:

1. **OCR 使用追踪**: `OcrMonthlyUsage` 表
2. **Console 日志**: 开发级别
3. **Odoo 19 推送日志**: `seisei.push.log`

---

## 8. Odoo 集成点

### 8.1 双 Odoo 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Odoo 集成架构                                 │
└─────────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐         ┌─────────────────┐
    │  Odoo 18 CE     │         │  Odoo 19 EE     │
    │  (业务数据库)    │         │  (计费数据库)    │
    └────────┬────────┘         └────────┬────────┘
             │                           │
             │ JSON-RPC                  │ JSON-RPC
             │ 每租户独立实例             │ 全局共享实例
             │                           │
    ┌────────┴────────┐         ┌────────┴────────┐
    │ /src/lib/odoo.ts │        │/src/lib/odoo19.ts│
    │                  │        │                  │
    │ authenticate()   │        │ createOrder()    │
    │ call(model,...)  │        │ createInvoice()  │
    │ Model Allowlist  │        │ registerPayment()│
    └─────────────────┘         └─────────────────┘
```

### 8.2 Odoo 18 集成

**配置存储**: `Tenant.odooBaseUrl`, `Tenant.odooDb`

**Session 处理**:
- 登录时获取 Odoo session_id
- AES-256-CBC 加密存储于 `Session.odooSessionId`
- JWT 中包含加密后的 sessionId

**Allowlist 模型** (安全控制):
```typescript
// /src/lib/odoo.ts
const ALLOWED_MODELS = [
  'product.template', 'product.category', 'product.product',
  'pos.order', 'pos.order.line', 'pos.category',
  'purchase.order', 'purchase.order.line',
  'sale.order', 'sale.order.line',
  'account.move', 'account.journal', 'account.account',
  'crm.lead', 'crm.stage',
  'stock.picking', 'stock.move', 'stock.quant',
  'hr.employee', 'hr.payslip',
  'res.partner', 'res.users', 'res.company'
  // ... 共 30+ 模型
];
```

### 8.3 Odoo 19 集成

**配置**: 环境变量 `ODOO19_URL`, `ODOO19_DB`, `ODOO19_USERNAME`, `ODOO19_PASSWORD`

**用途**:
- 创建订阅订单 (`sale.order`)
- 生成发票 (`account.move`)
- 记录付款
- 同步 Stripe 支付

---

## 9. 混乱风险点

### 9.1 权限控制风险

| 风险 | 描述 | 影响 |
|------|------|------|
| **前端权限检查** | `useFeatureGate()` 仅做 UI 隐藏 | 可绕过 |
| **无 API 中间件** | 业务 API 未强制检查权限 | 数据泄露 |
| **isAdmin 二元** | 无法实现细粒度角色 | 权限管理困难 |
| **无门店范围** | 无法限制用户操作范围 | 数据越权 |

### 9.2 订阅管理风险

| 风险 | 描述 | 影响 |
|------|------|------|
| **Stripe 同步延迟** | Webhook 失败可能导致状态不一致 | 用户访问错误功能 |
| **无 Entitlements 表** | 权益散落在多处 | 难以统一管理 |
| **无来源追踪** | 不知道订阅来自 Stripe 还是手动 | 对账困难 |

### 9.3 审计风险

| 风险 | 描述 | 影响 |
|------|------|------|
| **无审计日志** | 无法追溯操作历史 | 合规问题 |
| **无变更记录** | 不知道谁修改了什么 | 责任追溯困难 |
| **无财务审计** | Invoice/Payment 无审计轨迹 | 财务风险 |

---

## 10. MVP 最小改动范围

### 10.1 必须新增的表

```prisma
// 1. 成员关系表 (User <-> Tenant 多角色)
model Membership {
  id            String   @id @default(uuid())
  userId        String
  tenantId      String
  role          Role     @default(OPERATOR)
  storeScope    String[] @default([])         // 门店 ID 列表，空=全部
  status        MembershipStatus @default(ACTIVE)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  invitedBy     String?                       // 邀请人 ID

  user          User     @relation(...)
  tenant        Tenant   @relation(...)

  @@unique([userId, tenantId])
}

enum Role {
  BILLING_ADMIN    // 计费管理员 (最高权限)
  ORG_ADMIN        // 组织管理员
  MANAGER          // 门店经理
  OPERATOR         // 操作员
}

// 2. 权益表 (Tenant 级订阅权益)
model Entitlements {
  id            String   @id @default(uuid())
  tenantId      String   @unique
  modules       String[]                      // 开通的模块 ID 列表
  maxUsers      Int      @default(5)
  maxStores     Int      @default(1)
  status        EntitlementStatus @default(ACTIVE)
  periodEnd     DateTime?
  source        String   @default("manual")   // stripe | manual | odoo
  stripeSubId   String?

  tenant        Tenant   @relation(...)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// 3. 审计日志表
model AuditLog {
  id            String   @id @default(uuid())
  tenantId      String
  userId        String?                       // 操作人 (系统操作可为空)
  targetUserId  String?                       // 被操作人
  action        AuditAction
  resource      String                        // 资源类型
  resourceId    String?                       // 资源 ID
  changes       Json?                         // 变更详情 {old: {}, new: {}}
  ipAddress     String?
  userAgent     String?
  createdAt     DateTime @default(now())

  tenant        Tenant   @relation(...)
  user          User?    @relation(...)

  @@index([tenantId, createdAt])
  @@index([action])
}

enum AuditAction {
  // 用户管理
  USER_INVITED
  USER_ROLE_CHANGED
  USER_STORE_SCOPE_CHANGED
  USER_DISABLED
  USER_ENABLED

  // 订阅管理
  SUBSCRIPTION_CREATED
  SUBSCRIPTION_UPDATED
  SUBSCRIPTION_CANCELLED
  SUBSCRIPTION_RENEWED

  // 权益变更
  ENTITLEMENTS_UPDATED
  MODULE_ENABLED
  MODULE_DISABLED

  // 认证
  LOGIN_SUCCESS
  LOGIN_FAILED
  LOGOUT
}
```

### 10.2 必须新增的 Guards/Middleware

| Guard | 用途 | 位置 |
|-------|------|------|
| `TenantGuard` | 验证请求属于正确租户 | API 中间件 |
| `RoleGuard` | 验证用户角色权限 | API 中间件 |
| `EntitlementGuard` | 验证模块是否开通 | API 中间件 |

### 10.3 必须新增的 API

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/me` | GET | 返回用户 + membership + role + storeScope |
| `/api/me/entitlements` | GET | 返回租户权益 |
| `/api/admin/users` | GET | 管理租户用户列表 |
| `/api/admin/users/invite` | POST | 邀请新用户 |
| `/api/admin/users/:id` | PATCH | 修改角色/门店范围 |
| `/api/admin/audit-logs` | GET | 查询审计日志 |

### 10.4 必须修改的现有代码

| 文件 | 修改内容 |
|------|----------|
| `/src/lib/auth.ts` | 添加 Membership 查询，JWT 包含 role |
| `/src/app/api/auth/login/route.ts` | 兼容 TEN-xxx 和 xxx 格式 tenant_code |
| `/src/app/api/stripe/webhook/route.ts` | 同步更新 Entitlements 表 |
| `/src/hooks/use-feature-gate.ts` | 改用 `/api/me/entitlements` |

### 10.5 App 适配

**iOS/Android App 要求**:
1. 拉取 `/api/me/entitlements` 判断模块状态
2. 未开通模块显示"锁定态 + 联系管理员"
3. **禁止**: 任何购买/订阅 CTA、外链

---

## 11. 实施优先级

### Phase 1: 基础 (Week 1)
1. 创建 `Membership`, `Entitlements`, `AuditLog` 表
2. 数据迁移: 现有 User.isAdmin → Membership.role
3. 实现 `/api/me` 和 `/api/me/entitlements`

### Phase 2: 权限强化 (Week 2)
1. 实现 TenantGuard, RoleGuard, EntitlementGuard
2. 应用到所有业务 API
3. 实现审计日志记录

### Phase 3: 管理功能 (Week 3)
1. 实现 `/api/admin/users/*` 系列接口
2. 实现 `/api/admin/audit-logs`
3. Web 管理页面接入

### Phase 4: Stripe 同步 (Week 4)
1. Webhook 自动更新 Entitlements
2. 对账功能
3. App 适配完成

---

## 附录 A: 关键文件列表

| 类别 | 文件路径 |
|------|----------|
| **Schema** | `/prisma/schema.prisma` |
| **Auth** | `/src/lib/auth.ts` |
| **Features** | `/src/lib/features.ts` |
| **Odoo 18** | `/src/lib/odoo.ts` |
| **Odoo 19** | `/src/lib/odoo19.ts` |
| **Stripe** | `/src/lib/stripe.ts` |
| **Subscription** | `/src/lib/subscription-service.ts` |
| **Login API** | `/src/app/api/auth/login/route.ts` |
| **Stripe Webhook** | `/src/app/api/stripe/webhook/route.ts` |
| **Feature Gate Hook** | `/src/hooks/use-feature-gate.ts` |

---

*Report generated: 2026-01-16*
*Generator: Claude Code (Opus 4.5)*
