# EVIDENCE_CHECKLIST.md - 证据清单

> Encoding: UTF-8
> 列出"必须收集的证据"清单

---

## 必须收集的证据

### 1. 版本标记

**目的**: 确认正在运行的代码版本

**收集方式**:
```bash
# 代码版本标记
grep -n "Version:" <file> | head -1

# 模块版本（Odoo）
psql -d <db> -c "SELECT name, state, latest_version FROM ir_module_module WHERE name = '...';"

# Python 模块 __file__
python3 -c "import <module>; print(<module>.__file__)"
```

**证据格式**:
- 代码版本: `# Version: YYYY-MM-DD-xxx`
- 模块版本: `name | state | latest_version`
- 文件路径: `/path/to/file.py`

---

### 2. 命中实例链路

**目的**: 确认 UI 实际命中的实例（DNS → 反代 → 容器 → DB → 路径）

**收集方式**:
```bash
# DNS 解析
dig +short <domain>

# 反向代理
curl -v <url> | grep -i "server\|location"

# 容器/进程
docker ps | grep <service>
# 或
systemctl status <service>

# 数据库
psql -d <db> -c "SELECT current_database();"

# Addons 路径
cat <config> | grep addons_path

# 模块版本
psql -d <db> -c "SELECT name, state, latest_version FROM ir_module_module WHERE name = '...';"
```

**证据格式**:
```
DNS: <domain> -> <IP>
反向代理: <server> -> <container>
容器: <container_name> (Up/Down)
数据库: <db_name>
Addons 路径: <path>
模块版本: <name> | <state> | <version>
```

---

### 3. 请求/响应关键字段（脱敏后）

**目的**: 诊断 API 调用问题

**收集方式**:
```bash
# 请求参数（脱敏）
curl -X POST <url> -H "Content-Type: application/json" -d '{"key": "value"}' | jq

# 响应类型和预览（脱敏）
# 在代码中记录: type(response), response.keys(), response_preview[:200]
```

**证据格式**:
- 请求参数: `{"key": "***MASKED***"}`
- 响应类型: `dict` / `list` / `str`
- 响应键: `['key1', 'key2', ...]`
- 响应预览: `{...}` (前 200 字符，脱敏)

---

### 4. 结构化报错

**目的**: 诊断错误原因

**收集方式**:
```python
# 在代码中记录
error_type = type(error).__name__
error_len = len(error) if hasattr(error, '__len__') else 'N/A'
error_keys = list(error.keys()) if isinstance(error, dict) else []
error_preview = str(error)[:200]  # 脱敏后
```

**证据格式**:
- 错误类型: `AttributeError` / `TypeError` / `ValueError`
- 错误长度: `N` (如果是 list/dict)
- 错误键: `['key1', 'key2']` (如果是 dict)
- 错误预览: `...` (前 200 字符，脱敏)

---

### 5. 数据库状态

**目的**: 确认数据库表/数据状态

**收集方式**:
```bash
# 表存在性
psql -d <db> -c "SELECT to_regclass('public.table_name');"

# 表结构
psql -d <db> -c "\d table_name"

# 记录数
psql -d <db> -c "SELECT COUNT(*) FROM table_name;"
```

**证据格式**:
- 表存在: `to_regclass('public.table_name')` = `<oid>` / `NULL`
- 表结构: `Column | Type | ...`
- 记录数: `count`

---

### 6. 环境变量生效

**目的**: 确认环境变量是否正确配置

**收集方式**:
```bash
# Docker 环境变量
docker exec <container> env | grep <VAR_NAME>

# Systemd 环境变量
systemctl show <service> | grep <VAR_NAME>

# 配置文件
cat <config> | grep <VAR_NAME>
```

**证据格式**:
- 环境变量: `<VAR_NAME>=***MASKED***` (存在/不存在)
- 配置文件: `<VAR_NAME>=***MASKED***` (存在/不存在)

---

### 7. 日志片段

**目的**: 确认功能执行情况

**收集方式**:
```bash
# 容器日志
docker logs <container> --tail 100 | grep <pattern>

# 系统日志
journalctl -u <service> --since "10 min ago" | grep <pattern>

# 应用日志
tail -100 <log_file> | grep <pattern>
```

**证据格式**:
- 日志片段: `[TIMESTAMP] LEVEL MESSAGE` (前 500 字符，脱敏)

---

## 证据文件命名

**格式**: `ai/SNAPSHOT/WO-XXX-<type>.log`

**类型**:
- `evidence.log` - 证据日志
- `run.log` - 执行日志
- `acceptance.log` - 验收日志

---

## 脱敏规则

**必须脱敏的字段**:
- `token`
- `secret`
- `password`
- `auth`
- `api_key`
- `apiKey`
- `authorization`
- `email`（可选）
- `phone`（可选）

**脱敏方式**:
- 替换为 `***MASKED***`
- 保留字段名和结构
- 保留前 3 个字符（如需要）

---

*End of EVIDENCE_CHECKLIST*

