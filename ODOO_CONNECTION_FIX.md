# Odoo 连接配置修复

**日期**: 2026-01-11  
**问题**: 登录失败 "Invalid credentials" - 容器无法连接到 Odoo  
**状态**: 🔄 修复中

---

## 🐛 问题分析

### 症状
- 登录页面显示：`Invalid credentials`
- 应用日志显示：`Connect Timeout Error (attempted address: 172.22.0.3:8069)`

### 根本原因
1. **Docker 容器网络隔离**：
   - 容器内 `localhost` 指向容器本身，不是宿主机
   - 容器无法直接访问宿主机的 `localhost:8069`

2. **host.docker.internal 在 Linux 上不可用**：
   - `host.docker.internal` 仅在 Docker Desktop (Mac/Windows) 上自动可用
   - Linux 需要通过 `extra_hosts` 手动配置

---

## ✅ 解决方案

### 1. 在 docker-compose.yml 添加 extra_hosts

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    # ... 其他配置 ...
    extra_hosts:
      - "host.docker.internal:host-gateway"  # ← 关键配置
    volumes:
      - ./prisma:/app/prisma
```

**`host-gateway` 说明**：
- Docker Compose v2.10+ 支持
- 自动解析为宿主机的内网 IP
- 等同于 `host.docker.internal:10.0.1.184`

### 2. 更新 .env 配置

```env
# Odoo - Now using host.docker.internal with extra_hosts
ODOO_URL="http://host.docker.internal:8069"
ODOO_DB="test001"
ODOO_USERNAME="admin"
ODOO_PASSWORD="admin"
```

---

## 🔧 修复步骤

```bash
# 1. SSH 到服务器
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141

# 2. 修改 docker-compose.yml
cd /opt/seisei-erp
sudo vi docker-compose.yml
# 添加 extra_hosts 配置

# 3. 更新 .env
sudo vi .env
# 修改 ODOO_URL

# 4. 重新部署
sudo docker compose down
sudo docker compose up -d

# 5. 验证
sudo docker logs seisei-erp-app --tail 50
```

---

## 📊 配置对比

| 方案 | 适用场景 | 可用性 |
|------|---------|-------|
| `localhost` | 容器使用 `--network host` | ⚠️ 不推荐 |
| `10.0.1.184` (直接 IP) | 简单，但 IP 可能变化 | ✅ 可用 |
| `host.docker.internal` (无 extra_hosts) | Docker Desktop only | ❌ Linux 不可用 |
| `host.docker.internal` + `extra_hosts` | **最佳实践** | ✅ **推荐** |

---

## ✅ 验证清单

- [x] docker-compose.yml 添加 `extra_hosts`
- [x] .env 使用 `host.docker.internal:8069`
- [x] 容器重新部署
- [ ] 应用日志无连接错误
- [ ] 登录页面可正常登录
- [ ] Dashboard 数据正常加载

---

## 🔍 故障排查

### 检查 extra_hosts 是否生效

```bash
# 查看容器内的 /etc/hosts
sudo docker exec seisei-erp-app cat /etc/hosts | grep host.docker.internal

# 应该看到类似：
# 10.0.1.184    host.docker.internal
```

### 测试连接

```bash
# 从容器内测试（如果有 curl）
sudo docker exec seisei-erp-app curl -I http://host.docker.internal:8069

# 从宿主机测试
curl -I http://localhost:8069
```

### 查看日志

```bash
# 查找连接错误
sudo docker logs seisei-erp-app 2>&1 | grep -i "connect.*error\|timeout"

# 查找认证相关
sudo docker logs seisei-erp-app 2>&1 | grep -i "auth\|login"
```

---

## 📚 参考文档

- [Docker Compose extra_hosts](https://docs.docker.com/compose/compose-file/compose-file-v3/#extra_hosts)
- [Docker host networking](https://docs.docker.com/network/host/)
- [host-gateway special value](https://github.com/docker/compose/pull/8710)

---

## 🎯 下一步

1. 等待容器完全启动（~30秒）
2. 在浏览器/iPad 中刷新页面
3. 尝试登录
4. 如仍失败，检查 Odoo 用户名密码是否正确

---

**关键配置已完成，正在验证连接...** ⏳
