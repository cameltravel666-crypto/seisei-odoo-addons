# Seisei 运维指南

## 服务器信息

| 项目 | 值 |
|------|------|
| IP | 54.65.127.141 |
| 用户 | ubuntu |
| SSH 密钥 | ~/Projects/Pem/odoo-2025.pem |

## 目录结构

```
/srv/
├── stacks/                  # 服务栈
│   ├── edge-traefik/       # Traefik 反向代理
│   ├── erp-seisei/         # Next.js ERP
│   ├── web-seisei/         # 主站
│   ├── odoo18-test/        # Odoo 18 测试
│   ├── odoo18-prod/        # Odoo 18 生产
│   ├── langbot/            # LangBot
│   ├── ocr/                # OCR 服务
│   └── crm-api/            # CRM API
├── scripts/                # 运维脚本
├── backups/               # 本地备份
├── deployments/           # 部署记录
│   ├── history.log       # 部署历史
│   └── last_good_sha/    # 最后成功版本
└── config/
    └── secrets/           # 环境变量
```

## 常用命令

### 部署

```bash
# 部署到 stage
./srv/scripts/deploy.sh erp-seisei v1.0.0 stage

# 部署到 prod
./srv/scripts/deploy.sh erp-seisei v1.0.0 prod

# 部署所有
for stack in erp-seisei web-seisei odoo18-test; do
    ./srv/scripts/deploy.sh $stack latest stage
done
```

### 监控

```bash
# 冒烟测试
./srv/scripts/smoke-test.sh all

# 查看容器状态
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 查看日志
docker logs -f seisei-erp-app
docker logs -f traefik
```

### 备份

```bash
# Odoo 备份
./srv/scripts/backup-odoo18.sh odoo18-test manual-backup

# 查看备份
ls -la /srv/backups/odoo18-test/
```

### 回滚

```bash
# 查看历史
cat /srv/deployments/history.log | tail -20

# 回滚到上一版本
VERSION=$(cat /srv/deployments/last_good_sha/erp-seisei)
./srv/scripts/deploy.sh erp-seisei $VERSION prod
```

## 初始化服务器

```bash
# 创建目录
sudo mkdir -p /srv/{stacks,scripts,backups,deployments,config/secrets}
sudo chown -R ubuntu:ubuntu /srv

# 创建网络
docker network create edge

# 复制配置（从本地）
rsync -avz infra/stacks/ ubuntu@54.65.127.141:/srv/stacks/
rsync -avz infra/scripts/ ubuntu@54.65.127.141:/srv/scripts/

# 设置脚本权限
chmod +x /srv/scripts/*.sh
```

## NPM 迁移

```bash
# 1. 准备
./srv/scripts/migrate-npm-to-traefik.sh prepare

# 2. 测试
./srv/scripts/migrate-npm-to-traefik.sh test

# 3. 切换
./srv/scripts/migrate-npm-to-traefik.sh switch

# 如需回滚
./srv/scripts/migrate-npm-to-traefik.sh rollback
```

## 故障排除

### Traefik 问题

```bash
# 检查日志
docker logs traefik -f

# 检查证书
docker exec traefik cat /etc/traefik/acme/acme.json | jq '.cloudflare.Certificates'

# 检查路由
curl -H "Host: erp.seisei.tokyo" http://localhost
```

### Odoo 问题

```bash
# 检查日志
docker logs seisei-test-web -f

# 进入容器
docker exec -it seisei-test-web bash

# 数据库连接
docker exec -it seisei-test-db psql -U odoo
```

### 网络问题

```bash
# 检查网络
docker network ls
docker network inspect edge

# 检查 DNS
nslookup erp.seisei.tokyo
```

## 联系方式

紧急问题请联系系统管理员。
