# Deployer Permissions Configuration

## Overview

This document describes the **deployer user permission configuration system** for automated CI/CD deployments to production. This system implements minimum privilege security principles while enabling GitHub Actions workflows to perform automated deployments.

## Problem Statement

**Initial Issue**: Production server was hardened with a restricted `deployer` user who only had sudo access to:
- `/usr/local/sbin/prod_status.sh` (read-only monitoring)
- `/usr/local/sbin/prod_logs.sh` (log viewing)
- `/usr/local/sbin/prod_promote.sh` (basic image update)

**Gap**: The full CI/CD deployment workflow (`scripts/deploy.sh`) requires additional permissions:
- GHCR authentication (`docker login ghcr.io`)
- Docker compose operations in deployment directories
- Container inspection and verification
- Release directory management

**Constraint**: Cannot directly modify server configuration - all changes must go through GitHub and be auditable.

## Solution Architecture

### Components

1. **Configuration Script** (`scripts/configure_deployer_permissions.sh`)
   - Idempotent sudoers configuration management
   - Dry-run mode for safe testing
   - Automatic backup before changes
   - Syntax validation before applying
   - Comprehensive verification

2. **GitHub Actions Workflow** (`.github/workflows/configure-deployer.yml`)
   - Manual trigger only (workflow_dispatch)
   - Requires ubuntu user with full sudo access
   - Supports dry-run and apply modes
   - Provides detailed audit trail
   - Environment protection rules

3. **Documentation** (this file)
   - Usage instructions
   - Rollback procedures
   - Security considerations
   - Troubleshooting guide

### Security Principles

1. **Minimum Privilege**: Only grant specific commands needed for automated deployment
2. **Whitelist Approach**: Explicitly list allowed commands (not blacklist)
3. **Absolute Paths**: All commands use absolute paths (no PATH lookup)
4. **Path Restrictions**: Docker commands restricted to specific directories
5. **Explicit Denials**: Dangerous commands explicitly denied even if other access granted
6. **No Password Required**: NOPASSWD for automation (deployer has no password by design)

### Permissions Granted

```bash
# Read-only monitoring (existing)
deployer ALL=(root) NOPASSWD: /usr/local/sbin/prod_status.sh
deployer ALL=(root) NOPASSWD: /usr/local/sbin/prod_logs.sh *

# Manual promotion (existing)
deployer ALL=(root) NOPASSWD: /usr/local/sbin/prod_promote.sh *

# Automated deployment (NEW)
deployer ALL=(root) NOPASSWD: /opt/seisei-odoo-addons/scripts/deploy.sh *
deployer ALL=(root) NOPASSWD: /usr/bin/docker login ghcr.io *
deployer ALL=(root) NOPASSWD: /usr/bin/docker compose -f /srv/stacks/odoo18-prod/* *
deployer ALL=(root) NOPASSWD: /usr/bin/docker compose -f /srv/releases/* *
deployer ALL=(root) NOPASSWD: /usr/bin/docker inspect *
deployer ALL=(root) NOPASSWD: /usr/bin/docker ps *

# Explicitly DENIED (security hardening)
deployer ALL=(root) !NOPASSWD: /usr/bin/docker exec *
deployer ALL=(root) !NOPASSWD: /usr/bin/docker run *
deployer ALL=(root) !NOPASSWD: /usr/bin/docker rm *
deployer ALL=(root) !NOPASSWD: /bin/bash
deployer ALL=(root) !NOPASSWD: /bin/sh
deployer ALL=(root) !NOPASSWD: /usr/bin/sudo su
```

## Usage

### Prerequisites

1. **GitHub Secret**: `UBUNTU_SSH_KEY` must be set with SSH key for ubuntu user
   ```bash
   # Set the secret
   gh secret set UBUNTU_SSH_KEY < ~/.ssh/ubuntu_prod_key
   ```

2. **Server Access**: ubuntu user must have full sudo access on production server

3. **Repository**: Code must be checked out to `/opt/seisei-odoo-addons` on server

### Step 1: Dry Run (Test First)

**ALWAYS test with dry-run before applying changes.**

1. Go to GitHub Actions: https://github.com/cameltravel666-crypto/seisei-odoo-addons/actions/workflows/configure-deployer.yml

2. Click "Run workflow"

3. Configure:
   - **environment**: `production`
   - **dry_run**: `true` ✅ (IMPORTANT: Start with dry-run)

4. Review the output:
   - Check the sudoers content preview
   - Verify syntax validation passes
   - Review permissions list
   - Check for any warnings or errors

5. Download and review the job summary

### Step 2: Apply Configuration

**Only proceed after reviewing dry-run output.**

1. Go to GitHub Actions (same workflow)

2. Click "Run workflow"

3. Configure:
   - **environment**: `production`
   - **dry_run**: `false` ⚠️ (Will apply changes)

4. Review approvals (if environment protection rules configured)

5. Monitor the execution:
   - Configuration application
   - Permission verification
   - Test results

6. Review the job summary for:
   - Applied configuration
   - Backup location
   - Rollback command
   - Verification results

### Step 3: Verify Deployment Works

After applying configuration, test the full deployment workflow:

1. Trigger the "Deploy to Environment" workflow with a test image

2. Monitor for:
   - GHCR authentication success
   - Docker compose operations
   - Deploy script execution
   - Health checks passing

3. Check deployment logs for any permission errors

## Rollback Procedures

### Automatic Backups

Every time the configuration is applied, a backup is created:
```
/var/backups/sudoers/deployer.sudoers.backup.<timestamp>
```

### Manual Rollback

If you need to rollback to a previous configuration:

1. **SSH to production server as ubuntu**:
   ```bash
   ssh -i ~/.ssh/ubuntu_prod_key ubuntu@54.65.127.141
   ```

2. **List available backups**:
   ```bash
   sudo ls -lah /var/backups/sudoers/
   ```

3. **View a specific backup**:
   ```bash
   sudo cat /var/backups/sudoers/deployer.sudoers.backup.20260205_143000
   ```

4. **Restore from backup**:
   ```bash
   # Replace <timestamp> with actual backup timestamp
   sudo cp /var/backups/sudoers/deployer.sudoers.backup.<timestamp> /etc/sudoers.d/deployer
   ```

5. **Verify syntax** (CRITICAL):
   ```bash
   sudo visudo -c -f /etc/sudoers.d/deployer
   ```

6. **Test deployer permissions**:
   ```bash
   sudo -u deployer sudo -l
   ```

### Emergency Rollback via GitHub Actions

You can also rollback by:

1. Reverting the commit that changed `configure_deployer_permissions.sh`
2. Re-running the configure-deployer workflow with dry_run=false

## Verification

### Manual Verification

**Test deployer can run required commands**:

```bash
# SSH as deployer
ssh -i ~/.ssh/deployer_prod_key deployer@54.65.127.141

# Test sudo capabilities
sudo -l

# Expected output should include:
#   - /usr/local/sbin/prod_status.sh
#   - /opt/seisei-odoo-addons/scripts/deploy.sh
#   - /usr/bin/docker login ghcr.io
#   - /usr/bin/docker compose
#   - /usr/bin/docker inspect
#   - /usr/bin/docker ps
```

**Test specific commands (non-destructive)**:

```bash
# Test docker ps
sudo docker ps

# Test docker inspect (pick any container)
sudo docker inspect <container-id>

# Test deploy script help
sudo /opt/seisei-odoo-addons/scripts/deploy.sh --help

# Test denied commands (should fail)
sudo docker exec <container> bash  # Should be denied
sudo bash                          # Should be denied
```

### Automated Verification

The configure-deployer workflow automatically verifies permissions after applying:
- Checks sudo -l output
- Tests specific command permissions
- Verifies denied commands are blocked

## Troubleshooting

### Issue: "Permission denied" when running configure-deployer workflow

**Cause**: UBUNTU_SSH_KEY secret not set or incorrect

**Fix**:
```bash
# Update the secret with correct ubuntu SSH key
gh secret set UBUNTU_SSH_KEY < /path/to/ubuntu_prod_key
```

### Issue: "visudo: syntax error" during configuration

**Cause**: Invalid sudoers syntax in configure_deployer_permissions.sh

**Fix**:
1. Review the script changes
2. Test locally with visudo -c
3. Fix syntax errors
4. Commit and re-run workflow

### Issue: Deployer still can't run docker commands

**Cause**: Permissions not applied correctly or sudo command format incorrect

**Diagnosis**:
```bash
# SSH as ubuntu
ssh -i ~/.ssh/ubuntu_prod_key ubuntu@54.65.127.141

# Check sudoers file
sudo cat /etc/sudoers.d/deployer

# Check file permissions
ls -la /etc/sudoers.d/deployer
# Should be: -r--r----- 1 root root

# Test as deployer
sudo -u deployer sudo -l
```

**Fix**: Re-run configure-deployer workflow with dry_run=false

### Issue: Deployment workflow still fails with GHCR authentication

**Cause**: GHCR_PAT secret not set or expired

**Fix**:
```bash
# Update GHCR_PAT secret with valid token
gh secret set GHCR_PAT --body "ghp_xxxxxxxxxxxx"
```

### Issue: Need to add more permissions

**Process**:
1. Edit `scripts/configure_deployer_permissions.sh`
2. Add new permissions to SUDOERS_CONTENT
3. Test locally if possible
4. Run configure-deployer with dry_run=true
5. Review output carefully
6. Apply with dry_run=false
7. Verify new permissions work

## Security Considerations

### What deployer CAN do

✅ **Read-only operations**:
- View system status
- View logs
- Inspect containers
- List containers

✅ **Deployment operations** (restricted paths):
- Run deploy.sh script
- Login to GHCR (ghcr.io only)
- Docker compose operations in /srv/stacks/odoo18-prod/ and /srv/releases/
- Pull and recreate containers

### What deployer CANNOT do

❌ **Interactive access**:
- Cannot exec into containers
- Cannot get a shell
- Cannot run arbitrary docker commands

❌ **Destructive operations**:
- Cannot run containers directly
- Cannot remove containers directly
- Cannot modify files outside deployment directories

❌ **Privilege escalation**:
- Cannot sudo to root shell
- Cannot modify sudo configuration
- Cannot add users or change permissions

### Design Philosophy

This permission model follows the **"just enough access for automation"** principle:

1. **Deployer is a service account**, not a human user
2. **All operations are scripted and auditable** via GitHub Actions
3. **Interactive operations use ubuntu user** with manual approval
4. **Permissions are granted by directory**, not globally
5. **Dangerous commands are explicitly denied** even if other access granted

## Related Documentation

- [`scripts/configure_deployer_permissions.sh`](../scripts/configure_deployer_permissions.sh) - Configuration script
- [`.github/workflows/configure-deployer.yml`](../.github/workflows/configure-deployer.yml) - GitHub Actions workflow
- [`scripts/deploy.sh`](../scripts/deploy.sh) - Deployment script that requires these permissions
- [Production Server Hardening Audit](../../server-apps/docs/audits/2026-02-03-preprod/PROD_ACCESS_HARDENING_COMPLETE.txt) - Initial security hardening

## Audit Trail

All configuration changes are audited through:

1. **GitHub Actions logs**: Full execution logs with timestamps and actors
2. **Git history**: All script changes tracked in version control
3. **Server backups**: Every configuration change creates timestamped backup
4. **GitHub environment protection**: Optional approval gates for production changes

## Change History

| Date | Actor | Change | Reason |
|------|-------|--------|--------|
| 2026-02-05 | System | Initial configuration system created | Enable automated CI/CD deployments |

## Support

For issues or questions:
1. Review this documentation
2. Check GitHub Actions workflow logs
3. Test with dry-run mode first
4. Consult server-apps repository for infrastructure docs
