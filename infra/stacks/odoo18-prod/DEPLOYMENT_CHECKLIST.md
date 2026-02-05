# Odoo 18 Production Deployment Checklist

**目的**: 防止P0级生产事故，确保每次部署都经过完整验证

**执行时机**: 每次部署前、配置变更前、重大更新前

---

## ✅ Pre-Deployment Checklist

### 1. 配置同步 (必须)

```bash
cd /opt/seisei-odoo-addons/infra/stacks/odoo18-prod

# 从AWS Secrets Manager同步最新配置
bash scripts/sync_secrets.sh

# 验证配置完整性
bash scripts/verify_config.sh
```

**预期结果**: ✓ ALL CHECKS PASSED

**如果失败**: 不要继续部署，先修复错误

---

### 2. 配置文件检查 (必须)

#### 2.1 检查 .env 文件

```bash
# 验证必需变量
cat .env | grep -E "^(DB_|SEISEI_S3|IMAGE_REF)"
```

**必需变量清单**:
- [ ] DB_HOST
- [ ] DB_USER
- [ ] DB_PASSWORD
- [ ] DB_NAME
- [ ] DB_SSLMODE
- [ ] SEISEI_S3_BUCKET
- [ ] SEISEI_S3_ACCESS_KEY
- [ ] SEISEI_S3_SECRET_KEY
- [ ] IMAGE_REF

#### 2.2 检查 odoo.conf

```bash
# 确认没有硬编码密码
grep "^db_password" config/odoo.conf
```

**预期结果**: 无输出（或已注释）

**如果有输出**:
```bash
# 注释掉硬编码密码
sed -i 's/^db_password/#db_password/' config/odoo.conf
sed -i 's/^db_user/#db_user/' config/odoo.conf
sed -i 's/^db_host/#db_host/' config/odoo.conf
```

---

### 3. 备份当前配置 (必须)

```bash
# 创建部署前快照
DATE=$(date +%Y%m%d_%H%M%S)
cp .env .env.backup.$DATE
cp config/odoo.conf config/odoo.conf.backup.$DATE
docker compose config > docker-compose.resolved.$DATE.yml

echo "Backup created: $DATE"
```

**保留策略**: 至少保留最近7天的备份

---

### 4. 代码同步 (如适用)

```bash
# 拉取最新代码
cd /opt/seisei-odoo-addons
git fetch origin
git status

# 确认当前分支
git branch --show-current

# 如果需要更新
git pull origin main
```

---

### 5. 容器健康检查 (必须)

```bash
# 检查当前容器状态
docker compose ps

# 检查健康状态
docker inspect odoo18-prod-web --format='{{.State.Health.Status}}'
```

**预期结果**: `healthy`

---

## 🚀 Deployment Steps

### 6. 执行部署

```bash
cd /opt/seisei-odoo-addons/infra/stacks/odoo18-prod

# 方式1: 重启容器（配置更新）
docker compose down web
docker compose up -d web

# 方式2: 拉取新镜像（代码更新）
docker compose pull web
docker compose up -d web
```

### 7. 等待启动

```bash
# 等待容器启动
echo "Waiting for container to start..."
sleep 60

# 实时查看日志
docker compose logs -f web
```

**关键日志检查**:
- [ ] 无 "Database connection failure"
- [ ] 无 "S3 client not available"
- [ ] 看到 "odoo.service.server: HTTP service (werkzeug) running"

---

## ✅ Post-Deployment Validation

### 8. 配置验证 (必须)

```bash
# 运行完整验证
bash scripts/verify_config.sh
```

**预期结果**: ✓ ALL CHECKS PASSED

### 9. 功能测试 (必须)

```bash
# 测试数据库连接
docker exec odoo18-prod-web python3 -c "
import psycopg2, os
conn = psycopg2.connect(
    host=os.environ['HOST'],
    user=os.environ['USER'],
    password=os.environ['PASSWORD'],
    database=os.environ.get('DB_NAME', 'postgres'),
    sslmode='require'
)
print('✓ Database OK')
conn.close()
"

# 测试S3连接
docker exec odoo18-prod-web python3 -c "
import boto3, os
s3 = boto3.client('s3',
    region_name=os.environ.get('SEISEI_S3_REGION'),
    aws_access_key_id=os.environ['SEISEI_S3_ACCESS_KEY'],
    aws_secret_access_key=os.environ['SEISEI_S3_SECRET_KEY']
)
s3.head_bucket(Bucket=os.environ['SEISEI_S3_BUCKET'])
print('✓ S3 OK')
"

# 测试健康端点（通过Traefik）
curl -sf https://demo.nagashiro.top/web/health && echo "✓ Web OK"
```

### 10. 监控启动

```bash
# 手动运行一次健康监控
bash scripts/health_monitor.sh

# 查看监控日志
tail -f logs/health_monitor.log
```

### 11. 用户验证 (必须)

- [ ] 登录Odoo Web界面
- [ ] 检查关键功能（会计、库存、销售）
- [ ] 上传/查看附件（测试S3）
- [ ] 查看最近的交易记录

---

## 🔍 Rollback Procedure (如果出现问题)

### 快速回滚

```bash
cd /opt/seisei-odoo-addons/infra/stacks/odoo18-prod

# 1. 停止当前容器
docker compose down web

# 2. 恢复配置（使用最新备份）
LATEST_BACKUP=$(ls -t .env.backup* | head -1)
cp "$LATEST_BACKUP" .env
echo "Restored from: $LATEST_BACKUP"

# 3. 恢复odoo.conf（如果需要）
LATEST_CONF=$(ls -t config/odoo.conf.backup* | head -1)
cp "$LATEST_CONF" config/odoo.conf

# 4. 启动容器
docker compose up -d web

# 5. 验证
sleep 30
bash scripts/verify_config.sh
```

---

## 📊 Monitoring Setup

### 设置Cron任务（一次性配置）

```bash
# 编辑crontab
crontab -e

# 添加以下行
*/5 * * * * /opt/seisei-odoo-addons/infra/stacks/odoo18-prod/scripts/health_monitor.sh
0 2 * * * /opt/seisei-odoo-addons/infra/stacks/odoo18-prod/scripts/sync_secrets.sh

# 验证
crontab -l
```

**监控频率**:
- 健康检查: 每5分钟
- 配置同步: 每天凌晨2点

---

## 🚨 Alert Configuration

### Slack告警配置（推荐）

编辑 `scripts/health_monitor.sh`，添加Slack Webhook:

```bash
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

send_slack_alert() {
    local level=$1
    local message=$2
    curl -X POST "$SLACK_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{\"text\":\"[$level] Odoo Production: $message\"}"
}
```

---

## 📝 Change Log

记录每次部署的变更:

```bash
# 添加到变更日志
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Deployed: <描述变更内容>" >> CHANGELOG.txt
```

---

## 🔐 Security Reminders

- [ ] 永远不要在Git中提交 .env 文件
- [ ] 永远不要在 odoo.conf 中硬编码密码
- [ ] 定期轮换AWS访问密钥（每90天）
- [ ] 定期审查IAM权限
- [ ] 监控AWS Secrets Manager访问日志

---

## 📞 Emergency Contacts

**如果遇到P0事故**:

1. 立即回滚到上一个稳定版本
2. 运行 `bash scripts/verify_config.sh` 找出问题
3. 检查 `logs/alerts.log` 了解告警历史
4. 联系相关人员

**关键人员**:
- 系统管理员: [联系方式]
- 数据库管理员: [联系方式]
- 开发团队负责人: [联系方式]

---

**最后检查**: 在关闭这个检查清单之前，确认所有 ✓ 都已勾选！
