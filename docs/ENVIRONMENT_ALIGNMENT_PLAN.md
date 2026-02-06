# Staging 和 Production 环境对齐计划

**创建时间**: 2026-02-01 13:32 UTC+8
**状态**: 待执行

---

## 📊 当前服务对比

### Staging EC2 (13.231.24.250)

| 服务 | 镜像 | 状态 |
|------|------|------|
| traefik | traefik:v3.2 | ✅ Up |
| odoo18-staging-web | 1db6436ca7e0 | ✅ Up (healthy) |
| odoo18-staging-redis | redis:7-alpine | ✅ Up (healthy) |
| seisei-www | ghcr.io/.../seisei-www:pin-20260129 | ✅ Up |
| biznexus-app | ghcr.io/.../seisei-erp:latest | ✅ Up |
| biznexus-db | postgres:16-alpine | ✅ Up (healthy) |

**总计**: 6 个容器

### Production EC2 (54.65.127.141)

| 服务 | 镜像 | 状态 |
|------|------|------|
| traefik | traefik:v3.2 | ✅ Up |
| odoo18-prod-web | 1db6436ca7e0 | ✅ Up (healthy) |
| odoo18-prod-redis | redis:7-alpine | ✅ Up (healthy) |
| seisei-www | ghcr.io/.../seisei-www:pin-20260129 | ✅ Up |
| ocr-service | ghcr.io/.../ocr-service:sha-b73ee89 | ✅ Up (healthy) |
| ocr-db | postgres:15-alpine | ✅ Up (healthy) |
| langbot | dde184eb3cfc | ✅ Up |

**总计**: 7 个容器

---

## ⚠️ 关键差异分析

### Production 独有的服务

| 服务 | 用途 | 是否必须 |
|------|------|----------|
| **ocr-service + ocr-db** | 图像识别服务 | ✅ 是 - BizNexus 功能依赖 |
| **langbot** | AI 聊天助手 | ❓ 待确认 |

### Staging 独有的服务

| 服务 | 用途 | 是否必须 |
|------|------|----------|
| **biznexus-app + biznexus-db** | ERP 管理系统 | ✅ 是 - 核心业务系统 |

### 当前架构问题 ❌

```
Staging EC2:
  BizNexus ──跨服务器──→ Production EC2: OCR Service
     ↓
  不合理！测试环境依赖生产服务
```

**问题**:
1. Staging 环境的 BizNexus 连接的是 Production EC2 上的 OCR 服务
2. Staging 测试可能影响 Production OCR 的性能和配额
3. 无法独立测试 OCR 功能
4. 环境不对称，Staging 不是 Production 的真实镜像

---

## 🎯 对齐目标

### 理想的环境配置

**Staging = Production 的完整镜像**

两个环境应该运行**完全相同**的服务栈:

```
Staging EC2:                    Production EC2:
┌────────────────────┐         ┌────────────────────┐
│ Traefik            │         │ Traefik            │
│ Odoo 18 + Redis    │         │ Odoo 18 + Redis    │
│ BizNexus + DB      │         │ BizNexus + DB      │
│ OCR Service + DB   │         │ OCR Service + DB   │
│ Langbot            │         │ Langbot            │
│ Seisei-www         │         │ Seisei-www         │
└────────────────────┘         └────────────────────┘
     ↓                              ↓
  Staging RDS                   Production RDS
  (测试数据)                      (真实数据)
```

**关键原则**:
- ✅ 相同的服务
- ✅ 相同的镜像版本 (或 Staging 使用 latest)
- ✅ 相同的网络配置
- ✅ 相同的 Traefik 路由逻辑
- ❌ 不同的数据库 (数据隔离)
- ❌ 不同的域名 (环境区分)

---

## 📋 对齐执行计划

### 步骤 1: 部署 OCR 到 Staging (高优先级)

**原因**:
- BizNexus 功能依赖 OCR
- 当前 Staging BizNexus 连接 Production OCR (不合理)

**操作**:
```bash
# 1. 在 Staging EC2 上创建 OCR stack
# 2. 导出 Production OCR 数据库
# 3. 导入到 Staging OCR 数据库
# 4. 启动 OCR 服务
# 5. 更新 BizNexus 配置指向本地 OCR
```

**预期结果**:
- Staging BizNexus → Staging OCR (本地)
- 测试环境完全独立

### 步骤 2: 部署 BizNexus 到 Production (高优先级)

**原因**:
- BizNexus 是核心业务系统
- Production 必须有完整的业务功能

**操作**:
```bash
# 1. 在 Production EC2 上创建 BizNexus stack
# 2. 导出 Staging BizNexus 数据库 (如果有测试数据)
# 3. 在 Production 创建空数据库 (或从原服务器迁移真实数据)
# 4. 启动 BizNexus 服务
# 5. 配置 Traefik 路由
```

**预期结果**:
- Production BizNexus → Production OCR (本地)
- Production 环境功能完整

### 步骤 3: 部署 Langbot 到 Staging (中优先级)

**前提**: 确认 Langbot 是否必须服务

**操作**:
```bash
# 1. 在 Staging EC2 上创建 Langbot stack
# 2. 从 Production 复制配置和数据
# 3. 启动 Langbot 服务
```

**预期结果**:
- 两个环境服务完全一致

### 步骤 4: 验证环境对称性 (必须)

**检查清单**:
- [ ] 两个环境容器数量相同
- [ ] 两个环境服务类型相同
- [ ] Staging 服务之间通过本地网络通信
- [ ] Production 服务之间通过本地网络通信
- [ ] 无跨环境服务调用
- [ ] 数据库完全隔离

---

## 🚀 立即执行计划

### 优先级 1 (立即执行)

**1. 部署 OCR 到 Staging**
- 时间估计: 15 分钟
- 风险: 低
- 影响: Staging 环境独立性

**2. 部署 BizNexus 到 Production**
- 时间估计: 20 分钟
- 风险: 低 (Staging 已验证)
- 影响: Production 功能完整性

### 优先级 2 (可选)

**3. 部署 Langbot 到 Staging**
- 时间估计: 10 分钟
- 风险: 低
- 影响: 环境完全对称

---

## 📊 对齐后的架构

### 完整对称的环境

```
┌─────────────────────────────────────────────────────────────┐
│                    Staging Environment                       │
│  EC2: 13.231.24.250                                         │
│  ┌──────────┐                                                │
│  │ Traefik  │                                                │
│  └────┬─────┘                                                │
│       │                                                      │
│       ├─→ Odoo 18 ──→ Staging RDS (18 databases)           │
│       ├─→ BizNexus ──→ BizNexus DB (本地)                   │
│       │      └──→ OCR Service (本地) ──→ OCR DB (本地)      │
│       ├─→ Seisei-www                                        │
│       └─→ Langbot                                           │
│                                                              │
│  域名: staging.*.seisei.tokyo                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   Production Environment                     │
│  EC2: 54.65.127.141                                          │
│  ┌──────────┐                                                │
│  │ Traefik  │                                                │
│  └────┬─────┘                                                │
│       │                                                      │
│       ├─→ Odoo 18 ──→ Production RDS (19 databases)        │
│       ├─→ BizNexus ──→ BizNexus DB (本地)                   │
│       │      └──→ OCR Service (本地) ──→ OCR DB (本地)      │
│       ├─→ Seisei-www                                        │
│       └─→ Langbot                                           │
│                                                              │
│  域名: *.seisei.tokyo, *.erp.seisei.tokyo                   │
└─────────────────────────────────────────────────────────────┘
```

**关键优势**:
- ✅ 环境完全对称
- ✅ 服务完全隔离
- ✅ 可以独立测试
- ✅ Staging 是 Production 的真实镜像
- ✅ 部署流程一致: Staging 测试 → Production 上线

---

## ⚠️ 重要注意事项

### 数据管理

**Staging 数据**:
- 使用测试数据
- 可以定期从 Production 复制匿名化数据
- OCR 配额独立管理 (使用测试 API Key 或低配额)

**Production 数据**:
- 真实业务数据
- 严格备份策略
- OCR 使用生产 API Key

### 配额和资源

**OCR Service**:
- Staging: 使用免费配额或测试配额
- Production: 使用付费配额

**Gemini API**:
- Staging: 使用单独的测试 API Key
- Production: 使用生产 API Key

---

## 📝 下一步行动

**现在应该做**:
1. ✅ 部署 OCR Service 到 Staging EC2
2. ✅ 部署 BizNexus 到 Production EC2
3. ✅ 更新 Staging BizNexus 配置 (连接本地 OCR)
4. ⚠️ 确认 Langbot 是否需要 (询问用户)
5. ✅ 验证环境对称性

**完成后**:
- 两个环境完全对齐
- 可以开始正常的开发部署流程
- Staging 测试通过后直接部署到 Production

---

**文档版本**: 1.0
**作者**: Claude Code
**待用户确认**: 是否需要 Langbot 服务？
