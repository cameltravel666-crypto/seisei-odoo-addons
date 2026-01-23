# Seisei ERP 项目状态报告 - 2026-01-16

## 当前状态总结

### ✅ 已完成的工作

#### 1. 现状盘点 (REPORT.md)
- ✅ **系统架构分析**: 技术栈、目录结构、多租户标识
- ✅ **权限判定链路**: 从 App → API → Odoo/DB 的完整流程
- ✅ **订阅归属分析**: 确认订阅主体为 Tenant（租户级）
- ✅ **混乱风险点识别**: 权限控制、订阅管理、审计风险
- ✅ **MVP 范围定义**: 最小改动面已明确

**文档位置**: `docs/REPORT.md`

#### 2. RBAC + Entitlements 实现
- ✅ **数据库 Schema**: Membership, Entitlements, AuditLog 模型已添加
- ✅ **迁移文件**: `prisma/migrations/20260116_add_rbac_entitlements_audit`
- ✅ **Guards 实现**: TenantGuard, RoleGuard, EntitlementGuard, StoreScopeGuard
- ✅ **Services 实现**: 
  - `membership-service.ts` - 成员关系管理
  - `entitlements-service.ts` - 权益管理
  - `audit-service.ts` - 审计日志
- ✅ **API 端点**: 
  - `/api/me` - 用户上下文
  - `/api/me/entitlements` - 权益查询
  - `/api/admin/users` - 用户管理
  - `/api/admin/users/:id` - 用户操作
  - `/api/admin/audit-logs` - 审计日志查询

**关键文件**:
- `src/lib/guards.ts`
- `src/lib/membership-service.ts`
- `src/lib/entitlements-service.ts`
- `src/lib/audit-service.ts`

#### 3. 文档完善
- ✅ `docs/REPORT.md` - 现状盘点报告
- ✅ `docs/AUTHZ_MODEL.md` - 授权模型文档
- ✅ `docs/ENTITLEMENTS.md` - 权益字段定义
- ✅ `docs/OPERATIONS.md` - 操作指南
- ✅ `docs/CHANGE_SUMMARY.md` - 变更摘要

---

## 实现细节

### 数据库模型

#### Membership (成员关系)
```prisma
model Membership {
  id            String           @id
  userId        String
  tenantId      String
  role          Role             // BILLING_ADMIN | ORG_ADMIN | MANAGER | OPERATOR
  storeScope    String[]         // 门店范围，空=全部
  status        MembershipStatus // ACTIVE | INACTIVE | SUSPENDED
  invitedBy     String?
  invitedAt     DateTime?
  activatedAt   DateTime?
}
```

#### Entitlements (权益)
```prisma
model Entitlements {
  id            String            @id
  tenantId      String            @unique
  modules       String[]          // 开通的模块列表
  maxUsers      Int
  maxStores     Int
  maxTerminals  Int
  status        EntitlementStatus // ACTIVE | TRIAL | PAST_DUE | SUSPENDED | EXPIRED
  periodEnd     DateTime?
  source        String            // stripe | manual | odoo
  stripeSubId   String?
}
```

#### AuditLog (审计日志)
```prisma
model AuditLog {
  id            String      @id
  tenantId      String
  userId        String?     // 操作人
  targetUserId  String?     // 被操作人
  action        AuditAction // USER_INVITED | ROLE_CHANGED | SUBSCRIPTION_UPDATED | ...
  resource      String
  resourceId    String?
  changes       Json?       // {old: {}, new: {}}
  createdAt     DateTime
}
```

### Guards 实现

#### TenantGuard
- 验证 JWT session
- 验证 tenant 存在且活跃
- 返回 GuardContext

#### RoleGuard
- 验证用户角色权限
- 支持角色层级检查
- 可配置最小角色要求

#### EntitlementGuard
- 验证模块是否开通
- 检查额度限制（用户数、门店数、终端数）
- 验证订阅状态

#### StoreScopeGuard
- 验证门店访问权限
- 支持空数组（全部门店）和指定门店列表

### API 端点

#### GET /api/me
返回当前用户完整上下文：
```json
{
  "user": {...},
  "tenant": {...},
  "membership": {
    "role": "ORG_ADMIN",
    "storeScope": []
  },
  "entitlements": {
    "modules": ["POS", "INVENTORY", ...],
    "maxUsers": 10,
    "status": "ACTIVE"
  }
}
```

#### GET /api/me/entitlements
返回租户权益（用于 App/Web 渲染）

#### GET /api/admin/users
ORG_ADMIN 可管理本 tenant 用户列表

#### POST /api/admin/users/invite
邀请创建/绑定 user 到 tenant，设置 role 与门店范围

#### PATCH /api/admin/users/:id
修改 role/门店范围/禁用

#### GET /api/admin/audit-logs
可筛选 tenant/user/action/time 的审计日志

---

## 下一步工作

### 待完成项目

#### 1. 测试 (高优先级)
- [ ] Guards 单元测试
- [ ] MembershipService 测试
- [ ] EntitlementsService 测试
- [ ] AuditService 测试
- [ ] 集成测试（登录、权限检查、用户管理）

#### 2. 前端适配 (高优先级)
- [ ] 更新 `useFeatureGate` hook 使用 `/api/me/entitlements`
- [ ] 更新所有模块访问检查
- [ ] 添加用户管理页面（如不存在）

#### 3. App 适配 (中优先级)
- [ ] iOS App: 拉取 `/api/me/entitlements`
- [ ] Android App: 拉取 `/api/me/entitlements`
- [ ] 未开通模块显示"锁定态+联系管理员"
- [ ] **禁止**: 任何购买/订阅 CTA

#### 4. Stripe 同步增强 (中优先级)
- [ ] 完善 Webhook 处理
- [ ] 自动更新 Entitlements
- [ ] 审计日志记录
- [ ] 对账功能

#### 5. 监控和运维 (低优先级)
- [ ] 设置审计日志监控
- [ ] 配置告警规则
- [ ] 性能优化

---

## 关键约束遵守情况

| 约束 | 状态 | 说明 |
|------|------|------|
| iOS App 仅作为 Web 伴随工具 | ⚠️ 待验证 | 需要检查 App 代码 |
| App 内不得出现购买/订阅 CTA | ⚠️ 待验证 | 需要检查 App 代码 |
| 订阅与计费主体统一为 tenant | ✅ 已实现 | Subscription.tenantId |
| 权限控制必须在服务端强制执行 | ✅ 已实现 | Guards 已实现 |
| 必须有审计日志 | ✅ 已实现 | AuditLog 模型和 AuditService |
| 必须支持对账 | ⚠️ 部分实现 | Entitlements.source 已添加，对账功能待完善 |

---

## 运行和测试

### 运行迁移
```bash
cd "/Users/taozhang/Projects/Seisei ERP"
npx prisma generate
npx prisma migrate deploy
```

### 启动开发服务器
```bash
npm run dev
```

### 运行测试（待实现）
```bash
npm test
```

---

## 风险点与兼容策略

### 兼容性
- ✅ **向后兼容**: 所有更改都是增量的
- ✅ **数据迁移**: 现有用户自动创建 Membership
- ✅ **Legacy 字段**: `User.isAdmin` 保留用于向后兼容

### 已知限制
1. Store scope 验证需要 Odoo store IDs - 确保一致性
2. 前端 feature gate hooks 需要更新以使用新的 `/api/me/entitlements`
3. App 需要适配新的权限模型

---

## 总结

### 完成度: **85%**

✅ **已完成**:
- 数据库模型设计
- Guards 实现
- Services 实现
- API 端点实现
- 文档完善

⏳ **待完成**:
- 测试编写
- 前端适配
- App 适配
- Stripe 同步增强

---

**最后更新**: 2026-01-16  
**状态**: ✅ 核心功能已实现，待测试和适配
