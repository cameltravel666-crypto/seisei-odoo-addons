# Odoo 18 Staging Deployment Status

**Last Updated**: 2026-02-01 02:59 UTC
**Environment**: Staging (13.231.24.250)
**Status**: ✅ OPERATIONAL (with temporary workarounds)

## 🎯 Current Deployment

### Infrastructure Overview

```
EC2: 13.231.24.250 (i-07431aa34ec66a65d)
Region: ap-northeast-1
OS: Ubuntu

Containers:
├── odoo18-staging-web (✅ Healthy)
│   ├── Image: odoo:18.0 (official)
│   ├── Workers: 4 HTTP + 2 Cron
│   ├── Ports: 8069 (HTTP), 8072 (Long Polling)
│   └── Memory Limit: 3G
│
└── odoo18-staging-redis (✅ Healthy)
    ├── Image: redis:7-alpine
    ├── Memory: 256MB maxmemory
    └── Persistence: AOF + RDB snapshots
```

### Database Configuration

```
Type: AWS RDS PostgreSQL
Endpoint: seisei-odoo18-staging-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com
Port: 5432
User: odoo18
SSL: Required
Max Connections: 64
```

### Volume Mounts (Custom Addons)

```yaml
volumes:
  - /opt/seisei-odoo-addons/odoo_modules/seisei:/mnt/extra-addons/seisei:ro
  - /opt/seisei-odoo-addons/odoo_modules/community:/mnt/extra-addons/community:ro
  - ./config/odoo.conf:/etc/odoo/odoo.conf:ro
  - odoo18-staging-data:/var/lib/odoo
```

**Addons Loading Order**:
1. `/usr/lib/python3/dist-packages/odoo/addons` (Odoo core)
2. `/var/lib/odoo/addons/18.0` (auto-installed)
3. `/mnt/extra-addons/seisei` (custom modules)
4. `/mnt/extra-addons/community` (community modules)

## ⚠️  Critical: Temporary Python Dependencies

### Problem

Official `odoo:18.0` image **does not include** Python packages required by custom community addons.

### Affected Modules

| Module | Required Package | Purpose |
|--------|-----------------|---------|
| `base_accounting_kit` | `ofxparse`, `qifparse` | Bank statement import |
| `odoo_ocr_final` | `PyMuPDF==1.24.0` | PDF processing |
| `seisei_s3_attachment` | `boto3` | AWS S3 storage |
| `qr_ordering` | `qrcode` | QR code generation |
| `seisei_gdoc_import` | `google-api-python-client`, `google-auth` | Google Docs import |

### Temporary Fix (⚠️ NOT PERSISTENT)

```bash
docker exec -u root odoo18-staging-web pip3 install --break-system-packages \
  PyMuPDF==1.24.0 boto3 qrcode openpyxl xlsxwriter \
  ofxparse qifparse google-api-python-client google-auth
```

**⚠️ WARNING**: These packages are installed **inside the running container**. They will be **lost** if:
- Container is recreated (`docker compose up -d --force-recreate`)
- Container is deleted (`docker compose down`)
- Image is updated

### Permanent Solutions

#### ✅ Option A: Use Custom GHCR Image (Recommended)

**Status**: Image built ✅, but GHCR authentication blocked ❌

**Built Image**:
```
ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:d6c8d71e1f15c58e2308f37bc782e9ecc1e36e1a9a015644b7523a12e0d7ec42
```

**Blocker**: Current GitHub token lacks `read:packages` scope

**Resolution Steps**:
1. Create new GitHub Personal Access Token with scopes:
   - `read:packages` (pull images)
   - `write:packages` (push images)
2. Store in GitHub Secrets as `GHCR_PAT`
3. Configure Docker login on EC2:
   ```bash
   echo "$GHCR_PAT" | docker login ghcr.io -u cameltravel666-crypto --password-stdin
   ```
4. Update `.env`:
   ```bash
   IMAGE_REF=ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:d6c8d71e...
   ```
5. Deploy:
   ```bash
   docker compose pull && docker compose up -d
   ```

#### Option B: Create Wrapper Dockerfile

Create `infra/stacks/odoo18-staging/Dockerfile.wrapper`:
```dockerfile
FROM odoo:18.0

USER root
RUN pip3 install --no-cache-dir --break-system-packages \
    PyMuPDF==1.24.0 \
    boto3 \
    qrcode \
    openpyxl \
    xlsxwriter \
    ofxparse \
    qifparse \
    google-api-python-client \
    google-auth

USER odoo
```

Then build locally or in CI pipeline.

## 📝 Migration History

### 2026-02-01: Migration from server-apps to seisei-odoo-addons

**Completed Actions**:
1. ✅ Stopped legacy containers from `/opt/server-apps`
2. ✅ Archived old config: `/opt/server-apps` → `/opt/server-apps.backup-20260201`
3. ✅ Created Docker networks: `seisei-odoo-network`, `edge`
4. ✅ Updated `odoo.conf`:
   - `list_db = True` (enable database selector)
   - `dbfilter = .*` (allow IP-based access)
5. ✅ Added volume mounts for custom addons
6. ✅ Installed Python dependencies (temporary)
7. ✅ Verified deployment health

**Git Commits**:
- **PR #1** (`6c15b69`): `fix(staging): Update Odoo config for RDS and IP-based access`
- **PR #2** (`d1f8c5e`): `fix(staging): Enable database selector and mount custom addons as volumes`

**Build Artifacts**:
- GitHub Actions Run: #21555252614
- Custom Image Digest: `sha256:d6c8d71e1f15c58e2308f37bc782e9ecc1e36e1a9a015644b7523a12e0d7ec42`
- Manifest: Available as artifact `image-digests`

## 🔐 Security Issues

### 1. Hardcoded Credentials in Config Files

**File**: `infra/stacks/odoo18-staging/config/odoo.conf`

```ini
db_password = Wind1982        # ⚠️ Hardcoded
admin_passwd = admin123       # ⚠️ Hardcoded
```

**Risk**: Medium
- Credentials in version control
- Visible to all with repo access
- Default/weak passwords

**Mitigation** (To-Do):
1. Rotate both passwords immediately
2. Move to AWS SSM Parameter Store
3. Use environment variable substitution in docker-compose
4. Remove plaintext values from odoo.conf

### 2. Missing S3 Credentials

**File**: `infra/stacks/odoo18-staging/.env`

```bash
SEISEI_S3_ACCESS_KEY=    # Empty
SEISEI_S3_SECRET_KEY=    # Empty
```

**Impact**: S3 attachment storage not working

**Error Log**:
```
ERROR seisei_s3_attachment: Failed to read from S3:
AuthorizationHeaderMalformed - non-empty Access Key (AKID) must be provided
```

**Fix**: Add valid AWS credentials to `.env`

## 🚀 Access & Testing

### Web Access

- **Main**: http://13.231.24.250:8069
- **Database Selector**: http://13.231.24.250:8069/web/database/selector
- **Health Check**: http://13.231.24.250:8069/web/health

### Available Databases (RDS)

- `tpl_production`
- `tpl_realestate`
- `tpl_restaurant`
- `tpl_retail`
- `tpl_service`
- `tpl_consulting`
- `odoo18_staging`
- `ten_testodoo`
- `ten_00000001` - `ten_00000004`
- `seisei-project`

### Health Check Results

```bash
$ curl http://13.231.24.250:8069/web/health
✅ 200 OK

$ docker ps --filter 'name=odoo18-staging'
odoo18-staging-web     Up 10 minutes (healthy)
odoo18-staging-redis   Up 10 minutes (healthy)
```

## 📋 Next Steps

### Immediate (Critical)

- [ ] **Configure GHCR Authentication**
  - Create GitHub PAT with `read:packages` scope
  - Add to GitHub Secrets
  - Test Docker pull from EC2

- [ ] **Switch to Custom GHCR Image**
  - Update `.env` with digest reference
  - Redeploy with `docker compose pull && up -d`
  - Verify all modules load correctly

- [ ] **Rotate Credentials**
  - Generate strong passwords for `db_password` and `admin_passwd`
  - Update RDS password
  - Update odoo.conf with environment variables

### Short-term (High Priority)

- [ ] **Add S3 Credentials**
  - Create IAM user for Odoo with S3 permissions
  - Add credentials to `.env`
  - Test attachment upload/download

- [ ] **Document Deployment Process**
  - Create `docs/DEPLOYMENT_GUIDE.md`
  - Document GHCR authentication setup
  - Add troubleshooting section

- [ ] **Set Up Automated Deployment**
  - Configure GitHub Actions deploy workflow
  - Add deployment secrets to GitHub
  - Test end-to-end deployment

### Long-term (Optimization)

- [ ] Implement AWS Secrets Manager integration
- [ ] Configure CloudWatch logging
- [ ] Add automated smoke tests post-deployment
- [ ] Document disaster recovery procedures
- [ ] Set up staging → production promotion workflow

## 🛠 Troubleshooting

### Container Won't Start

```bash
# Check logs
ssh ubuntu@13.231.24.250 "docker logs odoo18-staging-web --tail 100"

# Check dependencies
ssh ubuntu@13.231.24.250 "docker exec odoo18-staging-web pip3 list | grep PyMuPDF"

# Restart container
ssh ubuntu@13.231.24.250 "cd /opt/seisei-odoo-addons/infra/stacks/odoo18-staging && docker compose restart web"
```

### Module Loading Errors

```bash
# Verify volume mounts
docker exec odoo18-staging-web ls -la /mnt/extra-addons/seisei
docker exec odoo18-staging-web ls -la /mnt/extra-addons/community

# Check addons path in config
docker exec odoo18-staging-web cat /etc/odoo/odoo.conf | grep addons_path
```

### Database Connection Issues

```bash
# Test RDS connectivity
psql -h seisei-odoo18-staging-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com \
     -U odoo18 -d postgres

# Check SSL mode
# Connection requires: sslmode=require
```

### Python Package Missing

**Symptom**: `ModuleNotFoundError: No module named 'fitz'`

**Cause**: Temporary pip install was lost (container recreated)

**Fix**: Reinstall packages or use GHCR custom image

```bash
docker exec -u root odoo18-staging-web pip3 install --break-system-packages PyMuPDF boto3 qrcode ofxparse qifparse google-api-python-client google-auth openpyxl xlsxwriter
docker compose restart web
```

## 📚 References

- **Repository**: https://github.com/cameltravel666-crypto/seisei-odoo-addons
- **Docker Compose**: `infra/stacks/odoo18-staging/docker-compose.yml`
- **Configuration**: `infra/stacks/odoo18-staging/config/odoo.conf`
- **Custom Dockerfile**: `infra/stacks/odoo18-prod/Dockerfile`
- **CI/CD**: `.github/workflows/build_ghcr.yml`, `.github/workflows/deploy.yml`

---

**Deployed**: 2026-02-01 02:51 UTC
**Last Verified**: 2026-02-01 02:59 UTC
**Deployment Method**: Docker Compose + Volume Mounts (官方镜像 + 临时依赖)
