# Deployer Permissions - Quick Reference

## TL;DR

This script configures sudo permissions for the `deployer` user to enable automated CI/CD deployments.

## Quick Start

### Via GitHub Actions (Recommended)

1. **Test first** (dry-run):
   ```
   Go to: Actions → Configure Deployer Permissions → Run workflow
   Set: environment=production, dry_run=true
   ```

2. **Review output**, then apply:
   ```
   Go to: Actions → Configure Deployer Permissions → Run workflow
   Set: environment=production, dry_run=false
   ```

### Manual Execution (Server Access Required)

```bash
# SSH as ubuntu (requires full sudo)
ssh -i ~/.ssh/ubuntu_prod_key ubuntu@54.65.127.141

# Test first (dry-run)
sudo ./configure_deployer_permissions.sh --dry-run

# Apply configuration
sudo ./configure_deployer_permissions.sh
```

## What It Does

Grants deployer user sudo access to:
- ✅ `deploy.sh` - Full deployment script
- ✅ `docker login ghcr.io` - GHCR authentication
- ✅ `docker compose` - Container orchestration (restricted to deployment paths)
- ✅ `docker inspect` - Container inspection
- ✅ `docker ps` - Container listing

Explicitly denies:
- ❌ `docker exec` - No interactive container access
- ❌ `docker run` - No arbitrary container execution
- ❌ `bash/sh` - No shell access
- ❌ Shell access or privilege escalation

## Files Modified

- `/etc/sudoers.d/deployer` - Main sudoers configuration
- `/var/backups/sudoers/deployer.sudoers.backup.<timestamp>` - Automatic backup

## Rollback

```bash
# SSH as ubuntu
ssh -i ~/.ssh/ubuntu_prod_key ubuntu@54.65.127.141

# List backups
sudo ls -lah /var/backups/sudoers/

# Restore from backup (replace <timestamp>)
sudo cp /var/backups/sudoers/deployer.sudoers.backup.<timestamp> /etc/sudoers.d/deployer

# Verify syntax
sudo visudo -c -f /etc/sudoers.d/deployer
```

## Verification

```bash
# SSH as deployer
ssh -i ~/.ssh/deployer_prod_key deployer@54.65.127.141

# Check permissions
sudo -l

# Test docker commands
sudo docker ps
sudo docker inspect <container-id>
```

## Documentation

Full documentation: [`docs/DEPLOYER_PERMISSIONS.md`](../docs/DEPLOYER_PERMISSIONS.md)

## Security

- **Minimum privilege principle**: Only commands needed for automated deployment
- **Whitelist approach**: Explicitly allowed commands only
- **Path restrictions**: Docker operations restricted to deployment directories
- **No interactive access**: Cannot exec into containers or get shell
- **Auditable**: All changes via GitHub Actions with full logs

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Permission denied | Verify UBUNTU_SSH_KEY secret is set |
| Syntax error | Review script changes, test with `visudo -c` |
| Deployer can't run docker | Re-run workflow, check sudo -l output |
| GHCR auth fails | Update GHCR_PAT secret |

## Support

1. Read full docs: `docs/DEPLOYER_PERMISSIONS.md`
2. Check GitHub Actions logs
3. Test with dry-run first
4. Review server-apps/docs for infrastructure details
