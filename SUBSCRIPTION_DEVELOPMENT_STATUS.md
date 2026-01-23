# Seisei BizNexus 订阅管理开发状态

**更新日期**: 2026-01-13

---

## 系统架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│              Seisei BizNexus (Next.js + Capacitor)              │
│                  https://biznexus.seisei.tokyo                  │
│         前端应用 (iOS/Android/Web) + 租户管理 + 用户认证           │
└─────────────────────────────────────────────────────────────────┘
          │                      │                      │
          │ JSON-RPC             │ JSON-RPC             │ Prisma ORM
          ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Odoo 19 企业版  │    │   Odoo 18 社区版  │    │   PostgreSQL    │
│    【管理端】      │    │    【业务端】      │    │   【本地缓存】    │
│  13.159.193.191  │    │  54.65.127.141   │    │   (同 Odoo 18)   │
│     :8069        │    │     :8069        │    │                 │
│   DB: ERP        │    │   DB: test001    │    │                 │
│   User: Josh     │    │   User: admin    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
       │                       │
       │ 订阅管理               │ 业务数据
       │ • 订阅产品             │ • POS 订单
       │ • 发票                 │ • 库存管理
       │ • 支付                 │ • 采购/销售
       │ • 客户                 │ • CRM
       ▼                       ▼
   订阅信息权威源             业务数据权威源
```

---

## 订阅模式：模块化订阅

```
租户订阅 = 基础套餐 + N个可选模块 + N个附加服务
```

### 产品分类 (已导入 Odoo 19)

#### 基础套餐 (BASE_PLAN)
| ID | 产品代码 | 名称 | 月费 | 包含模块 |
|----|---------|------|------|---------|
| 36 | SW-PLAN-START | Starter 入门版 | ¥0 | Dashboard, POS |
| 37 | SW-PLAN-OPS-B | Ops Basic | ¥9,800 | Dashboard, POS, Inventory |
| 38 | SW-PLAN-OPS-A | Ops Auto | ¥19,800 | Dashboard, POS, Inventory, Purchase |

#### 功能模块 (MODULE)
| ID | 产品代码 | 名称 | 月费 | 启用模块 |
|----|---------|------|------|---------|
| 42 | SW-MOD-CRM | 会员管理 | ¥3,000 | CRM |
| 43 | SW-MOD-CASH | 现金账簿 | ¥3,000 | ACCOUNTING |
| 44 | SW-MOD-ACC-P | 会计专业版 | ¥9,800 | FINANCE |
| 45 | SW-MOD-ACC-E | 会计企业版 | ¥19,800 | FINANCE |
| 46 | SW-MOD-PAYROLL | 工资管理 | ¥9,800 | HR |
| 39 | SW-MOD-QR | 扫码点餐 | ¥14,800 | - |
| 40 | SW-MOD-RECPT | 发票开具 | ¥3,000 | - |
| 41 | SW-MOD-BI | 高级数据分析 | ¥12,800 | - |

#### 终端许可 (ADDON)
| ID | 产品代码 | 名称 | 月费 |
|----|---------|------|------|
| 47 | SW-TERM-POS-ADD | POS追加终端 | ¥1,500 |
| 48 | SW-TERM-KDS | KDS许可 | ¥3,500 |
| 49 | SW-TERM-PRINT | 打印中心 | ¥1,980 |
| 50 | SW-TERM-PRINT-ADD | 追加打印端点 | ¥300 |
| 51 | SW-TERM-EMP-ADD | 追加工资员工 | ¥200 |

#### 运维服务 (SERVICE)
| ID | 产品代码 | 名称 | 月费 |
|----|---------|------|------|
| 61 | SV-MNT-BASIC | 基础运维 | ¥980 |
| 62 | SV-MNT-ADV | 高级运维 | ¥2,980 |
| 63 | SV-RPL | 先出交换(单次) | ¥12,000 |

#### 导入服务 (ONBOARDING)
| ID | 产品代码 | 名称 | 费用(一次性) |
|----|---------|------|-------------|
| 52 | SV-DEP-LITE | 轻量导入 | ¥50,000 |
| 53 | SV-DEP-STD | 标准导入 | ¥150,000 |
| 54 | SV-DEP-PRO | 专业导入 | ¥300,000 |

#### 硬件租赁 (RENTAL)
| ID | 产品代码 | 名称 | 月费 |
|----|---------|------|------|
| 58 | HW-L-PRN-80 | 小票打印机租赁 | ¥690 |
| 59 | HW-L-KDS | 厨显终端租赁 | ¥3,480 |
| 60 | HW-L-POS-DS | POS套装租赁 | ¥3,980 |

---

## 数据模型

### SubscriptionProduct (订阅产品)
```prisma
model SubscriptionProduct {
  productCode     String          @unique   // e.g., SW-PLAN-START
  name            String
  productType     ProductType     // BASE_PLAN, MODULE, SERVICE, HARDWARE, ADDON
  category        ProductCategory // PLAN, MODULE, TERMINAL, MAINTENANCE, ONBOARDING, RENTAL
  priceMonthly    Decimal
  includedModules String[]        // For BASE_PLAN: which app modules are included
  enablesModule   String?         // For MODULE: which app module it enables
  odoo19ProductId Int?            // Odoo 19 product ID
}
```

### Subscription (订阅)
```prisma
model Subscription {
  tenantId        String          @unique  // One subscription per tenant
  status          SubscriptionStatus       // TRIAL, ACTIVE, PAST_DUE, CANCELLED, EXPIRED
  totalAmount     Decimal                  // Sum of all items
  items           SubscriptionItem[]       // Products in this subscription
}
```

### SubscriptionItem (订阅明细)
```prisma
model SubscriptionItem {
  subscriptionId  String
  productId       String
  quantity        Int             // For ADDON type (e.g., 3 additional terminals)
  unitPrice       Decimal         // Price at time of subscription
  status          SubscriptionStatus
}
```

---

## API 端点

### 订阅产品 API
| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/subscription/products` | 获取所有可订阅产品(按分类分组) |
| GET | `/api/subscription/products?category=PLAN` | 按分类筛选产品 |
| GET | `/api/subscription/products?type=BASE_PLAN` | 按类型筛选产品 |

### 订阅管理 API
| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/subscription` | 获取当前订阅(含明细和发票) |
| POST | `/api/subscription` | 创建新订阅(含多个产品) |
| PUT | `/api/subscription` | 更新订阅(添加/移除产品) |

### 订阅明细 API
| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/subscription/items` | 获取当前订阅的所有明细 |
| POST | `/api/subscription/items` | 添加产品到订阅 |
| GET | `/api/subscription/items/[id]` | 获取单个订阅明细 |
| PUT | `/api/subscription/items/[id]` | 更新明细数量 |
| DELETE | `/api/subscription/items/[id]` | 从订阅移除产品 |

---

## 当前开发状态

| 任务 | 状态 | 备注 |
|-----|------|------|
| Prisma Schema (模块化订阅) | ✅ 完成 | 新增 SubscriptionProduct, SubscriptionItem |
| 种子数据 (Odoo 19 产品) | ✅ 完成 | 27 个产品已定义 |
| .env Odoo 19 配置 | ✅ 完成 | Josh/admin |
| 订阅产品 API | ✅ 完成 | GET /api/subscription/products |
| 订阅管理 API | ✅ 完成 | GET/POST/PUT /api/subscription |
| 订阅明细 API | ✅ 完成 | CRUD /api/subscription/items |
| 前端订阅页面 | ✅ 完成 | 产品目录、购物车、订阅管理 |
| 数据库迁移 | ⏳ 待部署 | 需在服务器执行 |
| 种子数据导入 | ⏳ 待部署 | 需在服务器执行 |

---

## 下一步：服务器部署

### 1. 部署代码到服务器
```bash
# SSH 到服务器
ssh user@server

# 拉取最新代码
cd /path/to/seisei-erp
git pull origin main
```

### 2. 执行数据库迁移
```bash
# 生成迁移
npx prisma migrate dev --name modular_subscription

# 或者在生产环境
npx prisma migrate deploy

# 生成 Prisma Client
npx prisma generate
```

### 3. 运行种子脚本
```bash
npx tsx prisma/seed/seed.ts
```

### 4. 重启应用
```bash
# Docker 部署
docker-compose down && docker-compose up -d

# 或 PM2
pm2 restart seisei-erp
```

---

## 环境变量

```env
# Odoo 19 Enterprise (管理端 - 订阅管理)
ODOO19_URL=http://13.159.193.191:8069
ODOO19_DB=ERP
ODOO19_USERNAME=Josh
ODOO19_PASSWORD=admin

# Odoo 18 Community (业务端)
DEFAULT_ODOO_URL=https://testodoo.seisei.tokyo
DEFAULT_ODOO_DB=test001
```

---

## 文件变更清单

### 新增文件
- `src/app/api/subscription/products/route.ts` - 订阅产品 API
- `src/app/api/subscription/items/route.ts` - 订阅明细列表 API
- `src/app/api/subscription/items/[id]/route.ts` - 订阅明细详情 API

### 修改文件
- `prisma/schema.prisma` - 新增 SubscriptionProduct, SubscriptionItem 模型
- `prisma/seed/seed.ts` - 新增 27 个订阅产品种子数据
- `src/app/api/subscription/route.ts` - 支持模块化订阅
- `src/app/(app)/settings/subscription/page.tsx` - 模块化订阅前端页面
- `src/lib/odoo19.ts` - Odoo 19 客户端
