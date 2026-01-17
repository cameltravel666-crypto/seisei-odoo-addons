# BizNexus ERP - Deployment Runbook

## Overview

This document outlines the deployment procedures for the BizNexus ERP enterprise overhaul (January 2026).

## Pre-Deployment Checklist

### 1. Database Migrations

Before deploying, ensure the Prisma schema changes are applied:

```bash
# Generate Prisma client
npx prisma generate

# Apply migrations (dry-run first in staging)
npx prisma migrate deploy
```

New tables/changes:
- `stores` - Multi-store support
- `invitations` - Secure employee invitations
- `files` - S3 file metadata
- `memberships` - Enhanced RBAC with store_scope
- `audit_logs` - Extended actions

### 2. Environment Variables

New required environment variables:

```env
# AWS S3 Configuration
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET=biznexus-files

# Ops Admin Configuration
OPS_ADMINS=admin1@example.com,admin2@example.com
OPS_API_KEY=your-secure-ops-api-key

# Cron Configuration
CRON_API_KEY=your-secure-cron-key
PROVISIONING_WORKER_KEY=same-as-cron-key
```

### 3. Cron Jobs

Set up the following cron jobs:

```bash
# Provisioning Worker (every 30 seconds)
*/30 * * * * curl -X POST -H "x-cron-key: $CRON_API_KEY" https://erp.seisei.tokyo/api/provisioning/worker

# Expire Old Invitations (daily at 2 AM)
0 2 * * * curl -X POST -H "x-cron-key: $CRON_API_KEY" https://erp.seisei.tokyo/api/cron/expire-invitations

# Cleanup Pending Uploads (daily at 3 AM)
0 3 * * * curl -X POST -H "x-cron-key: $CRON_API_KEY" https://erp.seisei.tokyo/api/cron/cleanup-files
```

## Deployment Steps

### Step 1: Staging Deployment

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm ci

# 3. Generate Prisma client
npx prisma generate

# 4. Run database migrations
npx prisma migrate deploy

# 5. Build application
npm run build

# 6. Run tests
npm run test

# 7. Deploy to staging
# (Use your deployment tool - Docker, Vercel, etc.)
```

### Step 2: Staging Verification

1. **Authentication Flow**
   - [ ] Login page loads correctly
   - [ ] Login with credentials works
   - [ ] Google OAuth works
   - [ ] Session persistence works

2. **Invitation System**
   - [ ] Admin can send invitations
   - [ ] Invitation email/link works
   - [ ] Set password page works
   - [ ] User can login after accepting

3. **Team Management**
   - [ ] Settings > Team page loads
   - [ ] Member list shows correctly
   - [ ] Role changes work
   - [ ] Invitation revoke works

4. **Subscription (Web Only)**
   - [ ] Subscription page visible in web
   - [ ] Subscription page hidden in native app
   - [ ] Upgrade prompts hidden in native app

5. **File Storage**
   - [ ] Upload URL generation works
   - [ ] File upload to S3 works
   - [ ] Download URL works
   - [ ] File list works

6. **Ops Console**
   - [ ] /api/ops/tenants returns data (with auth)
   - [ ] /api/ops/provisioning/jobs returns data
   - [ ] Job retry works

### Step 3: Production Deployment

```bash
# 1. Tag release
git tag v2.0.0-enterprise
git push origin v2.0.0-enterprise

# 2. Deploy to production
# (Follow your CI/CD pipeline)

# 3. Run migrations in production
npx prisma migrate deploy --preview-feature

# 4. Verify cron jobs are running
```

### Step 4: Post-Deployment Verification

1. **Health Checks**
   - [ ] Application responds at https://erp.seisei.tokyo
   - [ ] API endpoints respond correctly
   - [ ] Database connections work

2. **Monitoring**
   - [ ] Check error logs for any issues
   - [ ] Monitor provisioning worker status
   - [ ] Verify audit logs are being created

## Rollback Procedure

If issues are found:

```bash
# 1. Revert to previous release
git checkout v1.x.x

# 2. Rebuild and redeploy
npm ci && npm run build

# 3. Rollback database if needed (DANGER - may lose data)
# npx prisma migrate resolve --rolled-back 20260117_enterprise_overhaul
```

## API Endpoints Reference

### New Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/admin/invitations` | POST | ORG_ADMIN | Create invitation |
| `/api/admin/invitations` | GET | ORG_ADMIN | List invitations |
| `/api/admin/invitations/[id]` | DELETE | ORG_ADMIN | Revoke invitation |
| `/api/admin/invitations/[id]/resend` | POST | ORG_ADMIN | Resend invitation |
| `/api/admin/members` | GET | ORG_ADMIN | List team members |
| `/api/auth/invitation/[token]` | GET | Public | Verify invitation |
| `/api/auth/accept-invitation` | POST | Public | Accept invitation |
| `/api/files` | GET | Auth | List files |
| `/api/files/upload` | POST | Auth | Get upload URL |
| `/api/files/[id]` | GET | Auth | Get download URL |
| `/api/files/[id]` | POST | Auth | Confirm upload |
| `/api/files/[id]` | DELETE | Auth | Delete file |
| `/api/ops/tenants` | GET | OPS_ADMIN | List all tenants |
| `/api/ops/provisioning/jobs` | GET | OPS_ADMIN | List jobs |
| `/api/ops/provisioning/jobs/[id]/retry` | POST | OPS_ADMIN | Retry job |
| `/api/ops/audit-logs` | GET | OPS_ADMIN | View audit logs |
| `/api/provisioning/worker` | GET | CRON | Worker status |
| `/api/provisioning/worker` | POST | CRON | Run worker |

### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `/api/subscription` POST | Requires BILLING_ADMIN role |
| `/api/me/entitlements` | Added store_scope support |

## Role Hierarchy

```
BILLING_ADMIN (4) - Can manage subscription
    ↓
ORG_ADMIN (3) - Can manage members
    ↓
MANAGER (2) - Can manage assigned stores
    ↓
OPERATOR (1) - Basic operations
```

## Troubleshooting

### Provisioning Job Stuck

```bash
# Check job status
curl -H "x-ops-key: $OPS_API_KEY" https://erp.seisei.tokyo/api/ops/provisioning/jobs?status=RUNNING

# Force retry
curl -X POST -H "x-ops-key: $OPS_API_KEY" https://erp.seisei.tokyo/api/ops/provisioning/jobs/{id}/retry
```

### Invitation Not Working

1. Check invitation status in database
2. Verify token hasn't expired (48 hours)
3. Check audit logs for errors

### S3 Upload Failing

1. Verify AWS credentials
2. Check bucket policy allows uploads
3. Verify file size limits

## Contact

For issues, contact:
- Technical: dev@seisei.tokyo
- Operations: ops@seisei.tokyo
