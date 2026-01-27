# Odoo 18 Production - Stability & Operations Guide

## Overview

This document covers the deployment, rollback, and disaster recovery procedures for the Odoo 18 production environment.

**Architecture:**
- Immutable Docker image built via CI
- Image registry: `ghcr.io/<owner>/seisei-odoo18:sha-<commit>`
- Addons and config baked into image
- Only data volume mounted for persistence

## Deployment

### Automatic Deployment (Recommended)

Deployments are triggered automatically when changes are pushed to `main` branch affecting:
- `odoo_modules/**`
- `infra/stacks/odoo18-prod/**`
- `.github/workflows/odoo18-prod.yml`

The GitHub Actions workflow will:
1. Build the immutable image
2. Push to GHCR with `sha-<commit>` tag
3. SSH to production server
4. Run deployment script with operator info

### Manual Deployment

```bash
# SSH to production server
ssh deploy@<PROD_HOST>

# Deploy specific version
/usr/local/bin/deploy_odoo18.sh sha-abc1234 your-github-username

# Or use generic deploy script
/srv/scripts/deploy.sh odoo18-prod sha-abc1234 prod your-username
```

### Post-Deployment Verification

1. **Health Check (8069)**
   ```bash
   curl -f https://demo.erp.seisei.tokyo/web/health
   ```

2. **Login Page**
   ```bash
   curl -I https://demo.erp.seisei.tokyo/web/login
   ```

3. **Longpolling/WebSocket (8072)**
   ```bash
   curl -I https://demo.erp.seisei.tokyo/longpolling/poll
   ```

4. **Container Status**
   ```bash
   docker compose -f /srv/stacks/odoo18-prod/docker-compose.yml ps
   ```

5. **Verify Addons in Container**
   ```bash
   docker exec seisei-project-web ls /mnt/extra-addons/
   docker exec seisei-project-web cat /mnt/extra-addons/seisei_entitlements/__manifest__.py
   ```

## Rollback Procedures

### Level 1: Image Tag Rollback (Quick)

For issues with new code that don't affect data:

```bash
# Get last known good version
cat /srv/deployments/last_good_sha/odoo18-prod

# Deploy previous version
/usr/local/bin/deploy_odoo18.sh <previous-tag> manual-rollback

# Or edit .env and redeploy
cd /srv/stacks/odoo18-prod
sed -i 's/ODOO18_IMAGE_TAG=.*/ODOO18_IMAGE_TAG=<previous-tag>/' .env
docker compose pull web
docker compose up -d
```

### Level 2: Disaster Recovery (Database + Filestore)

For critical issues affecting data integrity:

```bash
# 1. Stop services
cd /srv/stacks/odoo18-prod
docker compose down

# 2. Locate backups
ls -la /srv/backups/odoo18-prod/

# 3. Restore PostgreSQL
docker volume rm odoo18-prod-db  # DANGER: Destroys current data
docker volume create odoo18-prod-db
# Restore from backup (method depends on backup format)
pg_restore -h localhost -U odoo -d postgres /srv/backups/odoo18-prod/<backup>.dump

# 4. Restore Filestore
docker volume rm odoo18-prod-data
docker volume create odoo18-prod-data
tar -xzf /srv/backups/odoo18-prod/filestore-<date>.tar.gz -C /var/lib/docker/volumes/odoo18-prod-data/_data/

# 5. Restart with last good image
/usr/local/bin/deploy_odoo18.sh <last-good-tag> disaster-recovery
```

## Backup Schedule

### Recommended Cron Schedule

```bash
# /etc/cron.d/odoo18-backup

# Daily backup at 3 AM JST (18:00 UTC previous day)
0 18 * * * root /srv/scripts/backup-odoo18.sh daily >> /var/log/odoo18-backup.log 2>&1

# Weekly full backup Sunday 4 AM JST
0 19 * * 0 root /srv/scripts/backup-odoo18.sh weekly-full >> /var/log/odoo18-backup.log 2>&1

# Retain: 7 daily, 4 weekly
```

### Backup Failure Alert

Add to backup script:

```bash
if [ $? -ne 0 ]; then
    curl -X POST "$SLACK_WEBHOOK" -d '{"text":"ALERT: Odoo18 backup failed!"}'
fi
```

## Break-Glass Procedure

For emergency hot-fixes that can't wait for CI:

### Temporary Access

1. **Get emergency access**
   - Contact infrastructure admin
   - Document reason in Slack/issue tracker

2. **Make emergency fix**
   ```bash
   # SSH with elevated access
   ssh admin@<PROD_HOST>

   # Edit container directly (NOT recommended for permanent fix)
   docker exec -it seisei-project-web /bin/bash
   # Make minimal fix
   exit

   # Restart if needed
   docker restart seisei-project-web
   ```

3. **Post-emergency**
   - Create PR with the fix
   - Get review and merge
   - Verify CI deployment works
   - Document incident

### Never Do

- Push directly to main without PR
- Modify production without logging
- Skip backup before major changes
- Ignore failed smoke tests

## Deploy User Security

### Authorized Keys Setup

```bash
# /home/deploy/.ssh/authorized_keys
command="/usr/local/bin/deploy_odoo18.sh $SSH_ORIGINAL_COMMAND",no-port-forwarding,no-X11-forwarding,no-agent-forwarding ssh-rsa AAAA... deploy-key
```

### Sudoers (if needed)

```bash
# /etc/sudoers.d/deploy
deploy ALL=(root) NOPASSWD: /usr/bin/docker compose -f /srv/stacks/odoo18-prod/docker-compose.yml *
deploy ALL=(root) NOPASSWD: /usr/bin/docker-compose -f /srv/stacks/odoo18-prod/docker-compose.yml *
```

## Monitoring Alerts

Critical alerts that should page on-call:

| Alert | Condition | Action |
|-------|-----------|--------|
| Container Down | `seisei-project-web` not running | Check logs, restart |
| Health Check Fail | `/web/health` returns non-200 for 3min | Check Odoo logs |
| High Memory | Container memory > 3.5GB | May need restart |
| Disk Full | `/srv` > 85% | Clean old backups/logs |
| DB Connection | PostgreSQL unreachable | Check db container |

## Deployment History

Logs are stored at: `/srv/deployments/history.log`

Format: `timestamp | stack | version | env | status | operator`

```bash
# View recent deployments
tail -20 /srv/deployments/history.log

# Find deployments by operator
grep "github-username" /srv/deployments/history.log
```
