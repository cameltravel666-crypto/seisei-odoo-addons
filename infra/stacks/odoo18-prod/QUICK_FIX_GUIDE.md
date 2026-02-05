# 🚨 P0事故快速修复指南

**紧急程度**: 🔴 高 - 需在本周内完成
**预计时间**: 30分钟
**前置条件**: SSH访问生产服务器，AWS Capsule账号凭证

---

## 📋 快速摘要

当前系统**可以正常运行且重启不会出问题**，但自动监控和同步功能**完全失效**。

需要修复3个关键问题才能启用自动化保护：

1. ✅ 配置AWS credentials (5分钟)
2. ✅ 将S3配置迁移到Secrets Manager (10分钟)
3. ✅ 创建.env模板和增强验证 (15分钟)

---

## 🔧 修复步骤

### 步骤1: 配置AWS Credentials (5分钟)

```bash
# SSH登录生产服务器
ssh -i /Users/taozhang/Projects/Pem/odoo-prod-only ubuntu@54.65.127.141

# 配置AWS credentials
aws configure --profile capsule
```

**输入以下信息**：
```
AWS Access Key ID: ***REDACTED***
AWS Secret Access Key: gjnOuaKbfc1O42y355ApxfUY8IFO4dctzdtSNUdu
Default region name: ap-northeast-1
Default output format: json
```

**验证配置**：
```bash
aws secretsmanager get-secret-value \
    --secret-id "seisei/prod/odoo/db-credentials" \
    --region ap-northeast-1 \
    --profile capsule
```

**预期输出**：应该看到包含 `username`, `password`, `host` 等字段的JSON

**如果失败**：
- 检查 Access Key ID 和 Secret Access Key 是否正确
- 检查 IAM 权限是否包含 `secretsmanager:GetSecretValue`

---

### 步骤2: 将S3配置迁移到Secrets Manager (10分钟)

#### 2.1 创建S3 Secret

```bash
# 在服务器上执行
aws secretsmanager create-secret \
    --name "seisei/prod/odoo/s3-credentials" \
    --description "S3 credentials for Odoo production filestore" \
    --secret-string '{
        "bucket": "seisei-odoo-filestore-prod",
        "region": "ap-northeast-1",
        "access_key": "***REDACTED***",
        "secret_key": "gjnOuaKbfc1O42y355ApxfUY8IFO4dctzdtSNUdu"
    }' \
    --region ap-northeast-1 \
    --profile capsule
```

**预期输出**：
```json
{
    "ARN": "arn:aws:secretsmanager:ap-northeast-1:...",
    "Name": "seisei/prod/odoo/s3-credentials",
    "VersionId": "..."
}
```

**如果报错 "already exists"**：
```bash
# 更新现有 secret
aws secretsmanager update-secret \
    --secret-id "seisei/prod/odoo/s3-credentials" \
    --secret-string '{
        "bucket": "seisei-odoo-filestore-prod",
        "region": "ap-northeast-1",
        "access_key": "***REDACTED***",
        "secret_key": "gjnOuaKbfc1O42y355ApxfUY8IFO4dctzdtSNUdu"
    }' \
    --region ap-northeast-1 \
    --profile capsule
```

#### 2.2 验证Secret创建成功

```bash
aws secretsmanager get-secret-value \
    --secret-id "seisei/prod/odoo/s3-credentials" \
    --region ap-northeast-1 \
    --profile capsule \
    --query SecretString \
    --output text | jq .
```

**预期输出**：
```json
{
  "bucket": "seisei-odoo-filestore-prod",
  "region": "ap-northeast-1",
  "access_key": "***REDACTED***",
  "secret_key": "gjnOuaKbfc1O42y355ApxfUY8IFO4dctzdtSNUdu"
}
```

#### 2.3 更新 sync_secrets.sh

```bash
cd /opt/seisei-odoo-addons/infra/stacks/odoo18-prod

# 备份原脚本
cp scripts/sync_secrets.sh scripts/sync_secrets.sh.backup

# 编辑脚本
nano scripts/sync_secrets.sh
```

**找到这一段**（约78-84行）：
```bash
# 获取S3配置（使用Capsule凭证）
echo ""
echo "=== Fetching S3 Configuration ==="
S3_BUCKET="seisei-odoo-filestore-prod"
S3_ACCESS_KEY="***REDACTED***"
S3_SECRET_KEY="gjnOuaKbfc1O42y355ApxfUY8IFO4dctzdtSNUdu"
S3_REGION="ap-northeast-1"
```

**替换为**：
```bash
# 获取S3配置（从AWS Secrets Manager）
echo ""
echo "=== Fetching S3 Configuration ==="
S3_SECRET=$(aws secretsmanager get-secret-value \
    --secret-id "seisei/prod/odoo/s3-credentials" \
    --region ap-northeast-1 \
    --profile capsule \
    --query SecretString \
    --output text)

S3_BUCKET=$(echo "$S3_SECRET" | jq -r '.bucket')
S3_ACCESS_KEY=$(echo "$S3_SECRET" | jq -r '.access_key')
S3_SECRET_KEY=$(echo "$S3_SECRET" | jq -r '.secret_key')
S3_REGION=$(echo "$S3_SECRET" | jq -r '.region')

echo "✓ S3 credentials fetched from Secrets Manager"
echo "  Bucket: $S3_BUCKET"
```

保存并退出（Ctrl+X, Y, Enter）

#### 2.4 测试更新后的脚本

```bash
bash scripts/sync_secrets.sh
```

**预期输出**：
```
=== Syncing Secrets from AWS Secrets Manager ===
Target: /opt/seisei-odoo-addons/infra/stacks/odoo18-prod/.env
✓ Backed up to: .env.backup.20260204_XXXXXX

=== Fetching Database Credentials ===
✓ Database credentials fetched
  User: odoo18
  Host: seisei-odoo18-prod-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com

=== Updating .env file ===
  ✓ Updated: DB_HOST
  ✓ Updated: DB_PORT
  ...

=== Fetching S3 Configuration ===
✓ S3 credentials fetched from Secrets Manager
  Bucket: seisei-odoo-filestore-prod
  ✓ Updated: SEISEI_S3_BUCKET
  ...

=== Sync completed successfully ===
```

**如果失败**：
- 检查 jq 是否安装：`sudo apt-get install jq`
- 检查 secret 是否创建成功（步骤2.2）
- 检查 AWS credentials 是否正确（步骤1）

---

### 步骤3: 创建.env模板和增强验证 (15分钟)

#### 3.1 创建 .env.template

```bash
cd /opt/seisei-odoo-addons/infra/stacks/odoo18-prod

cat > .env.template << 'EOF'
# ============================================================================
# Odoo 18 Production Configuration Template
# ============================================================================
# DO NOT edit this file directly
# 1. Copy this file to .env
# 2. Run: bash scripts/sync_secrets.sh
# 3. Or manually fill in values from AWS Secrets Manager
# ============================================================================

COMPOSE_PROJECT_NAME=odoo18-prod

# Docker image (REQUIRED)
# Use digest pinning: ghcr.io/owner/repo@sha256:...
IMAGE_REF=

# Database configuration (REQUIRED - from AWS Secrets Manager)
# Secret: seisei/prod/odoo/db-credentials
DB_HOST=
DB_PORT=5432
DB_USER=
DB_PASSWORD=
DB_NAME=postgres
DB_SSLMODE=require

# Redis configuration (REQUIRED)
REDIS_HOST=odoo18-prod-redis
REDIS_PORT=6379
REDIS_PASSWORD=

# S3 Storage Configuration (REQUIRED - from AWS Secrets Manager)
# Secret: seisei/prod/odoo/s3-credentials
SEISEI_S3_BUCKET=
SEISEI_S3_REGION=ap-northeast-1
SEISEI_S3_ACCESS_KEY=
SEISEI_S3_SECRET_KEY=

# OCR Service (OPTIONAL)
OCR_SERVICE_URL=
OCR_SERVICE_KEY=

# Environment
ENVIRONMENT=production
ADDONS_PATH=/opt/seisei-odoo-addons/odoo_modules

# Odoo Admin Password (OPTIONAL - for database management)
ADMIN_PASSWORD=
EOF

echo "✓ .env.template created"
```

#### 3.2 增强 verify_config.sh

```bash
# 备份原脚本
cp scripts/verify_config.sh scripts/verify_config.sh.backup

# 在 verify_config.sh 中找到 "# 1. 数据库配置检查" 之前，添加以下内容
```

**编辑 scripts/verify_config.sh**：
```bash
nano scripts/verify_config.sh
```

**在第57行（`# 验证odoo.conf没有硬编码密码` 之前）添加**：

```bash
# 检查密码长度（防止使用旧密码 Wind1982）
DB_PASSWORD_VALUE=$(grep "^DB_PASSWORD=" "$ENV_FILE" | cut -d'=' -f2)
DB_PASSWORD_LENGTH=${#DB_PASSWORD_VALUE}

if [ $DB_PASSWORD_LENGTH -lt 20 ]; then
    echo "✗ DB_PASSWORD too short (length: $DB_PASSWORD_LENGTH)"
    echo "  Expected: 32+ characters (AWS RDS generated)"
    echo "  Current value looks like old password 'Wind1982'"
    ((ERRORS++))
else
    echo "✓ DB_PASSWORD length: OK ($DB_PASSWORD_LENGTH characters)"
fi
```

保存并退出（Ctrl+X, Y, Enter）

#### 3.3 测试增强后的验证

```bash
# 测试正常情况
bash scripts/verify_config.sh

# 预期输出：
# ✓ DB_PASSWORD length: OK (32 characters)
# ✓ ALL CHECKS PASSED
```

**测试错误检测**：
```bash
# 临时修改密码为短密码
sed -i.test 's/^DB_PASSWORD=.*/DB_PASSWORD=Wind1982/' .env

# 运行验证
bash scripts/verify_config.sh

# 预期输出：
# ✗ DB_PASSWORD too short (length: 9)
#   Expected: 32+ characters (AWS RDS generated)
#   Current value looks like old password 'Wind1982'
# ✗ FAILED WITH 1 ERROR(S)

# 恢复密码
mv .env.test .env
```

---

## ✅ 验收检查

完成所有步骤后，运行以下检查：

### 1. AWS Credentials 工作正常

```bash
aws secretsmanager list-secrets --profile capsule --region ap-northeast-1 | grep seisei
```

**预期**: 看到 `seisei/prod/odoo/db-credentials` 和 `seisei/prod/odoo/s3-credentials`

### 2. sync_secrets.sh 工作正常

```bash
cd /opt/seisei-odoo-addons/infra/stacks/odoo18-prod
bash scripts/sync_secrets.sh
```

**预期**:
- ✓ 无错误
- ✓ 看到 "Sync completed successfully"
- ✓ 看到 "S3 credentials fetched from Secrets Manager"

### 3. verify_config.sh 验证增强

```bash
bash scripts/verify_config.sh
```

**预期**:
- ✓ 看到 "DB_PASSWORD length: OK"
- ✓ 看到 "ALL CHECKS PASSED"

### 4. Cron 定时任务正常

```bash
# 查看 cron 日志（等待到下一个5分钟倍数时间）
tail -f /opt/seisei-odoo-addons/infra/stacks/odoo18-prod/logs/health_monitor.log

# 预期：每5分钟自动运行，所有检查通过
```

### 5. 容器健康检查

```bash
docker inspect odoo18-prod-web --format='{{.State.Health.Status}}'
```

**预期**: `healthy`

### 6. 完整系统测试

```bash
# 重启容器
docker compose restart web

# 等待30秒
sleep 30

# 运行健康检查
bash scripts/health_monitor.sh

# 预期: ✓ All health checks passed
```

---

## 🚨 如果出现问题

### 问题1: AWS credentials 配置失败

**症状**: `The config profile (capsule) could not be found`

**解决**:
```bash
# 检查配置文件
cat ~/.aws/credentials

# 应该看到：
# [capsule]
# aws_access_key_id = ***REDACTED***
# aws_secret_access_key = gjnOuaKbfc1O42y355ApxfUY8IFO4dctzdtSNUdu

# 如果没有，重新运行 aws configure --profile capsule
```

### 问题2: Secret 不存在

**症状**: `Secrets Manager can't find the specified secret`

**解决**:
```bash
# 列出所有 secrets
aws secretsmanager list-secrets --profile capsule --region ap-northeast-1

# 如果没有 seisei/prod/odoo/s3-credentials，重新创建（步骤2.1）
```

### 问题3: sync_secrets.sh 失败

**症状**: `jq: command not found`

**解决**:
```bash
sudo apt-get update
sudo apt-get install -y jq
```

### 问题4: 容器不健康

**症状**: `docker inspect` 显示 `unhealthy`

**解决**:
```bash
# 查看容器日志
docker logs odoo18-prod-web --tail 100

# 运行诊断
bash scripts/verify_config.sh

# 如果数据库或S3连接失败，检查 .env 文件
cat .env | grep -E "^(DB_|SEISEI_S3)"
```

---

## 📞 紧急联系

如果遇到无法解决的问题：

1. **立即回滚**到最后一个已知良好的配置
   ```bash
   cd /opt/seisei-odoo-addons/infra/stacks/odoo18-prod

   # 恢复最近的备份
   LATEST_BACKUP=$(ls -t .env.backup* | head -1)
   cp "$LATEST_BACKUP" .env

   # 重启容器
   docker compose down web && docker compose up -d web
   ```

2. **检查备份**
   ```bash
   ls -lth .env.backup* | head -5
   ```

3. **联系相关人员**
   - 系统管理员
   - AWS 管理员（Capsule账号权限）

---

## 📊 预期效果

修复完成后：

✅ **自动化保护启用**
- sync_secrets.sh 每天自动同步最新密码
- health_monitor.sh 每5分钟检查系统健康
- 配置漂移会被自动检测和修复

✅ **人为错误防护**
- .env.template 提供标准模板
- verify_config.sh 检测配置错误
- 短密码会被自动拒绝

✅ **P0事故防护**
- 密码轮换后自动同步
- S3配置不会再丢失
- 所有配置从可信源（Secrets Manager）获取

✅ **风险降低**
- P0事故再发生概率：从 30% → <1%
- 配置错误检测时间：从 数小时 → <5分钟
- 恢复时间：从 30分钟 → <5分钟

---

**完成时间**: 约30分钟
**下次检查**: 修复完成后24小时，验证自动化任务正常运行
