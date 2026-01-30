# Seisei Release Process

## Version Strategy

### Baseline Tags
- `main1.0` - Production baseline (read-only, frozen)
- `main1.0.x` - Patch releases (bug fixes, config updates)
- `main1.x.0` - Minor releases (new features, stack changes)

### Tag Naming Convention
```
main<major>.<minor>.<patch>
  |     |      |
  |     |      +-- Hotfixes, config tweaks
  |     +--------- New features, stack additions
  +--------------- Major architecture changes
```

### Branch Strategy
- `main` - Production-ready code, protected
- `develop` - Integration branch for features
- `feature/*` - Feature branches
- `hotfix/*` - Emergency fixes

## Release Workflow

### 1. Pre-Release Checklist

```bash
# Run drift check to ensure repo matches production
make drift-check

# Validate all routes (no conflicts)
./scripts/validate_routes.sh

# Check for sensitive values
grep -rE "(AKIA|PRIVATE|SECRET=)" --include="*.yml" --include="*.env" infra/
```

### 2. Create Release

```bash
# Export current runtime state
make export-runtime

# Run sanitization
./scripts/sanitize.sh audit/runtime/

# Create release tarball
make release TAG=main1.0.1

# Verify release package
tar -tzf dist/releases/main1.0.1/seisei-main1.0.1-sanitized.tar.gz | head -20
```

### 3. Tag and Push

```bash
# Commit changes
git add .
git commit -m "Release main1.0.1: <description>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# Create annotated tag
git tag -a main1.0.1 -m "Release main1.0.1

Changes:
- <change 1>
- <change 2>"

# Push
git push origin main
git push origin main1.0.1
```

### 4. Deploy to Production

```bash
# SSH to production server
ssh -i ~/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141

# Pull latest
cd /opt/seisei-main
git fetch origin
git checkout main1.0.1

# Apply changes per stack
cd infra/stacks/edge-traefik && docker compose up -d
cd ../odoo18-prod && docker compose up -d
# ... repeat for affected stacks

# Verify
./scripts/drift_check.sh --local
```

## Rollback Procedure

### Quick Rollback (< 5 min)

```bash
# Identify last known good tag
git tag -l 'main1.*' --sort=-version:refname | head -5

# Rollback to previous tag
git checkout main1.0.0

# Restart affected containers
docker compose -f infra/stacks/<stack>/docker-compose.yml up -d
```

### Full Rollback with Data

See `./scripts/rollback_guide.sh` for complete rollback procedure including:
- Docker image rollback
- Database snapshot restoration
- AWS EBS snapshot commands

## Drift Detection

### Purpose
Detect when production state diverges from repo baseline.

### Usage

```bash
# Local check (compare repo locks)
make drift-check

# Server check (SSH to production)
./scripts/drift_check.sh --server 54.65.127.141 --ssh-key ~/Projects/Pem/odoo-2025.pem
```

### What We Check
1. **Docker Images** - Image tags and digests
2. **Compose Files** - SHA256 of compose files
3. **Traefik Routes** - Router and service definitions
4. **Odoo Addons** - Module directory hashes
5. **Nginx Config** - Router configuration

### Handling Drift

| Drift Type | Action |
|------------|--------|
| Image version newer | Update lock file, tag release |
| Config differs | Investigate, sync repo or server |
| Unknown container | Document in STACKS.md or remove |
| Missing addon | Check if intentional removal |

## Audit Trail

All runtime exports are saved to:
```
audit/runtime/<timestamp>/
  ├── docker_state.json
  ├── compose_sha256.txt
  ├── traefik_routers.json
  ├── odoo_addons.hash
  └── drift_report.json
```

## Emergency Contacts

- **Infrastructure**: DevOps team
- **Odoo Issues**: Odoo admin
- **Database**: DBA or use AWS snapshots

## Related Documents

- [STACKS.md](./STACKS.md) - Stack inventory
- [ROUTING_RULES.md](./ROUTING_RULES.md) - Traefik routing conventions
- [BRANCH_PROTECTION.md](./BRANCH_PROTECTION.md) - GitHub settings
- [DRIFT_EXAMPLE.md](./DRIFT_EXAMPLE.md) - Sample drift outputs
- [CLEANUP_POLICY.md](./CLEANUP_POLICY.md) - File cleanup rules
