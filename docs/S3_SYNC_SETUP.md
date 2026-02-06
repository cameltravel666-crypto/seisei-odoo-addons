# S3 Sync Setup Guide

## Overview

This guide explains how to set up S3 synchronization from Production to Staging environments.

## Required GitHub Secrets

Add the following secrets to your GitHub repository:

### Production S3 (Source - Read Only)

| Secret Name | Description | Example Value |
|------------|-------------|---------------|
| `PRODUCTION_S3_BUCKET` | Production S3 bucket name | `seisei-odoo-production` |
| `PRODUCTION_S3_REGION` | AWS region for production bucket | `ap-northeast-1` |
| `PRODUCTION_S3_ACCESS_KEY` | AWS Access Key (read-only IAM user) | `AKIA...` |
| `PRODUCTION_S3_SECRET_KEY` | AWS Secret Key (read-only IAM user) | `xxxxx...` |

**⚠️ IMPORTANT:** Production credentials should be from a **read-only** IAM user with permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::seisei-odoo-production",
        "arn:aws:s3:::seisei-odoo-production/*"
      ]
    }
  ]
}
```

### Staging S3 (Destination - Already Configured)

These secrets should already exist from the S3 credentials fix:
- `STAGING_S3_BUCKET` = `seisei-odoo-staging`
- `STAGING_S3_REGION` = `ap-northeast-1`
- `STAGING_S3_ACCESS_KEY`
- `STAGING_S3_SECRET_KEY`

## How to Add Secrets

1. Go to: https://github.com/cameltravel666-crypto/seisei-odoo-addons/settings/secrets/actions
2. Click "New repository secret"
3. Add each secret listed above
4. Click "Add secret"

## How to Use the S3 Sync Workflow

### Step 1: Dry Run (Preview)

First, run a dry run to see what would be synced:

1. Go to: **Actions** → **Sync S3 (Production → Staging)**
2. Click **Run workflow**
3. Select:
   - **Sync mode:** `dry-run`
   - **Delete extra files:** `false`
4. Click **Run workflow**
5. Review the output to see what files would be copied

### Step 2: Full Sync

After verifying the dry run output:

1. Go to: **Actions** → **Sync S3 (Production → Staging)**
2. Click **Run workflow**
3. Select:
   - **Sync mode:** `full-sync`
   - **Delete extra files:** `false` (recommended)
4. Click **Run workflow**
5. Wait for completion

### Step 3: Verify

1. Refresh your Staging application: https://staging.odoo.seisei.tokyo
2. Check if product images display correctly
3. If images still don't appear, check browser cache or hard refresh (Ctrl+Shift+R)

## Safety Features

1. **Dry Run Mode**: Test before executing
2. **Read-Only Source**: Production bucket is accessed read-only
3. **Audit Trail**: All syncs are logged in GitHub Actions
4. **Manual Trigger**: Sync only runs when explicitly triggered
5. **Delete Protection**: Extra file deletion is opt-in

## Troubleshooting

### Issue: "Failed to access production bucket"

**Solution:** Verify production S3 credentials are correct and have read permissions.

### Issue: Images still not showing after sync

**Possible causes:**
1. Browser cache - try hard refresh (Ctrl+Shift+R)
2. Odoo cache - restart Odoo containers
3. S3 credentials not properly injected - check deployment logs

### Issue: Sync is slow

**Expected behavior:** First sync copies all files and may take time. Subsequent syncs only copy changed files.

## Notes

- **Data Safety**: Production data is never modified by this workflow
- **Cost**: S3 data transfer between regions incurs AWS charges
- **Frequency**: Run sync as needed, not on a schedule
- **Selective Sync**: Currently syncs entire bucket. File filtering can be added if needed.
