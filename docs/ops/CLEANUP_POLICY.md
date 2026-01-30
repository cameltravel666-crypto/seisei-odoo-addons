# Cleanup Policy

This document defines what files can be safely deleted and what must be preserved.

## Safe to Delete

### OS/Editor Artifacts

| Pattern | Description | Safe to Delete |
|---------|-------------|----------------|
| `.DS_Store` | macOS folder metadata | YES |
| `._*` | macOS resource forks | YES |
| `Thumbs.db` | Windows thumbnails | YES |
| `desktop.ini` | Windows folder settings | YES |
| `*.swp`, `*.swo` | Vim swap files | YES |
| `*~` | Editor backup files | YES |

### Build/Cache Artifacts

| Pattern | Description | Safe to Delete |
|---------|-------------|----------------|
| `__pycache__/` | Python bytecode cache | YES |
| `*.pyc`, `*.pyo` | Python compiled files | YES |
| `.next/` | Next.js build cache | YES (if rebuilding) |
| `node_modules/` | npm dependencies | YES (if `package-lock.json` exists) |
| `dist/` | Build output | YES (can rebuild) |

### Backup Files

| Pattern | Description | Safe to Delete |
|---------|-------------|----------------|
| `*.bak` | Backup files | MAYBE - check content first |
| `*.backup` | Backup files | MAYBE - check content first |
| `*.orig` | Merge originals | YES (after merge complete) |
| `*.old` | Old versions | MAYBE - check if needed |

### Runtime/Temporary

| Pattern | Description | Safe to Delete |
|---------|-------------|----------------|
| `audit/runtime/*` | Exported runtime states | YES (after analysis) |
| `/tmp/*` | Temporary files | YES |
| `*.log` | Log files | YES (after review) |
| `*.tmp` | Temporary files | YES |

---

## DO NOT Delete

### Configuration Files

| Pattern | Reason |
|---------|--------|
| `.env.example` | Template for environment |
| `*.yml`, `*.yaml` | Configuration (unless `.bak`) |
| `*.conf` | Configuration |
| `docker-compose*.yml` | Stack definitions |
| `Dockerfile*` | Container builds |

### Source Code

| Pattern | Reason |
|---------|--------|
| `*.py` | Python source |
| `*.js`, `*.ts` | JavaScript/TypeScript |
| `*.vue`, `*.svelte` | Frontend components |
| `*.xml` | Odoo views/data |

### Documentation

| Pattern | Reason |
|---------|--------|
| `*.md` | Documentation |
| `README*` | Project info |
| `LICENSE*` | Legal |
| `CHANGELOG*` | History |

### Lock/State Files

| Pattern | Reason |
|---------|--------|
| `audit/locks/*` | Baseline state |
| `package-lock.json` | Dependency versions |
| `yarn.lock` | Dependency versions |
| `*.lock` | Various locks |

### Git Files

| Pattern | Reason |
|---------|--------|
| `.git/` | Repository |
| `.gitignore` | Ignore rules |
| `.gitattributes` | Git settings |

---

## Cleanup Procedure

### Step 1: Dry Run

Always list files before deleting:

```bash
./scripts/cleanup_noise.sh
```

This will show:
- Files that match noise patterns
- File counts by type
- Total size

### Step 2: Review

Check the output for:
- Unexpected files
- Files that might contain important data
- Large backup files that might be needed

### Step 3: Apply (If Safe)

```bash
./scripts/cleanup_noise.sh --apply
```

### Step 4: Verify

```bash
git status
```

Ensure no important files were deleted.

---

## .gitignore Rules

The following should always be in `.gitignore`:

```gitignore
# OS files
.DS_Store
._*
Thumbs.db
desktop.ini

# Editor files
*.swp
*.swo
*~
.idea/
.vscode/

# Build artifacts
__pycache__/
*.pyc
*.pyo
.next/
dist/
build/

# Dependencies
node_modules/
venv/
.env/

# Environment (CRITICAL - never commit secrets)
.env
.env.local
.env.production

# Runtime exports
audit/runtime/

# Logs
*.log
logs/

# Temporary
*.tmp
*.temp
```

---

## Backup File Policy

### When to Keep Backups

- During active development/debugging
- Before risky operations
- When reverting might be needed

### When to Delete Backups

- After changes are committed and tested
- After 7+ days with no issues
- When cleanup script identifies them

### Backup Naming Convention

If you must create backups:

```bash
# BAD - hard to identify
config.bak
config.backup

# GOOD - includes date
config.yml.bak.20260129
docker-compose.yml.before_upgrade_20260129
```

---

## Server-Side Cleanup

On production servers, these directories can accumulate:

```bash
# Safe to clean periodically
/tmp/*
/var/tmp/*
/var/log/*.gz  # Old compressed logs

# Clean with caution
/srv/release_export/runtime_*  # Old exports (keep recent)
/var/log/traefik/*.log  # Traefik logs (keep recent)

# NEVER delete
/srv/stacks/*
/opt/seisei-*
/var/lib/docker/volumes/*
```

### Server Cleanup Script

```bash
# Clean old runtime exports (keep last 5)
cd /srv/release_export
ls -t | tail -n +6 | xargs rm -rf

# Clean old logs (keep last 7 days)
find /var/log -name "*.log" -mtime +7 -delete
find /var/log -name "*.gz" -mtime +30 -delete
```

---

## Disk Space Monitoring

### Warning Thresholds

| Threshold | Action |
|-----------|--------|
| 80% used | Review and cleanup |
| 90% used | Immediate cleanup |
| 95% used | Emergency cleanup |

### Quick Space Check

```bash
# Overall
df -h /

# Docker
docker system df

# Large files
du -sh /* 2>/dev/null | sort -rh | head -10
```

### Docker Cleanup

```bash
# Remove unused containers
docker container prune

# Remove unused images
docker image prune -a

# Remove unused volumes (CAREFUL - check first)
docker volume ls -f dangling=true
docker volume prune

# Full cleanup
docker system prune -a --volumes
```

---

## Automation

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
# Check for noise files
noise_count=$(find . -name ".DS_Store" -o -name "*.swp" | wc -l)
if [ "$noise_count" -gt 0 ]; then
    echo "Warning: $noise_count noise files found"
    echo "Run: ./scripts/cleanup_noise.sh --apply"
fi
```

### CI Check

```yaml
- name: Check for noise files
  run: |
    count=$(find . -name ".DS_Store" -o -name "*.bak" | wc -l)
    if [ "$count" -gt 0 ]; then
      echo "::warning::Found $count noise files"
    fi
```
