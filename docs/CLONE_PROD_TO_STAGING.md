# Clone Production to Staging - Runbook

## Overview

This runbook guides you through cloning the production Odoo 18 environment to staging, ensuring complete alignment of code, configuration, and data while maintaining production safety and providing rollback capability.

## Prerequisites Checklist

Before executing the clone script, verify:

- [ ] SSH access to deployment server (54.65.127.141)
- [ ] SSH key available at `/Users/taozhang/Projects/Pem/odoo-2025.pem`
- [ ] AWS CLI configured with access to both S3 buckets
- [ ] Docker and docker compose available on server
- [ ] Sufficient disk space on server (at least 5GB free in `/srv` and `/tmp`)
- [ ] No active development/testing on staging environment
- [ ] Production database password known: `Wind1982`
- [ ] Staging can be taken offline during clone (15-30 minutes)

## Architecture Overview

**Production Environment:**
- Host: 54.65.127.141
- Stack: `/srv/stacks/odoo18-prod`
- Database: `seisei-odoo18-prod-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com`
- S3 Bucket: `biznexus-prod-files`
- Container: `odoo18-prod-web`
- URL: https://demo.nagashiro.top

**Staging Environment:**
- Host: 54.65.127.141 (same server)
- Stack: `/srv/stacks/odoo18-staging`
- Database: `seisei-odoo18-staging-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com`
- S3 Bucket: `seisei-staging`
- Container: `odoo18-staging-web`
- URL: https://staging.odoo.seisei.tokyo

## One-Command Execution

```bash
cd /Users/taozhang/Projects/seisei-odoo-addons
chmod +x scripts/clone_prod_to_staging.sh
./scripts/clone_prod_to_staging.sh
```

The script will:
1. Prompt for confirmation before proceeding
2. Execute all 6 steps automatically
3. Provide detailed progress output
4. Verify alignment at the end

**Expected Duration:** 15-30 minutes (depending on database size and S3 sync)

## Verification Steps

After the script completes, verify the clone succeeded:

### 1. Check Image Alignment

```bash
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 '
  echo "Production:"; sudo docker inspect odoo18-prod-web --format "{{.Image}}"
  echo "Staging:"; sudo docker inspect odoo18-staging-web --format "{{.Image}}"
'
```

**Expected:** Both should show identical image digests (sha256:...)

### 2. Check Container Health

```bash
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 \
  'sudo docker ps --filter "name=odoo18-staging" --format "table {{.Names}}\t{{.Status}}"'
```

**Expected:** `odoo18-staging-web` should show "Up X minutes (healthy)"

### 3. Test Health Endpoint

```bash
curl -I https://staging.odoo.seisei.tokyo/web/health
```

**Expected:** HTTP 200 response

### 4. Test Web UI

```bash
open https://staging.odoo.seisei.tokyo
```

**Expected:**
- Login page loads
- Can log in with production credentials
- Product list shows same products as production
- Images display correctly

### 5. Verify Database Alignment

```bash
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 'sudo docker exec odoo18-staging-web bash -c "PGPASSWORD=Wind1982 psql -h seisei-odoo18-staging-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com -U odoo18 -d ten_testodoo -c \"SELECT COUNT(*) FROM product_template;\""'
```

**Expected:** Count should match production

## Rollback Steps

If the clone fails or staging behaves incorrectly, follow these steps to rollback:

### 1. Identify Backup Location

Backups are stored in `/srv/backups/odoo18-staging/YYYYMMDD_HHMMSS/`

```bash
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 \
  'ls -lt /srv/backups/odoo18-staging/ | head -5'
```

Note the most recent timestamp (e.g., `20260203_123456`)

### 2. Stop Staging Containers

```bash
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 \
  'cd /srv/stacks/odoo18-staging && sudo docker compose down'
```

### 3. Restore Configuration Files

```bash
BACKUP_TIMESTAMP="20260203_123456"  # Replace with actual timestamp

ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 "
  sudo cp /srv/backups/odoo18-staging/${BACKUP_TIMESTAMP}/docker-compose.yml /srv/stacks/odoo18-staging/
  sudo cp /srv/backups/odoo18-staging/${BACKUP_TIMESTAMP}/.env /srv/stacks/odoo18-staging/
  sudo cp -r /srv/backups/odoo18-staging/${BACKUP_TIMESTAMP}/config /srv/stacks/odoo18-staging/ 2>/dev/null || true
"
```

### 4. Restore Database

```bash
BACKUP_TIMESTAMP="20260203_123456"  # Replace with actual timestamp

ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 "
  cd /srv/stacks/odoo18-staging
  sudo docker compose up -d
  sleep 10

  # Drop and recreate database
  sudo docker exec odoo18-staging-web bash -c \"PGPASSWORD=Wind1982 psql -h seisei-odoo18-staging-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com -U odoo18 -d postgres -c 'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=\\\"ten_testodoo\\\" AND pid <> pg_backend_pid();'\" 2>/dev/null || true

  sudo docker exec odoo18-staging-web bash -c \"PGPASSWORD=Wind1982 psql -h seisei-odoo18-staging-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com -U odoo18 -d postgres -c 'DROP DATABASE IF EXISTS ten_testodoo;'\"

  sudo docker exec odoo18-staging-web bash -c \"PGPASSWORD=Wind1982 psql -h seisei-odoo18-staging-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com -U odoo18 -d postgres -c 'CREATE DATABASE ten_testodoo OWNER odoo18;'\"

  # Restore backup
  cat /srv/backups/odoo18-staging/${BACKUP_TIMESTAMP}/staging_backup_*.sql | sudo docker exec -i odoo18-staging-web bash -c \"PGPASSWORD=Wind1982 psql -h seisei-odoo18-staging-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com -U odoo18 -d ten_testodoo\"
"
```

### 5. Restore Volumes

```bash
BACKUP_TIMESTAMP="20260203_123456"  # Replace with actual timestamp

ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 \
  "sudo docker run --rm -v odoo18-staging-data:/data -v /srv/backups/odoo18-staging/${BACKUP_TIMESTAMP}:/backup alpine tar xzf /backup/staging-volumes-*.tar.gz -C /data"
```

### 6. Restart Staging

```bash
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 \
  'cd /srv/stacks/odoo18-staging && sudo docker compose restart'
```

### 7. Verify Rollback

```bash
curl -I https://staging.odoo.seisei.tokyo/web/health
```

**Expected:** HTTP 200 response

## Common Error Handling

### Error: "Permission denied" during database export

**Cause:** Database user lacks necessary privileges or SSL/connection issues

**Solution:**
```bash
# Verify database connectivity
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 \
  'sudo docker exec odoo18-prod-web bash -c "PGPASSWORD=Wind1982 psql -h seisei-odoo18-prod-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com -U odoo18 -d ten_testodoo -c \"SELECT version();\""'

# If fails, check RDS security groups and connection parameters
```

### Error: "No space left on device"

**Cause:** Insufficient disk space for backup/export operations

**Solution:**
```bash
# Check disk space
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 'df -h /srv /tmp'

# Clean old backups if needed
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 \
  'sudo find /srv/backups/odoo18-staging -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true'
```

### Error: "Container is unhealthy"

**Cause:** Container started but Odoo process failed, often due to module errors or database connection issues

**Solution:**
```bash
# Check container logs
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 \
  'sudo docker logs odoo18-staging-web --tail 100'

# Look for ERROR or exception messages
# Common issues: module initialization errors, database connection failures
```

### Error: "pg_restore version mismatch"

**Cause:** PostgreSQL version differs between export and import

**Solution:**
```bash
# Check versions
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 '
  echo "Production:"; sudo docker exec odoo18-prod-web bash -c "PGPASSWORD=Wind1982 psql -h seisei-odoo18-prod-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com -U odoo18 -d ten_testodoo -c \"SELECT version();\"" 2>/dev/null
  echo "Staging:"; sudo docker exec odoo18-staging-web bash -c "PGPASSWORD=Wind1982 psql -h seisei-odoo18-staging-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com -U odoo18 -d ten_testodoo -c \"SELECT version();\"" 2>/dev/null
'

# Both should be PostgreSQL 15 or 16
# If mismatch, use pg_dump with --no-owner --no-acl flags (already included in script)
```

### Error: S3 sync fails with "Access Denied"

**Cause:** AWS credentials not configured or lack permissions

**Solution:**
```bash
# Verify AWS CLI configuration
aws s3 ls s3://biznexus-prod-files/odoo/ten_testodoo/ | head -5
aws s3 ls s3://seisei-staging/odoo/ten_testodoo/ | head -5

# If fails, configure AWS credentials:
aws configure
# Enter your AWS Access Key ID and Secret Access Key
```

### Error: Images still showing placeholders after clone

**Cause:** S3 sync didn't complete or bucket name in configuration doesn't match

**Solution:**
```bash
# Verify S3 sync completed
aws s3 ls s3://seisei-staging/odoo/ten_testodoo/ --recursive | wc -l
# Should show ~2000+ files

# Verify staging S3 configuration
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 \
  'cat /srv/stacks/odoo18-staging/.env | grep S3'

# Should show:
# SEISEI_S3_BUCKET=seisei-staging
# SEISEI_S3_REGION=ap-northeast-1
# SEISEI_S3_ACCESS_KEY=AKIA...
# SEISEI_S3_SECRET_KEY=...

# If incorrect, fix and restart:
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141 '
  sudo sed -i "s/SEISEI_S3_BUCKET=.*/SEISEI_S3_BUCKET=seisei-staging/" /srv/stacks/odoo18-staging/.env
  cd /srv/stacks/odoo18-staging && sudo docker compose restart
'
```

## Drift Prevention

To prevent staging from diverging from production over time:

### 1. Lock Image Digests

Both environments should reference images by digest, not tag:

```bash
# In .env files, use:
IMAGE_REF=ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:d2b8076c...

# Not:
IMAGE_REF=ghcr.io/cameltravel666-crypto/seisei-odoo18:latest
```

### 2. Version Control Configuration

Store compose and env files in Git:

```bash
cd /Users/taozhang/Projects/seisei-odoo-addons
git add infra/stacks/odoo18-prod/docker-compose.yml
git add infra/stacks/odoo18-staging/docker-compose.yml
git commit -m "Lock configuration to prevent drift"
```

### 3. Regular Drift Checks

Run drift check weekly:

```bash
./scripts/drift_check.sh
```

This will report any differences between production and staging.

### 4. Document Intentional Differences

Acceptable differences between prod and staging:
- Database host/credentials
- Domain names/URLs
- S3 bucket names
- Admin passwords
- Log levels (staging can be more verbose)

All other differences should be investigated and resolved.

## Maintenance Schedule

### Weekly
- Run `drift_check.sh` to detect divergence
- Review staging logs for errors

### Monthly
- Re-clone staging from production (unless active testing)
- Verify backups are being created
- Clean old backups (keep last 7 days)

### After Major Production Changes
- Re-run clone script to keep staging aligned
- Test critical flows on staging before production deployment

## Emergency Contacts

- DevOps Lead: [Name]
- Database Administrator: [Name]
- AWS Account Owner: [Name]

## Change History

| Date | Change | Operator |
|------|--------|----------|
| 2026-02-03 | Initial clone script created | Claude Code |
| | | |

## References

- Main Clone Script: `scripts/clone_prod_to_staging.sh`
- Drift Check Script: `scripts/drift_check.sh`
- Production Stack: `/srv/stacks/odoo18-prod`
- Staging Stack: `/srv/stacks/odoo18-staging`
- Backup Location: `/srv/backups/odoo18-staging/`
