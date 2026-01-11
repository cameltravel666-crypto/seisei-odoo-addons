# redact_rules.md - 脱敏规则

> Encoding: UTF-8
> 定义日志脱敏规则

---

## 必须脱敏的字段

### 敏感字段列表

| 字段名 | 模式 | 替换 |
|--------|------|------|
| API Key | `api[_-]?key` | `***MASKED***` |
| Token | `token` | `***MASKED***` |
| Secret | `secret` | `***MASKED***` |
| Password | `password` | `***MASKED***` |
| Auth | `auth` | `***MASKED***` |
| Authorization | `authorization` | `***MASKED***` |

### 可选脱敏字段

| 字段名 | 模式 | 替换 |
|--------|------|------|
| Email | `email` | `***MASKED***` |
| Phone | `phone` | `***MASKED***` |

---

## 脱敏规则

### 规则 1: 键值对格式

**模式**: `KEY=value` 或 `KEY: value`

**替换**: `KEY=***MASKED***` 或 `KEY: ***MASKED***`

**示例**:
- `NOTION_API_KEY=secret_xxx` → `NOTION_API_KEY=***MASKED***`
- `"token": "abc123"` → `"token": "***MASKED***"`

### 规则 2: JSON 格式

**模式**: `"key": "value"`

**替换**: `"key": "***MASKED***"`

**示例**:
- `{"api_key": "secret_xxx"}` → `{"api_key": "***MASKED***"}`

### 规则 3: URL 参数

**模式**: `?key=value&key2=value2`

**替换**: `?key=***MASKED***&key2=***MASKED***`

**示例**:
- `https://api.example.com?token=abc123` → `https://api.example.com?token=***MASKED***`

---

## 实现方式

### Bash (sed)

```bash
mask_secrets() {
    local text="$1"
    echo "$text" | sed -E \
        -e 's/(api[_-]?key|API[_-]?KEY)[=:][[:space:]]*["'\'']?[^"'\''[:space:]]+["'\'']?/\1=***MASKED***/gi' \
        -e 's/(token|TOKEN)[=:][[:space:]]*["'\'']?[^"'\''[:space:]]+["'\'']?/token=***MASKED***/gi' \
        -e 's/(secret|SECRET)[=:][[:space:]]*["'\'']?[^"'\''[:space:]]+["'\'']?/secret=***MASKED***/gi' \
        -e 's/(password|PASSWORD)[=:][[:space:]]*["'\'']?[^"'\''[:space:]]+["'\'']?/password=***MASKED***/gi' \
        -e 's/(auth|AUTH)[=:][[:space:]]*["'\'']?[^"'\''[:space:]]+["'\'']?/auth=***MASKED***/gi'
}
```

### Python (re)

```python
import re

def mask_secrets(text: str) -> str:
    """脱敏函数：替换敏感信息"""
    patterns = [
        (r'(?i)(api[_-]?key|token|secret|password|auth)[=:]\s*["\']?[^"\'\s]+["\']?', r'\1=***MASKED***'),
    ]
    masked = text
    for pattern, replacement in patterns:
        masked = re.sub(pattern, replacement, masked)
    return masked
```

---

## 验证

### 测试用例

```bash
# 测试 1: 键值对
echo "NOTION_API_KEY=secret_xxx" | mask_secrets
# 预期: NOTION_API_KEY=***MASKED***

# 测试 2: JSON
echo '{"token": "abc123"}' | mask_secrets
# 预期: {"token": "***MASKED***"}

# 测试 3: URL
echo "https://api.example.com?token=abc123" | mask_secrets
# 预期: https://api.example.com?token=***MASKED***
```

---

*End of redact_rules*

