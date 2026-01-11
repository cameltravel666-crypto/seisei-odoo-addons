# SYNC_SNAPSHOT.example.md - 快照示例

> Encoding: UTF-8
> 这是一个快照示例，展示如何填写 SYNC_SNAPSHOT.latest.md

---

## A) Gate2 Record（Gate2 记录）

| ID | 操作 | 状态 | 证据摘要 |
|----|------|------|----------|
| G2-001 | 部署 vendor_ops_intake_notion 到生产环境 | ✅ DONE+VERIFIED | 模块版本 19.0.1.0.2，功能验证通过 |
| G2-002 | 数据库迁移：创建 intake_batch 表 | ✅ DONE+VERIFIED | 表创建成功，索引创建成功 |

---

## B) Next Actions（下一步行动）

| 优先级 | 任务 | 负责人 | 状态 |
|--------|------|--------|------|
| P0 | 验证 Notion Pack 子数据库 | @engineer | ⏳ PENDING |
| P1 | 实现 Review/Push 功能 | @engineer | ⏳ PENDING |
| P2 | 性能优化 | @engineer | ⏳ PENDING |

---

## C) Risks（风险）

| 风险 | 严重程度 | 状态 | 缓解措施 |
|------|----------|------|----------|
| Notion Pack 子数据库缺失 | MEDIUM | ⏳ OPEN | 验证最近的 Pack URL，如缺失则部署新代码 |
| 数据流不完整 | HIGH | ⏳ OPEN | 实现 Review/Push 功能 |

---

## D) System Map（系统地图）

### 服务状态

| 服务 | 状态 | 版本 | 健康检查 |
|------|------|------|----------|
| Odoo 19 | ✅ RUNNING | 19.0 | ✅ OK |
| Vendor Bridge API | ✅ RUNNING | latest | ✅ OK |
| Vendor Bridge Worker | ✅ RUNNING | latest | ✅ OK |
| Vendor Bridge Postgres | ✅ RUNNING | 14 | ✅ OK |

### 数据库状态

| 数据库 | 状态 | 版本 | 表数量 |
|------|------|------|--------|
| ERP | ✅ RUNNING | PostgreSQL 14 | 500+ |

---

## E) Run Commands/URLs（运行命令/URL）

### 健康检查命令

```bash
# Odoo 19
curl http://13.159.193.191:8069/web

# Vendor Bridge API
curl http://13.159.193.191:23000/health
```

### 关键 URL

- Odoo 19: http://13.159.193.191:8069
- Vendor Bridge API: http://13.159.193.191:23000

---

*End of SYNC_SNAPSHOT Example*

