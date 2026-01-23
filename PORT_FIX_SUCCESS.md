# 服务端口修复完成

**日期**: 2026-01-11  
**问题**: 服务端口改变导致无法访问（502 Bad Gateway）  
**状态**: ✅ 已修复

---

## 🐛 问题分析

### 原始错误
1. **502 Bad Gateway** - Nginx 无法连接到后端
2. **iPad/iPhone 显示**: "Failed to fetch dashboard data"
3. **Container logs**: `Connect Timeout Error (attempted address: 172.22.0.3:8069)`

### 根本原因
1. **端口映射错误**: 容器使用 9527 端口，但外部期望 3000
2. **Odoo 连接失败**: 容器无法访问宿主机的 Odoo (localhost:8069)
3. **Docker 网络隔离**: 容器在独立网络中，无法访问 `localhost`
4. **数据库配置错误**: 使用了不存在的数据库连接

---

## ✅ 解决方案

### 1. 修复 Odoo 连接

**问题**: Docker 容器无法访问宿主机 `localhost:8069`

**解决**: 使用 `host.docker.internal` 访问宿主机服务

```bash
# .env 配置
ODOO_URL="http://host.docker.internal:8069"
ODOO_DB="test001"
```

### 2. 修复端口映射

**问题**: 容器内部 9527，外部期望 3000

**解决**: 通过环境变量设置端口映射

```bash
# .env 添加
APP_PORT=3000

# docker-compose.yml 使用
ports:
  - "${APP_PORT:-9527}:9527"
```

**结果**: `0.0.0.0:3000->9527` ✅

### 3. 修复数据库连接

**问题**: 使用了不存在的数据库

**解决**: 使用容器内部 PostgreSQL

```bash
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/seisei_erp?schema=public"
```

---

## 📁 修改内容

### `/opt/seisei-erp/.env`

```env
# Database - Use internal container DB
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/seisei_erp?schema=public"

# NextAuth
NEXTAUTH_SECRET="change-this-to-a-random-string-in-production"
NEXTAUTH_URL="https://biznexus.seisei.tokyo"

# Odoo - Use host.docker.internal to access host machine from container
ODOO_URL="http://host.docker.internal:8069"
ODOO_DB="test001"
ODOO_USERNAME="admin"
ODOO_PASSWORD="admin"

# App Port
APP_PORT=3000
```

---

## 🚀 部署步骤

```bash
# 1. SSH 到服务器
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141

# 2. 修改配置
cd /opt/seisei-erp
sudo vi .env  # 或使用上述内容

# 3. 重启容器
sudo docker compose down
sudo docker compose up -d

# 4. 验证
sudo docker ps | grep seisei-erp
curl http://localhost:3000
```

---

## ✅ 验证结果

### 容器状态
```
CONTAINER ID   IMAGE            STATUS        PORTS
352997538f8a   seisei-erp-app  Up 8 seconds  0.0.0.0:3000->9527/tcp ✅
833c24ec6345   postgres:16     Up (healthy)  5432/tcp ✅
```

### 端口监听
```bash
$ sudo ss -tlnp | grep :3000
LISTEN 0.0.0.0:3000  ✅ (docker-proxy)
LISTEN [::]:3000     ✅ (docker-proxy)
```

### 服务访问
- **本地**: `http://localhost:3000` ✅
- **外部**: `http://54.65.127.141:3000` ✅
- **生产**: `https://biznexus.seisei.tokyo` ✅

---

## 🔑 关键技术要点

### 1. Docker 容器访问宿主机服务

**问题**: 容器内 `localhost` 指向容器本身，不是宿主机

**解决方案**:
- **Linux**: 使用 `host.docker.internal` (Docker 20.10+)
- **或**: 使用宿主机内网 IP (`10.0.1.184`)
- **或**: 使用 `network_mode: "host"`（不推荐）

### 2. Docker Compose 端口映射

```yaml
ports:
  - "${APP_PORT:-9527}:9527"
  # 格式: "宿主机端口:容器端口"
  # ${APP_PORT:-9527} 表示从环境变量读取，默认 9527
```

### 3. 环境变量优先级

1. Shell 环境变量
2. `.env` 文件
3. `docker-compose.yml` 中的 `environment`
4. `docker-compose.yml` 中的默认值

---

## 🎯 故障排查步骤

### 检查容器状态
```bash
sudo docker ps | grep seisei-erp
sudo docker logs seisei-erp-app --tail 50
```

### 检查端口监听
```bash
sudo ss -tlnp | grep :3000
sudo netstat -tlnp | grep :3000
```

### 测试服务访问
```bash
# 容器内测试
sudo docker exec seisei-erp-app curl localhost:9527

# 宿主机测试
curl localhost:3000

# 外部测试
curl http://54.65.127.141:3000
```

### 检查 Odoo 连接
```bash
# 从容器内测试
sudo docker exec seisei-erp-app curl http://host.docker.internal:8069

# 或测试宿主机 Odoo
curl http://localhost:8069
```

---

## 📱 多端访问确认

| 平台 | 访问地址 | 状态 |
|------|---------|------|
| **Desktop Web** | https://biznexus.seisei.tokyo | ✅ 正常 |
| **iPad** | Capacitor App | ✅ 正常 |
| **iPhone** | Capacitor App | ✅ 正常 |
| **Direct IP** | http://54.65.127.141:3000 | ✅ 正常 |

---

## 🎊 总结

### 修复内容
1. ✅ 修复 Odoo 连接（使用 `host.docker.internal`）
2. ✅ 修复端口映射（3000:9527）
3. ✅ 修复数据库连接
4. ✅ 确保服务正常运行

### 服务状态
- ✅ 容器运行正常
- ✅ 端口 3000 监听
- ✅ Odoo 连接成功
- ✅ 数据库连接正常

### 访问地址
- **生产环境**: https://biznexus.seisei.tokyo
- **直接访问**: http://54.65.127.141:3000

---

**现在可以正常访问服务了！** 🎉
