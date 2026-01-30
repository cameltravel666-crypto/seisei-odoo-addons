# Edge Nginx Router Stack

## Purpose

This stack manages the Nginx router configuration for Odoo database routing and tenant/admin split logic.

## Configuration Drift Prevention

**⚠️ CRITICAL: Never modify `/opt/seisei-odoo/nginx/default.conf` directly on the server!**

All changes must go through this stack's controlled deployment process:

1. Modify `default.conf` in this directory
2. Test locally if possible
3. Commit changes to git
4. Deploy using `deploy.sh` (see below)
5. The deploy process will:
   - Run preflight checks
   - Backup current config
   - Sync new config to server
   - Validate with `nginx -t`
   - Reload nginx
   - Run smoke tests

## Files

- `docker-compose.yml` - Nginx container definition
- `default.conf` - Router configuration (database routing, tenant split)
- `.env.example` - Environment template (if needed)
- `README.md` - This file

## Deployment

### Sync to /srv/stacks

```bash
# On server
sudo /opt/seisei-odoo-addons/scripts/sync_to_srv.sh edge-nginx-router
```

### Deploy Changes

```bash
# On server (after making changes to default.conf)
sudo /opt/seisei-odoo-addons/scripts/deploy.sh edge-nginx-router infra latest

# Via GitHub Actions
# Use deploy.yml workflow with:
#   stack: edge-nginx-router
#   sha: sha-xxxxx
```

### Rollback

```bash
# On server
sudo /opt/seisei-odoo-addons/scripts/rollback.sh edge-nginx-router infra

# Via GitHub Actions
# Use rollback.yml workflow
```

## Router Logic Overview

### Tenant Database Mapping

- `demo.nagashiro.top` → `ten_testodoo`
- `testodoo.seisei.tokyo` → `ten_testodoo`
- `*.erp.seisei.tokyo` → `ten_<subdomain>`
- `admin.erp.seisei.tokyo` → routes to odoo-admin container

### Demo Hosts (Allow Direct Login)

- `demo.nagashiro.top` - Demo environment for testing
- `testodoo.seisei.tokyo` - Test environment

These hosts:
- Allow direct Odoo login
- Do NOT redirect to biznexus
- Always use HTTPS scheme (behind TLS termination)

### Tenant Subdomains (biznexus Integration)

- `*.erp.seisei.tokyo` (except admin/demo) redirect login to biznexus
- QR routes return 410 Gone (use qr-bff instead)

## Health Check

```bash
curl http://localhost:8080/nginx-health
# Should return: OK
```

## Smoke Tests

The smoke test for this stack should verify:
- Nginx config is valid: `nginx -t`
- Container is running
- Health endpoint returns 200
- Key domains are accessible

## Common Issues

### Config Drift

**Problem**: Someone edited `/opt/seisei-odoo/nginx/default.conf` directly

**Solution**:
1. Check diff: `diff /opt/seisei-odoo/nginx/default.conf /srv/stacks/edge-nginx-router/default.conf`
2. If drift detected, either:
   - Restore from backup: use rollback.sh
   - Or update this repo with the change and redeploy

### Nginx Fails to Reload

**Symptom**: `nginx -t` fails after sync

**Debug**:
```bash
# Check syntax
nginx -t

# Check logs
docker compose logs nginx-router

# Manually test config
nginx -c /path/to/default.conf -t
```

## Version Control

This configuration is version-controlled in git. All changes are tracked in:
- Git history
- `/srv/deploy-history.log`
- Automatic backups in `/srv/backups/edge-nginx-router/`

## Related Documentation

- [DEPLOYMENT.md](../../../docs/DEPLOYMENT.md) - Full deployment guide
- [GITHUB_CICD.md](../../../docs/GITHUB_CICD.md) - CI/CD workflows
