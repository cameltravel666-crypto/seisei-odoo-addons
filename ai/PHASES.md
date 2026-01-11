# PHASES.md - 项目阶段定义

> 用途: 定义项目阶段（P0-P3）及每阶段的 Exit Criteria
> 编码: UTF-8

---

## 阶段概览

| 阶段 | 名称 | 描述 | 主要任务 |
|------|------|------|----------|
| P0 | 核心功能开发与集成 | 核心服务开发、基础功能实现 | Create Batch / Generate Pack / Pull |
| P1 | 数据流闭环验证与优化 | 完整数据流验证、性能优化 | Review/Push、验收、监控、权限边界 |
| P2 | 产品化与商业化 | 套餐、计费、SLA、工单运营 | 套餐定义、计费系统、SLA 管理、工单运营 |
| P3 | 规模化复制 | 多客户实例复制、自动化、合规审计 | 多租户、自动化部署、合规审计 |

---

## P0: 核心功能开发与集成

### 描述

核心服务开发、基础功能实现、系统集成。

### 主要任务

1. **Create Batch** - 创建批次功能
   - Odoo 19 运营系统创建 batch
   - Bridge API 创建 batch 记录
   - 返回 batch_id

2. **Generate Pack** - 生成 Notion Pack
   - 创建 Notion Pack 页面
   - 创建 5 个子数据库（Profile, Menu, BOM, Payroll, SupplierItems）
   - 返回 pack_url 和 table_ids

3. **Pull from Notion** - 从 Notion 拉取数据
   - 从 Notion 查询数据
   - 同步到 Odoo staging
   - 返回导入统计

### Exit Criteria (如何判定进入 P1)

- ✅ Create Batch 功能正常（可创建 batch，返回 batch_id）
- ✅ Generate Pack 功能正常（Pack 页面包含 5 个子数据库）
- ✅ Pull from Notion 功能正常（数据成功导入到 Odoo staging）
- ✅ 错误处理完善（所有错误都有清晰消息）
- ✅ 日志完整（包含版本标记、命中实例链路）
- ✅ 文档完整（部署文档、用户手册）

---

## P1: 数据流闭环验证与优化

### 描述

完整数据流验证、性能优化、监控、权限边界固化。

### 主要任务

1. **Review/Push** - 审核和推送功能
   - Review 界面（显示 Pull 的数据）
   - Push 到正式模型的逻辑
   - 审批流程（如需要）

2. **验收** - 端到端验收
   - 完整流程测试（Create Batch → Generate Pack → Fill Notion → Pull → Review → Push）
   - 数据一致性验证
   - 性能测试

3. **监控** - 系统监控
   - 健康检查
   - 性能监控
   - 错误监控
   - 告警机制

4. **权限边界** - 权限管理
   - 用户权限定义
   - 数据访问控制
   - 操作审计

### Exit Criteria (如何判定进入 P2)

- ✅ Review/Push 功能实现并测试通过
- ✅ 端到端流程测试通过（无错误）
- ✅ 性能满足要求（Pull 100+ 记录 < 30 秒）
- ✅ 监控系统就绪（健康检查、性能监控、错误监控）
- ✅ 权限边界固化（用户权限、数据访问控制、操作审计）
- ✅ 文档完整（运维文档、监控文档、权限文档）

---

## P2: 产品化与商业化

### 描述

套餐定义、计费系统、SLA 管理、工单运营。

### 主要任务

1. **套餐定义** - 主包和可选包
   - 主包定义（Core Package）
   - 可选包定义（Addons）
   - Onboarding 初始化包

2. **计费系统** - 计费和订阅
   - 计费口径定义（A/B/C/D/E）
   - 订阅管理
   - 账单生成
   - 支付集成

3. **SLA 管理** - 服务级别协议
   - SLA 定义（可用性、响应时间、支持时间）
   - SLA 监控
   - SLA 报告

4. **工单运营** - 工单系统运营
   - 5类工单系统（DOC_REVIEW, GL_ADJ_APPROVAL, BANK_RECON_EXCEPTION, TAX_FILING, INSURANCE_FILING）
   - 工单流程管理
   - 工单统计和报告

### Exit Criteria (如何判定进入 P3)

- ✅ 套餐定义完成（主包、可选包、Onboarding 包）
- ✅ 计费系统实现（订阅、账单、支付）
- ✅ SLA 管理就绪（定义、监控、报告）
- ✅ 工单系统运营就绪（5类工单、流程、统计）
- ✅ 商业文档完整（商业模型、定价、SLA、工单）

---

## P3: 规模化复制

### 描述

多客户实例复制、自动化部署、合规审计。

### 主要任务

1. **多租户** - 多客户支持
   - 多租户架构
   - 数据隔离
   - 租户管理

2. **自动化部署** - 部署自动化
   - CI/CD 流程
   - 自动化测试
   - 自动化部署

3. **合规审计** - 合规和审计
   - 合规检查
   - 审计日志
   - 合规报告

### Exit Criteria (项目完成)

- ✅ 多租户架构实现（数据隔离、租户管理）
- ✅ 自动化部署就绪（CI/CD、测试、部署）
- ✅ 合规审计就绪（检查、日志、报告）
- ✅ 可支持 10+ 客户实例
- ✅ 文档完整（多租户文档、部署文档、合规文档）

---

## 阶段判定方法

### 当前阶段判定

**检查清单**:
1. 检查 P0 任务完成度
2. 检查 P0 Exit Criteria 满足度
3. 如果 P0 Exit Criteria 全部满足 → 进入 P1
4. 如果 P1 Exit Criteria 全部满足 → 进入 P2
5. 如果 P2 Exit Criteria 全部满足 → 进入 P3

### 阶段状态记录

**记录位置**: `ai/SNAPSHOT/PROJECT_STATUS.md`

**记录内容**:
- 当前阶段（P0/P1/P2/P3）
- 阶段完成度（百分比）
- Exit Criteria 满足情况
- 下一阶段准备情况

---

*End of PHASES*

