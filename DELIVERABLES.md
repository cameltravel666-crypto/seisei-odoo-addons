# 工业级部署系统 - 交付物清单

## 📋 完整交付物列表

### A) 核心脚本 (scripts/)

| 文件 | 状态 | 功能 | 关键特性 |
|------|------|------|---------|
| `lib.sh` | ✅ 完成 | 通用函数库 | Stack映射、Promotion机制、日志、Docker辅助 |
| `preflight.sh` | ✅ 完成 | 门禁检查 | 网络、Compose、禁止build、禁止latest、磁盘 |
| `backup.sh` | ✅ 完成 | 备份脚本 | Config文件、数据库dump、自动清理 |
| `smoke.sh` | ✅ 完成 | 冒烟测试 | 容器状态、健康检查、域名访问、OCR健康 |
| `rollback.sh` | ✅ 完成 | 回滚脚本 | 从history读取、自动回滚、验证成功 |
| `deploy.sh` | ✅ 完成 | 统一部署入口 | Preflight→Backup→Pull→Deploy→Smoke→History |
| `sync_to_srv.sh` | ✅ 完成 | 目录同步 | 源码→/srv/stacks、保留.env |

### B) 文档 (docs/)

| 文件 | 状态 | 内容 |
|------|------|------|
| `DEPLOYMENT.md` | ✅ 完成 | 完整部署指南：正常流程、紧急修复、回滚、常用命令 |
| `WWW_GHCR_WORKFLOW.md` | ✅ 完成 | WWW镜像发布工作流、GitHub Actions配置 |
| `IMPLEMENTATION_PLAN.md` | ✅ 完成 | 详细实现计划、验证步骤、风险缓解 |

### C) 验证文档

| 文件 | 状态 | 内容 |
|------|------|------|
| `VERIFICATION_COMMANDS.md` | ✅ 完成 | 服务器端完整验证步骤（10步） |
| `DELIVERABLES.md` | ✅ 完成 | 本文档 |

## 🎯 核心功能实现状态

### 1. 生产关键服务禁止:latest ✅

**实现**：
- `preflight.sh` 自动检查compose文件
- Production环境检测到`:latest`会拒绝部署
- Staging环境允许`:latest`

**验证命令**：
```bash
/opt/seisei-odoo-addons/scripts/preflight.sh odoo18-prod prod
```

### 2. Promotion机制 (staging→production) ✅

**实现**：
- Staging成功后写入 `/srv/releases/verified/<stack>.txt`
- Production部署时强制校验version == verified
- 支持`--force`跳过（会标记在history）

**验证命令**：
```bash
# Staging部署
/opt/seisei-odoo-addons/scripts/deploy.sh odoo18-staging staging sha-abc123
# 检查verified
cat /srv/releases/verified/odoo18-staging.txt
# Production部署
/opt/seisei-odoo-addons/scripts/deploy.sh odoo18-prod prod sha-abc123
```

### 3. 部署前自动备份 ✅

**实现**：
- `deploy.sh`会自动调用`backup.sh`
- 备份：docker-compose.yml, .env, config/, database
- 存储在 `/srv/backups/<stack>/<timestamp>/`
- 保留最近10个备份

**验证命令**：
```bash
/opt/seisei-odoo-addons/scripts/backup.sh odoo18-prod prod
ls -lh /srv/backups/odoo18-prod/
```

### 4. 部署失败自动回滚 ✅

**实现**：
- Smoke测试失败自动触发rollback
- 从deploy-history读取上一版本
- 回滚后再次运行smoke验证

**验证命令**：
```bash
# 故意部署错误版本会自动回滚
/opt/seisei-odoo-addons/scripts/deploy.sh odoo18-prod prod sha-wrong999 --force
```

### 5. 生产只pull镜像，禁止build ✅

**实现**：
- `preflight.sh`检查compose文件无`build:`指令
- 所有compose文件只用`image:`
- 违反会阻止部署

**验证命令**：
```bash
# Preflight会检测build指令
grep "build:" /srv/stacks/*/docker-compose.yml
# 应该无输出
```

### 6. 使用可复现制品 (GHCR sha tag) ✅

**实现**：
- 所有关键服务使用`ghcr.io/owner/repo:sha-xxxxx`
- Stack映射定义版本变量名
- WWW镜像修复指南完整

**当前状态**：
- ✅ odoo18-prod: `sha-19b9b98`
- ✅ ocr: `sha-b73ee89`
- ✅ langbot: digest pin
- ⏳ www: 需要GitHub Actions（workflow已提供）

### 7. 统一发布入口命令 ✅

**实现**：
```bash
# 统一格式
/opt/seisei-odoo-addons/scripts/deploy.sh <stack> <env> <version> [--force]

# 示例
./deploy.sh odoo18-staging staging sha-abc123
./deploy.sh odoo18-prod prod sha-abc123
./deploy.sh odoo18-prod prod sha-xyz --force
```

### 8. 可验证的smoke test ✅

**实现**：
- 容器状态检查
- 健康检查
- 关键域名访问（seisei.tokyo, demo.nagashiro.top, biznexus.seisei.tokyo）
- OCR health endpoint

**验证命令**：
```bash
/opt/seisei-odoo-addons/scripts/smoke.sh odoo18-prod prod sha-19b9b98
```

### 9. 部署历史审计 ✅

**实现**：
- 所有操作写入 `/srv/deploy-history.log`
- 格式：timestamp | stack | env | action | version | status | notes
- FORCED标记
- 可查询、可追溯

**查看历史**：
```bash
cat /srv/deploy-history.log
grep "odoo18-prod" /srv/deploy-history.log | tail -10
grep "FORCED" /srv/deploy-history.log
```

## 📂 目录结构

### 运行时目录

```
/srv/
├── stacks/                    # 运行目录（统一）
│   ├── edge-traefik/
│   ├── langbot/
│   ├── ocr/
│   ├── odoo18-prod/
│   ├── odoo18-staging/
│   └── web-seisei/
├── backups/                   # 备份目录
│   ├── odoo18-prod/
│   │   ├── 20260130_100000/
│   │   ├── 20260130_140000/
│   │   └── ...
│   └── ...
├── releases/                  # Promotion追踪
│   └── verified/
│       ├── odoo18-prod.txt    # 内容：sha-19b9b98
│       ├── odoo18-staging.txt
│       └── ...
└── deploy-history.log         # 部署历史
```

### 源码目录

```
/opt/seisei-odoo-addons/
├── scripts/                   # 所有部署脚本
│   ├── lib.sh
│   ├── preflight.sh
│   ├── backup.sh
│   ├── smoke.sh
│   ├── rollback.sh
│   ├── deploy.sh
│   └── sync_to_srv.sh
├── docs/                      # 文档
│   ├── DEPLOYMENT.md
│   ├── WWW_GHCR_WORKFLOW.md
│   └── IMPLEMENTATION_PLAN.md
├── infra/stacks/              # Stack源码
│   ├── odoo18-prod/
│   └── odoo18-staging/
└── VERIFICATION_COMMANDS.md
```

## 🚀 快速开始

### 在服务器上部署

```bash
# 1. SSH到服务器
ssh root@13.231.79.114

# 2. 拉取代码
cd /opt/seisei-odoo-addons
git pull origin main

# 3. 设置权限
chmod +x scripts/*.sh

# 4. 创建目录
mkdir -p /srv/stacks /srv/backups /srv/releases/verified
touch /srv/deploy-history.log

# 5. 同步stack
/opt/seisei-odoo-addons/scripts/sync_to_srv.sh odoo18-prod
/opt/seisei-odoo-addons/scripts/sync_to_srv.sh odoo18-staging
/opt/seisei-odoo-addons/scripts/sync_to_srv.sh web-seisei

# 6. 验证（参考VERIFICATION_COMMANDS.md）
/opt/seisei-odoo-addons/scripts/preflight.sh odoo18-prod prod

# 7. 测试部署到staging
CURRENT_SHA=$(cd /opt/seisei-odoo-addons && git log --oneline -1 | awk '{print "sha-"$1}')
/opt/seisei-odoo-addons/scripts/deploy.sh odoo18-staging staging $CURRENT_SHA

# 8. 部署到production
/opt/seisei-odoo-addons/scripts/deploy.sh odoo18-prod prod $CURRENT_SHA
```

## 📊 质量保证

### 脚本质量

- ✅ 所有脚本使用 `set -euo pipefail`
- ✅ 清晰的错误消息
- ✅ 禁止silent failure
- ✅ 提供`--help`选项
- ✅ 幂等性保证
- ✅ 路径相对于repo根目录

### 测试覆盖

- ✅ Preflight检查覆盖所有关键项
- ✅ Smoke测试覆盖容器、健康、域名、OCR
- ✅ Backup测试config和数据库
- ✅ Deploy集成所有步骤
- ✅ Rollback可从history恢复

## ⚠️ 已知限制

### 1. WWW镜像修复需要手动操作

**问题**：seisei/www仓库需要添加GitHub Actions workflow

**解决方案**：已提供完整workflow文件（见`docs/WWW_GHCR_WORKFLOW.md`）

**操作**：需要在seisei/www仓库添加`.github/workflows/docker-build.yml`

### 2. 部分stack可能需要调整

**问题**：langbot使用digest pin，版本变量名可能不同

**解决方案**：已在`lib.sh`中定义映射，deploy.sh会根据stack选择正确的变量名

## 📝 待完成事项

### 短期（本周）

- [ ] 在seisei/www仓库添加GitHub Actions
- [ ] 测试web-seisei的完整部署流程
- [ ] 验证langbot的部署流程

### 中期（下周）

- [ ] 添加Slack/邮件通知
- [ ] 创建部署dashboard
- [ ] 自动化定期备份cron job

### 长期（下月）

- [ ] 多区域部署支持
- [ ] 蓝绿部署
- [ ] Canary发布

## 📞 支持

如有问题，请查看：
1. `VERIFICATION_COMMANDS.md` - 完整验证步骤
2. `docs/DEPLOYMENT.md` - 部署指南
3. `docs/WWW_GHCR_WORKFLOW.md` - WWW镜像修复

## 📅 更新日志

- **2026-01-30**: 完成工业级部署系统v1.0
  - 核心脚本完成（lib, preflight, backup, smoke, rollback, deploy, sync）
  - Promotion机制实现
  - 完整文档
  - 验证命令清单

---

**Status**: ✅ Ready for Production

**Last Updated**: 2026-01-30

**Maintainer**: DevOps Team
