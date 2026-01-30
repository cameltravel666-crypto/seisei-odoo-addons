# Drift Detection Examples

This document shows example outputs from `./scripts/drift_check.sh`.

## Example 1: PASS (No Drift)

```bash
$ ./scripts/drift_check.sh --local
========================================
  Drift Check - 20260129_153042
  Mode: local
========================================

[INFO] Checking lock files exist...
[PASS] All required lock files present
[INFO] Checking compose file hashes...
[PASS] All compose files match baseline
[INFO] Checking Odoo addon hashes...
[PASS] All addon modules match baseline

========================================
  SUMMARY
========================================
Total checks: 3
Passed: 3
Failed: 0

OVERALL: PASS

Report: audit/runtime/20260129_153042/drift_report.json
```

### JSON Report (PASS)

```json
{
  "timestamp": "20260129_153042",
  "mode": "local",
  "checks": [
    {
      "name": "lock_files_exist",
      "status": "PASS",
      "details": ""
    },
    {
      "name": "compose_hashes",
      "status": "PASS",
      "details": ""
    },
    {
      "name": "addon_hashes",
      "status": "PASS",
      "details": ""
    }
  ],
  "summary": {
    "total": 3,
    "passed": 3,
    "failed": 0
  },
  "overall": "PASS"
}
```

---

## Example 2: FAIL (Drift Detected)

```bash
$ ./scripts/drift_check.sh --local
========================================
  Drift Check - 20260129_154215
  Mode: local
========================================

[INFO] Checking lock files exist...
[PASS] All required lock files present
[INFO] Checking compose file hashes...
[FAIL] Compose drift: infra/stacks/edge-traefik/docker-compose.yml
[FAIL] Compose drift: infra/stacks/odoo18-prod/docker-compose.yml
[INFO] Checking Odoo addon hashes...
[FAIL] Addon drift: qr_ordering
[FAIL] Addon drift: custom_ocr_finance

========================================
  SUMMARY
========================================
Total checks: 3
Passed: 1
Failed: 2

OVERALL: FAIL

Report: audit/runtime/20260129_154215/drift_report.json
```

### JSON Report (FAIL)

```json
{
  "timestamp": "20260129_154215",
  "mode": "local",
  "checks": [
    {
      "name": "lock_files_exist",
      "status": "PASS",
      "details": ""
    },
    {
      "name": "compose_hashes",
      "status": "FAIL",
      "details": "2 files drifted: infra/stacks/edge-traefik/docker-compose.yml;infra/stacks/odoo18-prod/docker-compose.yml;"
    },
    {
      "name": "addon_hashes",
      "status": "FAIL",
      "details": "2 modules drifted: qr_ordering;custom_ocr_finance;"
    }
  ],
  "summary": {
    "total": 3,
    "passed": 1,
    "failed": 2
  },
  "overall": "FAIL"
}
```

---

## Example 3: Server Mode

```bash
$ ./scripts/drift_check.sh --server 54.65.127.141 --ssh-key ~/Projects/Pem/odoo-2025.pem
========================================
  Drift Check - 20260129_160030
  Mode: server
========================================

[INFO] Checking lock files exist...
[PASS] All required lock files present
[INFO] Running server-side drift checks on 54.65.127.141...
[PASS] Server state collected successfully
[PASS] Docker images match baseline

========================================
  SUMMARY
========================================
Total checks: 2
Passed: 2
Failed: 0

OVERALL: PASS

Report: audit/runtime/20260129_160030/drift_report.json
```

---

## Interpreting Results

### PASS Conditions

All checks pass when:
- All required lock files exist in `audit/locks/`
- Compose file SHA256 hashes match lock file
- Addon module hashes match lock file
- (Server mode) Docker image tags/IDs match

### FAIL Conditions

Checks fail when:
- Lock files are missing
- Compose files have been modified
- Addon code has changed
- Docker images differ from baseline

### Common Drift Causes

| Drift Type | Likely Cause | Resolution |
|------------|--------------|------------|
| Compose hash mismatch | Config changes not committed | Commit changes, update lock |
| Addon hash mismatch | Code changes not in baseline | Update addon lock file |
| Image version mismatch | Container rebuilt with new image | Document upgrade, update lock |
| Missing lock file | New export not run | Run `export_runtime_state.sh` |

---

## Resolving Drift

### Option 1: Update Baseline (Drift is Intentional)

```bash
# Export new runtime state
./scripts/export_runtime_state.sh

# Copy new locks to baseline
cp audit/runtime/*/docker_images.lock.json audit/locks/
cp audit/runtime/*/compose_sha256.lock.txt audit/locks/
cp audit/runtime/*/odoo_addons_modules.hash.txt audit/locks/

# Verify
./scripts/drift_check.sh --local

# Commit
git add audit/locks/
git commit -m "Update baseline locks for main1.0.x"
```

### Option 2: Revert Changes (Drift is Unintentional)

```bash
# Identify what changed
git diff infra/stacks/

# Revert to baseline
git checkout HEAD -- infra/stacks/edge-traefik/docker-compose.yml

# Redeploy if needed
cd /srv/stacks/edge-traefik && docker compose up -d
```

### Option 3: Investigate Discrepancy

```bash
# Compare local vs server
./scripts/export_runtime_state.sh  # On server
scp ubuntu@server:/srv/release_export/runtime_*/compose_sha256.lock.txt /tmp/

# Diff
diff audit/locks/compose_sha256.lock.txt /tmp/compose_sha256.lock.txt
```

---

## Automation

### CI/CD Integration

Add to CI pipeline:
```yaml
- name: Drift Check
  run: ./scripts/drift_check.sh --local
  continue-on-error: false
```

### Scheduled Checks

Add to crontab on production server:
```bash
0 8 * * * /opt/seisei-main/scripts/drift_check.sh --local >> /var/log/drift_check.log 2>&1
```

### Alerting

Parse JSON report for monitoring:
```bash
STATUS=$(jq -r '.overall' audit/runtime/*/drift_report.json)
if [ "$STATUS" == "FAIL" ]; then
  # Send alert
  curl -X POST "$SLACK_WEBHOOK" -d '{"text":"Drift detected in production!"}'
fi
```
