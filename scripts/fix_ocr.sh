#!/bin/bash
# OCR Service Quick Fix Script
# Run this on the production server to attempt automatic fixes

set -e

echo "=================================================="
echo "OCR Service Quick Fix"
echo "Time: $(date)"
echo "=================================================="
echo ""

STACK_DIR="/srv/stacks/ocr"

# Check if we're root or have sudo
if [ "$EUID" -ne 0 ]; then
    SUDO="sudo"
else
    SUDO=""
fi

# Navigate to stack directory
if [ ! -d "$STACK_DIR" ]; then
    echo "❌ Error: Stack directory $STACK_DIR not found"
    echo "Please run OCR service deployment workflow first"
    exit 1
fi

cd $STACK_DIR
echo "✅ Working in $STACK_DIR"
echo ""

# Show current status
echo "[1] Current Container Status"
echo "----------------------------"
$SUDO docker ps -a | grep -E "CONTAINER|ocr-service|ocr-db"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found"
    echo "Please ensure .env file exists with required variables:"
    echo "  - GEMINI_API_KEY"
    echo "  - OCR_SERVICE_KEY"
    echo "  - OCR_DB_PASSWORD"
    exit 1
fi

echo "✅ .env file found"
echo ""

# Check for required environment variables (without showing values)
echo "[2] Checking Environment Variables"
echo "-----------------------------------"
missing_vars=0
for var in GEMINI_API_KEY OCR_SERVICE_KEY OCR_DB_PASSWORD; do
    if grep -q "^${var}=" .env && ! grep -q "^${var}=$" .env; then
        echo "✅ $var is set"
    else
        echo "❌ $var is missing or empty"
        missing_vars=$((missing_vars + 1))
    fi
done

if [ $missing_vars -gt 0 ]; then
    echo ""
    echo "❌ Error: Missing required environment variables"
    echo "Please update .env file with required secrets"
    exit 1
fi
echo ""

# Create edge network if not exists
echo "[3] Checking Docker Network"
echo "---------------------------"
if ! $SUDO docker network ls | grep -q "edge"; then
    echo "Creating 'edge' network..."
    $SUDO docker network create edge
    echo "✅ Network created"
else
    echo "✅ 'edge' network exists"
fi
echo ""

# Stop and remove old containers
echo "[4] Stopping Old Containers"
echo "---------------------------"
$SUDO docker compose down 2>/dev/null || true
echo "✅ Old containers stopped"
echo ""

# Pull latest images
echo "[5] Pulling Latest Images"
echo "-------------------------"
$SUDO docker compose pull
echo "✅ Images pulled"
echo ""

# Start services
echo "[6] Starting Services"
echo "---------------------"
$SUDO docker compose up -d
echo "✅ Services started"
echo ""

# Wait for services to be ready
echo "[7] Waiting for Services (30 seconds)"
echo "--------------------------------------"
sleep 30

# Check container status
echo "[8] Checking Container Status"
echo "------------------------------"
$SUDO docker ps | grep -E "ocr-service|ocr-db"
echo ""

# Test health endpoint
echo "[9] Testing Health Endpoint"
echo "---------------------------"
if curl -sf http://localhost:8180/health; then
    echo ""
    echo "✅ OCR service is healthy!"
else
    echo ""
    echo "❌ Health check failed"
    echo ""
    echo "Checking logs..."
    $SUDO docker logs --tail 50 ocr-service
    exit 1
fi
echo ""

# Test from Docker gateway
echo "[10] Testing from Docker Gateway (172.17.0.1)"
echo "----------------------------------------------"
if curl -sf http://172.17.0.1:8180/health; then
    echo ""
    echo "✅ OCR service accessible from Docker gateway!"
else
    echo ""
    echo "❌ Cannot access from Docker gateway"
    echo "This may indicate a network configuration issue"
fi
echo ""

echo "=================================================="
echo "Fix Complete!"
echo "=================================================="
echo ""
echo "OCR service should now be running and accessible."
echo "URL: http://localhost:8180"
echo "URL (from containers): http://172.17.0.1:8180"
echo ""
echo "To view logs:"
echo "  sudo docker logs -f ocr-service"
echo ""
echo "To restart:"
echo "  cd $STACK_DIR && sudo docker compose restart"
echo ""
