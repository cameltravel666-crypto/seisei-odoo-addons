# Phase 1: GHCR Authentication Setup

**Status**: 🔄 In Progress
**Started**: 2026-02-01
**Estimated Duration**: 30 minutes

---

## Objective

Configure GitHub Container Registry (GHCR) authentication to enable pulling custom Docker images on both Staging and Production EC2 instances.

---

## Step 1: Create GitHub Personal Access Token (PAT)

### Instructions

1. **Navigate to GitHub Settings**:
   - Go to: https://github.com/settings/tokens
   - Click "Generate new token" → "Generate new token (classic)"

2. **Configure Token**:
   - **Note**: `GHCR Access for Seisei Odoo Deployment (2026)`
   - **Expiration**: `No expiration` (or `1 year` for better security)
   - **Scopes** (select these checkboxes):
     - ✅ `read:packages` - Download packages from GitHub Package Registry
     - ✅ `write:packages` - Upload packages to GitHub Package Registry
     - ✅ `delete:packages` - Delete packages from GitHub Package Registry (optional, for cleanup)

3. **Generate Token**:
   - Click "Generate token" at the bottom
   - **⚠️ CRITICAL**: Copy the token immediately (format: `ghp_...`)
   - You will NOT be able to see it again!

4. **Store Token Securely**:
   - Save token temporarily for next steps
   - Format: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

---

## Step 2: Add Token to GitHub Secrets

### Instructions

1. **Navigate to Repository Secrets**:
   - Go to: https://github.com/cameltravel666-crypto/seisei-odoo-addons/settings/secrets/actions

2. **Add New Secret**:
   - Click "New repository secret"
   - **Name**: `GHCR_PAT`
   - **Value**: Paste the token you just created (starting with `ghp_`)
   - Click "Add secret"

3. **Verify Secret**:
   - You should see `GHCR_PAT` in the list of secrets
   - GitHub will show when it was created

---

## Step 3: Configure Docker Login on Staging EC2

### Commands to Execute

```bash
# SSH into Staging EC2
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.178.13.108

# Test current GHCR access (should fail)
docker pull ghcr.io/cameltravel666-crypto/seisei-odoo18:latest

# Configure Docker login (replace YOUR_TOKEN with actual token)
echo "YOUR_TOKEN" | docker login ghcr.io -u cameltravel666-crypto --password-stdin

# Verify login success
docker pull ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:1db6436ca7e084705cffcf3e760b6659cce449bd636edf94917b28de2df3fbe5

# Check image details
docker images | grep seisei-odoo18
```

**Expected Output**:
```
Login Succeeded
sha256:1db6436ca7e084705cffcf3e760b6659cce449bd636edf94917b28de2df3fbe5: Pulling from cameltravel666-crypto/seisei-odoo18
...
Status: Downloaded newer image for ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:1db6436...
```

---

## Step 4: Configure Docker Login on Production EC2

### Commands to Execute

```bash
# SSH into Production EC2
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@57.180.39.58

# Configure Docker login (replace YOUR_TOKEN with actual token)
echo "YOUR_TOKEN" | docker login ghcr.io -u cameltravel666-crypto --password-stdin

# Verify login success
docker pull ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:1db6436ca7e084705cffcf3e760b6659cce449bd636edf94917b28de2df3fbe5

# Check image details
docker images | grep seisei-odoo18
```

---

## Step 5: Test Image Pull on Both Servers

### Verify Staging EC2

```bash
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.178.13.108 "docker images | grep ghcr.io"
```

### Verify Production EC2

```bash
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@57.180.39.58 "docker images | grep ghcr.io"
```

**Success Criteria**: Both servers should show the GHCR image downloaded successfully.

---

## Step 6: Update Staging to Use Custom GHCR Image

### Current State

Staging is using `IMAGE_REF=odoo:18.0` (official image) with temporary Python dependencies installed manually.

### Target State

Switch to `IMAGE_REF=ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:1db6436...` (custom image with baked-in dependencies).

### Commands

```bash
# SSH into Staging EC2
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.178.13.108

# Navigate to stack directory
cd /srv/stacks/odoo18-staging

# Update .env file
sudo nano .env
# Change:
#   IMAGE_REF=odoo:18.0
# To:
#   IMAGE_REF=ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:1db6436ca7e084705cffcf3e760b6659cce449bd636edf94917b28de2df3fbe5

# Pull new image
docker compose pull

# Recreate container with new image
docker compose up -d --force-recreate web

# Verify container is healthy
docker ps | grep odoo18-staging-web

# Check logs
docker logs odoo18-staging-web --tail 50

# Verify Python dependencies are available
docker exec odoo18-staging-web python3 -c "import fitz; print('PyMuPDF:', fitz.__version__)"
docker exec odoo18-staging-web python3 -c "import boto3; print('boto3:', boto3.__version__)"
```

**Expected Output**:
```
PyMuPDF: 1.24.0
boto3: 1.x.x
```

### Verify Web Access

```bash
# Test health endpoint
curl http://54.178.13.108:8069/web/health

# Expected: HTTP 200 OK
```

---

## Step 7: Verify Deployment

### Check Container Status

```bash
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.178.13.108 "docker ps --filter 'name=odoo18-staging'"
```

**Expected**:
- Status: `Up X minutes (healthy)`
- Image: `ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:1db6436...`

### Test Module Loading

Access http://54.178.13.108:8069 and verify:
- ✅ Database selector appears
- ✅ Can select and log into databases
- ✅ No Python dependency errors in logs
- ✅ Custom modules loaded successfully

---

## Rollback Plan

If anything goes wrong:

```bash
# SSH into affected server
ssh -i /Users/taozhang/Projects/Pem/odoo-2025.pem ubuntu@54.178.13.108

cd /srv/stacks/odoo18-staging

# Revert .env
sudo nano .env
# Change back to: IMAGE_REF=odoo:18.0

# Reinstall temporary dependencies
docker exec -u root odoo18-staging-web pip3 install --break-system-packages \
  PyMuPDF==1.24.0 boto3 qrcode openpyxl xlsxwriter \
  ofxparse qifparse google-api-python-client google-auth

# Restart container
docker compose restart web
```

---

## Success Criteria

- ✅ GitHub PAT created with correct scopes
- ✅ `GHCR_PAT` added to GitHub Secrets
- ✅ Docker login configured on Staging EC2
- ✅ Docker login configured on Production EC2
- ✅ Can pull custom images from GHCR without authentication errors
- ✅ Staging container running with custom GHCR image
- ✅ All Python dependencies available (no temporary installation needed)
- ✅ Odoo accessible and functional

---

## Next Steps (Phase 2)

After Phase 1 completion:
- Generate strong passwords for RDS and admin credentials
- Configure AWS SSM Parameter Store for secrets management
- Begin database migration to RDS

---

**Document Version**: 1.0
**Last Updated**: 2026-02-01 03:15 UTC
