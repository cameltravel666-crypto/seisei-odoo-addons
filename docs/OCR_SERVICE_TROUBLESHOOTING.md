# OCR Service Troubleshooting Guide

## Overview

This guide helps diagnose and fix issues with the central OCR service when you see errors like:
- "OCR failed: OCR処理に失敗しました"
- "OCR service unavailable"
- Timeout errors when processing images

## Architecture

```
Odoo Container → http://172.17.0.1:8180 → OCR Service Container → Gemini API
                                      ↓
                                  OCR Database (PostgreSQL)
```

The OCR service runs as a separate Docker container and is accessed by Odoo containers through the Docker host gateway (172.17.0.1:8180).

## Quick Diagnosis

### On Production Server

```bash
# Run diagnostic script
cd /srv/stacks/ocr
bash <(curl -s https://raw.githubusercontent.com/.../diagnose_ocr.sh)

# Or manually check:
# 1. Check containers
docker ps -a | grep ocr

# 2. Check health
curl http://localhost:8180/health

# 3. Check logs
docker logs ocr-service --tail 100
```

## Common Issues & Solutions

### 1. OCR Service Container Not Running

**Symptoms:**
- `docker ps` shows no ocr-service container
- Odoo shows "OCR service unavailable"

**Solution:**
```bash
cd /srv/stacks/ocr
sudo docker compose up -d

# Wait 15 seconds, then check
curl http://localhost:8180/health
```

**Root Causes:**
- Container crashed due to missing environment variables
- Out of memory
- Docker daemon restarted

### 2. Container Running But Unhealthy

**Symptoms:**
- `docker ps` shows ocr-service running
- Health check fails: `curl http://localhost:8180/health` returns error

**Diagnosis:**
```bash
# Check logs for errors
docker logs ocr-service --tail 100

# Common errors to look for:
# - "GEMINI_API_KEY not configured"
# - "Database unavailable"
# - Python exceptions
```

**Solutions:**

**A. Missing/Invalid Gemini API Key**
```bash
cd /srv/stacks/ocr

# Check if GEMINI_API_KEY is set
grep GEMINI_API_KEY .env

# If missing or invalid, update .env:
sudo vi .env
# Add or update: GEMINI_API_KEY=your-actual-key

# Restart service
sudo docker compose restart
```

**B. Database Connection Failed**
```bash
# Check database container
docker ps | grep ocr-db

# Check database logs
docker logs ocr-db --tail 50

# If database is down, restart both services
cd /srv/stacks/ocr
sudo docker compose down
sudo docker compose up -d
```

**C. Service Key Mismatch**
```bash
# The OCR_SERVICE_KEY in the OCR service must match
# the OCR_SERVICE_KEY in Odoo containers

# Check OCR service key (without revealing it)
docker exec ocr-service env | grep OCR_SERVICE_KEY

# Check Odoo service key
docker exec seisei-project-web-1 env | grep OCR_SERVICE_KEY

# If they don't match, update .env files and restart
```

### 3. Port Not Accessible from Containers

**Symptoms:**
- Health check works: `curl http://localhost:8180/health` ✅
- Gateway check fails: `curl http://172.17.0.1:8180/health` ❌
- Odoo shows "Connection refused" in logs

**Diagnosis:**
```bash
# Check port binding
netstat -tuln | grep 8180

# Should show:
# tcp        0      0 127.0.0.1:8180          0.0.0.0:*               LISTEN
```

**Solution:**
The docker-compose.yml should bind to `127.0.0.1:8180`, which Docker automatically makes available to containers via 172.17.0.1.

If this doesn't work:
```bash
# Check Docker network
docker network ls | grep edge

# Recreate edge network
sudo docker network rm edge 2>/dev/null || true
sudo docker network create edge

# Restart OCR service
cd /srv/stacks/ocr
sudo docker compose down
sudo docker compose up -d
```

### 4. Gemini API Rate Limiting

**Symptoms:**
- Occasional failures during peak times
- OCR service logs show "Rate limited" or "429" errors

**Solution:**
The OCR service has built-in retry logic with exponential backoff. If issues persist:

1. Check Gemini API quota: https://aistudio.google.com/app/apikey
2. Consider upgrading Gemini API tier
3. Implement client-side rate limiting in Odoo (coming soon)

### 5. Service Works Intermittently

**Symptoms:**
- Sometimes works, sometimes fails
- No obvious pattern

**Possible Causes:**

**A. Memory Issues**
```bash
# Check container memory usage
docker stats ocr-service --no-stream

# Check system memory
free -h

# If memory is low, increase container limits or add swap
```

**B. Gemini API Timeouts**
```bash
# Check logs for timeout errors
docker logs ocr-service | grep -i timeout

# Adjust timeout in Odoo client code if needed
# (default: 120 seconds)
```

**C. Database Connection Pool Exhausted**
```bash
# Check database connections
docker exec ocr-db psql -U ocr -d ocr_service -c "SELECT count(*) FROM pg_stat_activity;"

# If too many connections, check for connection leaks in code
```

## Environment Variables Reference

### Required Variables (in /srv/stacks/ocr/.env)

```bash
# GitHub Container Registry
GITHUB_REPO_OWNER=your-org
OCR_IMAGE_TAG=latest

# Gemini API Configuration
GEMINI_API_KEY=your-gemini-api-key-here

# Service Authentication
OCR_SERVICE_KEY=your-secret-service-key

# Database Configuration
OCR_DB_PASSWORD=your-database-password

# Pricing Configuration (optional)
OCR_FREE_QUOTA=30              # Free images per tenant per month
OCR_PRICE_PER_IMAGE=20         # Price in JPY per image after quota
```

### Required Variables (in Odoo containers)

```bash
# In Odoo container .env or environment
OCR_SERVICE_URL=http://172.17.0.1:8180/api/v1
OCR_SERVICE_KEY=same-as-ocr-service-key-above
```

## Manual Service Management

### Start Services
```bash
cd /srv/stacks/ocr
sudo docker compose up -d
```

### Stop Services
```bash
cd /srv/stacks/ocr
sudo docker compose down
```

### Restart Services
```bash
cd /srv/stacks/ocr
sudo docker compose restart
```

### View Logs
```bash
# Follow logs in real-time
docker logs -f ocr-service

# Last 100 lines
docker logs --tail 100 ocr-service

# With timestamps
docker logs --tail 100 --timestamps ocr-service
```

### Execute Commands in Container
```bash
# Open shell
docker exec -it ocr-service /bin/sh

# Check Python version
docker exec ocr-service python --version

# Test database connection
docker exec ocr-service python -c "import asyncpg; print('asyncpg OK')"
```

## Testing OCR Service

### Test Health Endpoint
```bash
curl http://localhost:8180/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.2.0",
  "prompts": ["fast", "full"],
  "timestamp": "2025-01-29T10:00:00.000000"
}
```

### Test OCR Processing (requires service key)
```bash
# Create test image (base64 encoded)
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" > test_image.b64

# Test OCR request
curl -X POST http://localhost:8180/api/v1/ocr/process \
  -H "Content-Type: application/json" \
  -H "X-Service-Key: your-service-key" \
  -d '{
    "image_data": "'$(cat test_image.b64)'",
    "mime_type": "image/png",
    "tenant_id": "test",
    "prompt_version": "fast"
  }'
```

## Monitoring & Maintenance

### Check Usage Statistics
```bash
# Get usage for specific tenant
curl -H "X-Service-Key: your-key" \
  "http://localhost:8180/api/v1/usage/tenant-id?year_month=2025-01"

# Get all tenants usage
curl -H "X-Service-Key: your-key" \
  "http://localhost:8180/api/v1/usage?year_month=2025-01"
```

### Database Maintenance
```bash
# Backup database
docker exec ocr-db pg_dump -U ocr ocr_service > ocr_backup_$(date +%Y%m%d).sql

# Check database size
docker exec ocr-db psql -U ocr -d ocr_service -c "SELECT pg_size_pretty(pg_database_size('ocr_service'));"

# Clean old request logs (older than 90 days)
docker exec ocr-db psql -U ocr -d ocr_service -c "DELETE FROM ocr_requests WHERE request_time < NOW() - INTERVAL '90 days';"
```

## Getting Help

### Collect Diagnostic Information

Run this command and share the output:
```bash
cd /srv/stacks/ocr
bash diagnose_ocr.sh > ocr_diagnostic_$(date +%Y%m%d_%H%M%S).txt 2>&1
```

### Check Recent Deployments

```bash
# View recent GitHub Actions deployments
gh run list --workflow="OCR Service Build & Deploy" --limit 5
```

### Contact Information

- GitHub Issues: https://github.com/your-org/seisei-odoo-addons/issues
- For urgent production issues, contact the DevOps team

## Prevention

### Regular Maintenance Checklist

- [ ] Weekly: Check container logs for errors
- [ ] Weekly: Verify health endpoint responds
- [ ] Monthly: Review usage statistics
- [ ] Monthly: Check database size and clean old logs
- [ ] Quarterly: Test failover and recovery procedures
- [ ] Quarterly: Review and update Gemini API quotas

### Monitoring Setup (Recommended)

Consider setting up monitoring for:
- Container uptime and restarts
- Health endpoint status
- API response times
- Error rates
- Database connection pool usage
- Gemini API quota usage
