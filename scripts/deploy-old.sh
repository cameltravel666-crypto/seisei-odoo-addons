#!/bin/bash
# ===========================================
# Seisei BizNexus - Production Deployment Script
# ===========================================

set -e

echo "=========================================="
echo "  Seisei BizNexus - Deployment"
echo "=========================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    echo "Please copy .env.production.example to .env and configure it:"
    echo "  cp .env.production.example .env"
    echo "  nano .env"
    exit 1
fi

# Generate secrets if not set
if grep -q "CHANGE_THIS" .env; then
    echo "Warning: Please update the placeholder values in .env file"
    echo "Generate secure values with:"
    echo "  JWT_SECRET: openssl rand -base64 32"
    echo "  ENCRYPTION_KEY: openssl rand -hex 16"
    exit 1
fi

echo ""
echo "[1/5] Pulling latest code..."
git pull origin main || echo "Git pull skipped (no remote or local changes)"

echo ""
echo "[2/5] Stopping existing containers..."
docker compose down 2>/dev/null || true

echo ""
echo "[3/5] Building Docker images..."
docker compose build --no-cache

echo ""
echo "[4/5] Starting services..."
docker compose up -d

echo ""
echo "[5/5] Waiting for services to be ready..."
sleep 10

# Check if services are running
if docker compose ps | grep -q "Up\|running"; then
    echo ""
    echo "=========================================="
    echo "  Deployment Complete!"
    echo "=========================================="
    echo ""
    echo "App running at: https://biznexus.seisei.tokyo"
    echo "Local port: 9527"
    echo ""
    echo "View logs: docker compose logs -f app"
    echo "Stop:      docker compose down"
    echo ""
else
    echo ""
    echo "Error: Services failed to start"
    echo "Check logs: docker compose logs"
    exit 1
fi
