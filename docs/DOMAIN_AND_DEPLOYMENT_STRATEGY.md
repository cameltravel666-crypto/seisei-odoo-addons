# 域名规划与部署策略

**创建时间**: 2026-02-01 13:25 UTC+8
**状态**: 待确认

---

## 📊 当前域名使用情况 (原服务器 54.65.127.141)

### 生产环境域名
| 域名 | 服务 | 用途 |
|------|------|------|
| `seisei.tokyo` | 公司官网 | 官方网站 |
| `www.seisei.tokyo` | 公司官网 | 官方网站 (www 版本) |
| `erp.seisei.tokyo` | BizNexus | ERP 管理系统入口 |
| `biznexus.seisei.tokyo` | BizNexus | ERP 管理系统 (备用域名) |
| `*.erp.seisei.tokyo` | Odoo 18 | 多租户 Odoo (通配符) |
| `testodoo.seisei.tokyo` | Odoo 18 | 公开测试租户 |

### 测试/运维域名
| 域名 | 服务 | 用途 |
|------|------|------|
| `staging.odoo.seisei.tokyo` | Odoo Staging | Odoo 测试环境 |
| `staging.biznexus.seisei.tokyo` | BizNexus Staging | BizNexus 测试环境 |
| `ops.seisei.tokyo` | Traefik | 运维管理面板 |

---

## 🎯 推荐的域名规划方案

### 方案 A: 完全独立域名 (推荐 ✅)

**测试环境** (Staging EC2: 54.178.13.108):
```
staging.odoo.seisei.tokyo          → Odoo 18 Staging
staging.biznexus.seisei.tokyo      → BizNexus Staging (或 staging.erp.seisei.tokyo)
staging.www.seisei.tokyo           → 官网 Staging (可选)
```

**生产环境** (Production EC2: 57.180.39.58):
```
seisei.tokyo / www.seisei.tokyo    → 公司官网
erp.seisei.tokyo                   → BizNexus 生产
biznexus.seisei.tokyo              → BizNexus 生产 (备用)
*.erp.seisei.tokyo                 → Odoo 18 多租户 (ten_00000001.erp.seisei.tokyo)
testodoo.seisei.tokyo              → 公开测试租户
```

**优点**:
- ✅ 测试和生产完全隔离
- ✅ 测试环境不影响用户
- ✅ 可以随时在测试环境验证新功能
- ✅ 域名语义清晰，易于管理

**缺点**:
- ⚠️ 需要管理更多域名

---

### 方案 B: 共享域名 (不推荐 ❌)

测试和生产使用相同域名，通过 IP 或端口区分

**缺点**:
- ❌ 容易混淆测试和生产环境
- ❌ 测试可能影响生产用户体验
- ❌ 无法同时运行两个版本

---

## 🔄 推荐的开发部署流程

### 标准工作流

```
┌─────────────────────────────────────────────────────────────┐
│  开发阶段                                                     │
│  ─────────                                                   │
│  1. 本地开发 (localhost)                                      │
│  2. 代码提交到 Git                                            │
│  3. CI/CD 自动构建镜像                                        │
│  4. 推送到 GHCR (ghcr.io/cameltravel666-crypto/*)          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  测试阶段 (Staging EC2)                                       │
│  ─────────                                                   │
│  1. 拉取最新镜像到 Staging 服务器                             │
│  2. 部署到测试环境                                            │
│  3. 功能测试、集成测试                                         │
│  4. 性能测试、安全扫描                                         │
│  5. 团队成员验收                                              │
│                                                              │
│  域名: staging.*.seisei.tokyo                                │
│  数据: Staging RDS (测试数据)                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓ (测试通过)
┌─────────────────────────────────────────────────────────────┐
│  生产部署 (Production EC2)                                    │
│  ─────────                                                   │
│  1. 标记镜像版本 (tag: v1.2.3)                                │
│  2. 更新 Production 配置文件                                  │
│  3. 部署到生产环境                                            │
│  4. 健康检查验证                                              │
│  5. 监控告警检查                                              │
│                                                              │
│  域名: *.seisei.tokyo, *.erp.seisei.tokyo                   │
│  数据: Production RDS (真实数据)                              │
└─────────────────────────────────────────────────────────────┘
```

### 关键原则

1. **永远先在 Staging 测试**
   - 所有新功能、Bug 修复必须先部署到 Staging
   - Staging 测试通过后才能部署到 Production

2. **使用版本标签**
   - Staging: 使用 `latest` 或 `dev` 标签
   - Production: 使用明确版本号 (如 `v1.2.3`, `pin-20260201-abc123`)

3. **数据隔离**
   - Staging 使用测试数据库 (可以从生产复制)
   - Production 使用真实业务数据

4. **独立域名**
   - Staging: `staging.*.seisei.tokyo`
   - Production: `*.seisei.tokyo`

---

## 🚀 DNS 切换策略建议

### 现状

**原服务器** (54.65.127.141):
- 所有生产域名当前指向这里
- 所有服务仍在运行

**新服务器**:
- Staging EC2 (54.178.13.108): 已部署 Staging 环境，但无 DNS
- Production EC2(57.180.39.58): 已部署 Production 环境，但无 DNS

### 推荐的 DNS 切换计划

#### 阶段 1: 配置测试域名 (立即执行，无风险)

```dns
# Staging 环境域名 - 指向 Staging EC2
staging.odoo.seisei.tokyo       A    54.178.13.108
staging.biznexus.seisei.tokyo   A    54.178.13.108
staging.erp.seisei.tokyo        A    54.178.13.108  (可选)
```

**目的**: 让 Staging 环境可以通过域名访问，方便测试
**影响**: 无影响，这些域名目前指向原服务器的测试环境

#### 阶段 2: 验证新环境 (1-2 周)

1. 通过 Staging 域名访问新环境
2. 完整功能测试
3. 性能测试
4. 安全测试
5. 用户验收测试

#### 阶段 3: 灰度切换生产域名 (谨慎执行)

**选项 A: 先切换低风险服务**

```dns
# 先切换官网 (静态网站，低风险)
seisei.tokyo                    A    57.180.39.58
www.seisei.tokyo                A    57.180.39.58
```

等待 24 小时观察，如果没问题，继续：

```dns
# 切换 BizNexus
erp.seisei.tokyo                A    57.180.39.58
biznexus.seisei.tokyo           A    57.180.39.58

# 切换 Odoo 多租户
*.erp.seisei.tokyo              A    57.180.39.58
testodoo.seisei.tokyo           A    57.180.39.58
```

**选项 B: 一次性全部切换**

在维护窗口期 (如周六凌晨) 一次性切换所有域名

---

## ⚠️ 重要注意事项

### 切换前检查清单

- [ ] 新服务器所有服务运行正常
- [ ] 数据库迁移完成并验证
- [ ] SSL 证书配置测试通过 (通过 Staging 域名验证)
- [ ] 备份所有数据
- [ ] 准备回滚方案 (DNS TTL 设置为 300 秒)
- [ ] 监控告警配置完成
- [ ] 团队成员已通知

### DNS 切换注意事项

1. **TTL 值**:
   - 切换前 24 小时，将 TTL 降低到 300 秒 (5 分钟)
   - 切换完成 24 小时后，恢复到 3600 秒 (1 小时)

2. **回滚准备**:
   - 保持原服务器运行，直到确认新服务器完全稳定
   - 如遇问题，立即切回原 IP

3. **用户通知**:
   - 提前通知用户维护窗口
   - 准备客服支持应对可能的问题

---

## 📋 推荐的下一步行动

### 立即执行 (无风险)

1. **配置 Staging 域名** ✅
   ```dns
   staging.odoo.seisei.tokyo       →  54.178.13.108
   staging.biznexus.seisei.tokyo   →  54.178.13.108
   ```

2. **迁移公司官网** (可选)
   - 将 seisei-www 迁移到新服务器
   - 先用 Staging 域名测试

3. **完整功能测试**
   - 测试 BizNexus 所有功能
   - 测试 Odoo 多租户功能
   - 测试 OCR 集成

### 1-2 周后 (低风险)

4. **灰度切换官网域名**
   ```dns
   seisei.tokyo      →  57.180.39.58
   www.seisei.tokyo  →  57.180.39.58
   ```

5. **监控 24 小时**
   - 检查访问日志
   - 检查错误率
   - 用户反馈

### 确认稳定后 (中风险)

6. **切换业务域名**
   ```dns
   erp.seisei.tokyo          →  57.180.39.58
   biznexus.seisei.tokyo     →  57.180.39.58
   *.erp.seisei.tokyo        →  57.180.39.58
   ```

7. **下线原服务器**
   - 所有域名切换完成后 1-2 周
   - 确认没有流量指向原服务器
   - 执行最终备份
   - 关闭原服务器

---

## 🎯 总结建议

### 我的推荐

**现在应该做**:
1. ✅ **立即配置 Staging 域名** - 让测试环境可以访问，无风险
2. ✅ **迁移官网到新服务器** - 静态站点，可以先测试
3. ✅ **充分测试 1-2 周** - 确保所有功能正常

**不要现在做**:
- ❌ **不要立即切换生产域名** - 新环境还需要充分测试
- ❌ **不要一次性全切** - 应该分阶段灰度切换

**为什么**:
- 新环境虽然部署完成，但还没有经过真实域名 + SSL 的完整测试
- 通过 Staging 域名测试可以发现可能的问题
- 灰度切换可以降低风险，出问题可以快速回滚

---

**文档版本**: 1.0
**作者**: Claude Code
**需要用户确认**: 域名规划和切换策略
