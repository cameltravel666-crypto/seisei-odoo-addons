#!/bin/bash
# OCR Service Diagnostic Script
# Run this on the production server to diagnose OCR service issues

echo "=================================================="
echo "OCR Service Diagnostic Report"
echo "Time: $(date)"
echo "=================================================="
echo ""

# Check if running on server
echo "[1] Server Check"
echo "-----------------"
hostname
echo ""

# Check Docker containers
echo "[2] OCR Service Containers"
echo "---------------------------"
docker ps -a | grep -E "ocr-service|ocr-db" || echo "❌ No OCR containers found"
echo ""

# Check container logs (last 50 lines)
echo "[3] OCR Service Logs (last 50 lines)"
echo "-------------------------------------"
if docker ps | grep -q "ocr-service"; then
    docker logs --tail 50 ocr-service 2>&1
else
    echo "❌ ocr-service container not running"
fi
echo ""

# Check OCR database logs
echo "[4] OCR Database Logs (last 20 lines)"
echo "--------------------------------------"
if docker ps | grep -q "ocr-db"; then
    docker logs --tail 20 ocr-db 2>&1
else
    echo "❌ ocr-db container not running"
fi
echo ""

# Check health endpoint
echo "[5] OCR Service Health Check"
echo "-----------------------------"
curl -sf http://localhost:8180/health 2>&1 || echo "❌ Health check failed"
echo ""

# Check from Docker host gateway (how Odoo containers access it)
echo "[6] OCR Service from Docker Gateway (172.17.0.1:8180)"
echo "------------------------------------------------------"
curl -sf http://172.17.0.1:8180/health 2>&1 || echo "❌ Cannot access from Docker gateway"
echo ""

# Check port listening
echo "[7] Port Listening Status"
echo "-------------------------"
netstat -tuln | grep 8180 || echo "❌ Port 8180 not listening"
echo ""

# Check Docker networks
echo "[8] Docker Networks"
echo "-------------------"
docker network ls | grep edge || echo "⚠️  'edge' network not found"
echo ""

# Check OCR service environment variables (without exposing secrets)
echo "[9] OCR Service Environment Variables"
echo "--------------------------------------"
if docker ps | grep -q "ocr-service"; then
    echo "Checking environment variables..."
    docker exec ocr-service env | grep -E "^(GEMINI_API_KEY|OCR_SERVICE_KEY|OCR_DATABASE_URL|OCR_FREE_QUOTA|OCR_PRICE_PER_IMAGE)=" | sed 's/=.*/=***HIDDEN***/'
else
    echo "❌ ocr-service container not running"
fi
echo ""

# Check stack directory
echo "[10] OCR Stack Configuration"
echo "----------------------------"
if [ -d "/srv/stacks/ocr" ]; then
    echo "✅ Stack directory exists"
    ls -la /srv/stacks/ocr/
    echo ""
    echo "Docker Compose Config:"
    cat /srv/stacks/ocr/docker-compose.yml
else
    echo "❌ Stack directory not found at /srv/stacks/ocr"
fi
echo ""

# Check disk space
echo "[11] Disk Space"
echo "---------------"
df -h | grep -E "Filesystem|/$"
echo ""

# Check Docker image
echo "[12] OCR Service Image"
echo "----------------------"
docker images | grep ocr-service || echo "❌ No OCR service image found"
echo ""

echo "=================================================="
echo "Diagnostic Complete"
echo "=================================================="
echo ""
echo "Common Issues & Solutions:"
echo "1. Container not running → Check logs above, restart with: cd /srv/stacks/ocr && sudo docker compose up -d"
echo "2. Health check failed → Check GEMINI_API_KEY in /srv/stacks/ocr/.env"
echo "3. Port not listening → Container may be crashed, check logs"
echo "4. Gateway access failed → Check Docker network configuration"
echo "5. Database connection failed → Check ocr-db container status"
echo ""
