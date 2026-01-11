# SYNC_SNAPSHOT Template

> Encoding: UTF-8
> 快照模板 - 固定分区结构

---

## A) Gate2 Record（Gate2 记录）

| ID | 操作 | 状态 | 证据摘要 |
|----|------|------|----------|
| G2-XXX | [操作描述] | ✅ DONE+VERIFIED / ⏳ IN_PROGRESS / ❌ FAILED | [证据摘要，1-2 句话] |

---

## B) Next Actions（下一步行动）

| 优先级 | 任务 | 负责人 | 状态 |
|--------|------|--------|------|
| P0 | [任务描述] | @username | ⏳ PENDING / ✅ DONE |
| P1 | [任务描述] | @username | ⏳ PENDING / ✅ DONE |

---

## C) Risks（风险）

| 风险 | 严重程度 | 状态 | 缓解措施 |
|------|----------|------|----------|
| [风险描述] | HIGH / MEDIUM / LOW | ⏳ OPEN / ✅ MITIGATED | [缓解措施] |

---

## D) System Map（系统地图）

### 服务状态

| 服务 | 状态 | 版本 | 健康检查 |
|------|------|------|----------|
| [服务名] | ✅ RUNNING / ❌ DOWN | [版本] | [健康检查结果] |

### 数据库状态

| 数据库 | 状态 | 版本 | 表数量 |
|------|------|------|--------|
| [数据库名] | ✅ RUNNING / ❌ DOWN | [版本] | [表数量] |

---

## E) Run Commands/URLs（运行命令/URL）

### 健康检查命令

```bash
# 服务 1
curl http://localhost:PORT/health

# 服务 2
docker ps | grep <service>
```

### 关键 URL

- [服务名]: http://localhost:PORT
- [服务名]: http://domain.com

---

*End of SYNC_SNAPSHOT Template*

