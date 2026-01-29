# OCR Service Quick Fix Guide

## Problem: "OCR failed: OCR処理に失敗しました"

When you see this error in Odoo after clicking "Send to OCR", follow these steps to diagnose and fix the issue.

## Step 1: SSH to Production Server

```bash
ssh ubuntu@54.65.127.141
```

## Step 2: Run Diagnostic Script

```bash
cd /srv/stacks/ocr
curl -sL https://raw.githubusercontent.com/cameltravel666-crypto/seisei-odoo-addons/main/scripts/diagnose_ocr.sh | bash
```

Or if you have the repository locally:
```bash
cd /path/to/seisei-odoo-addons
bash scripts/diagnose_ocr.sh
```

This will show:
- ✅ What's working correctly
- ❌ What's broken
- ⚠️  Warnings about potential issues

## Step 3: Interpret Results

### Common Scenarios

#### Scenario A: Container Not Running
```
❌ No OCR containers found
```
**Fix:** Run the fix script (Step 4)

#### Scenario B: Health Check Failed
```
✅ ocr-service container running
❌ Health check failed
```
**Fix:** Check logs for the actual error:
```bash
docker logs ocr-service --tail 100
```

Common errors:
- `GEMINI_API_KEY not configured` → Update .env file
- `Database unavailable` → Check ocr-db container
- `Permission denied` → Check file permissions

#### Scenario C: Gateway Access Failed
```
✅ Health check: http://localhost:8180/health works
❌ Cannot access from Docker gateway (172.17.0.1)
```
**Fix:** Network configuration issue, run fix script

## Step 4: Run Auto-Fix Script

```bash
cd /srv/stacks/ocr
bash /path/to/seisei-odoo-addons/scripts/fix_ocr.sh
```

This script will:
1. Check environment variables
2. Create Docker network if needed
3. Stop old containers
4. Pull latest images
5. Start services
6. Wait for services to be ready
7. Test health endpoints

## Step 5: Manual Fixes (If Auto-Fix Fails)

### Fix A: Update Environment Variables

```bash
cd /srv/stacks/ocr
sudo vi .env
```

Ensure these variables are set:
```bash
GITHUB_REPO_OWNER=cameltravel666-crypto
OCR_IMAGE_TAG=latest
GEMINI_API_KEY=<your-actual-gemini-api-key>
OCR_SERVICE_KEY=<your-secret-service-key>
OCR_DB_PASSWORD=<your-db-password>
OCR_FREE_QUOTA=30
OCR_PRICE_PER_IMAGE=20
```

Then restart:
```bash
sudo docker compose restart
```

### Fix B: Check Odoo Configuration

Verify Odoo containers have the correct environment variables:

```bash
docker exec seisei-project-web-1 env | grep OCR_SERVICE

# Should show:
# OCR_SERVICE_URL=http://172.17.0.1:8180/api/v1
# OCR_SERVICE_KEY=<same-key-as-ocr-service>
```

If wrong or missing, update Odoo's environment variables and restart:
```bash
cd /srv/stacks/odoo-prod  # or wherever Odoo is deployed
sudo vi .env
sudo docker compose restart
```

### Fix C: Check Gemini API Key

Test if Gemini API key is valid:
```bash
# Extract API key from .env (be careful, this shows the key!)
cd /srv/stacks/ocr
API_KEY=$(grep GEMINI_API_KEY .env | cut -d'=' -f2)

# Test API call
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"test"}]}]}'
```

If you get an error like "API key not valid", you need to:
1. Go to https://aistudio.google.com/app/apikey
2. Create a new API key or verify existing one
3. Update .env file
4. Restart OCR service

### Fix D: Rebuild from Scratch

If nothing works, rebuild everything:

```bash
cd /srv/stacks/ocr

# Stop and remove everything
sudo docker compose down -v

# Remove old images
sudo docker images | grep ocr-service | awk '{print $3}' | xargs sudo docker rmi -f

# Login to GitHub Container Registry
echo $GHCR_PAT | sudo docker login ghcr.io -u cameltravel666-crypto --password-stdin

# Pull latest and start
sudo docker compose pull
sudo docker compose up -d

# Wait and check
sleep 30
curl http://localhost:8180/health
```

## Step 6: Test from Odoo

1. Log in to Odoo: https://demo.nagashiro.top/odoo
2. Go to Accounting > Vendors > Bills
3. Open any bill with an attachment
4. Click "Send to OCR"
5. Should succeed within 10-30 seconds

## Still Not Working?

### Collect Full Diagnostic Info

```bash
cd /srv/stacks/ocr
bash /path/to/seisei-odoo-addons/scripts/diagnose_ocr.sh > ocr_diagnostic_$(date +%Y%m%d_%H%M%S).txt 2>&1

# Send the file for analysis
```

### Check Recent Deployments

Maybe a recent deployment broke something:

```bash
# On your local machine (not server)
cd /path/to/seisei-odoo-addons
gh run list --workflow="OCR Service Build & Deploy" --limit 5

# Check logs of the most recent run
gh run view <run-id> --log
```

### Emergency Rollback

If you know a specific version that worked:

```bash
cd /srv/stacks/ocr
sudo vi .env

# Change OCR_IMAGE_TAG to a specific SHA or tag
OCR_IMAGE_TAG=sha-abc1234

# Restart
sudo docker compose pull
sudo docker compose up -d
```

## Prevention

To avoid this issue in the future:

1. **Monitor Health**: Set up a cron job to check health endpoint
```bash
# Add to crontab
*/5 * * * * curl -sf http://localhost:8180/health || echo "OCR service down!" | mail -s "Alert: OCR down" admin@example.com
```

2. **Check Logs Regularly**
```bash
docker logs ocr-service --tail 100
```

3. **Keep Gemini API Key Valid**: Monitor usage and quota at https://aistudio.google.com/

4. **Update .env Template**: Keep a template .env file in a secure location for quick recovery

## Quick Reference

```bash
# Check status
docker ps | grep ocr

# View logs
docker logs -f ocr-service

# Restart service
cd /srv/stacks/ocr && sudo docker compose restart

# Full restart
cd /srv/stacks/ocr && sudo docker compose down && sudo docker compose up -d

# Test health
curl http://localhost:8180/health
curl http://172.17.0.1:8180/health

# Check from inside Odoo container
docker exec seisei-project-web-1 curl -sf http://172.17.0.1:8180/health
```
