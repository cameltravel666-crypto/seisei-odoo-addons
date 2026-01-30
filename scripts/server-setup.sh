#!/bin/bash
# ===========================================
# Seisei BizNexus - Server Initial Setup
# Run this script on a fresh Ubuntu/Debian server
# ===========================================

set -e

echo "=========================================="
echo "  Seisei BizNexus - Server Setup"
echo "=========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root or with sudo"
    exit 1
fi

# Update system
echo "[1/6] Updating system packages..."
apt-get update && apt-get upgrade -y

# Install Docker
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
else
    echo "Docker already installed"
fi

# Install Nginx
echo "[3/6] Installing Nginx..."
apt-get install -y nginx

# Install Certbot for SSL
echo "[4/6] Installing Certbot..."
apt-get install -y certbot python3-certbot-nginx

# Create app directory
echo "[5/6] Creating application directory..."
mkdir -p /opt/seisei-biznexus
cd /opt/seisei-biznexus

# Clone repository (update URL after creating repo)
echo "[6/6] Setup complete!"
echo ""
echo "=========================================="
echo "  Next Steps:"
echo "=========================================="
echo ""
echo "1. Clone your repository:"
echo "   cd /opt/seisei-biznexus"
echo "   git clone YOUR_REPO_URL ."
echo ""
echo "2. Configure environment:"
echo "   cp .env.production.example .env"
echo "   nano .env"
echo "   # Update DATABASE password, JWT_SECRET, ENCRYPTION_KEY"
echo ""
echo "3. Configure Nginx:"
echo "   cp nginx/biznexus.conf /etc/nginx/sites-available/"
echo "   ln -s /etc/nginx/sites-available/biznexus.conf /etc/nginx/sites-enabled/"
echo ""
echo "4. Get SSL certificate:"
echo "   certbot --nginx -d biznexus.seisei.tokyo"
echo ""
echo "5. Deploy the application:"
echo "   chmod +x scripts/deploy.sh"
echo "   ./scripts/deploy.sh"
echo ""
echo "6. Verify deployment:"
echo "   curl https://biznexus.seisei.tokyo"
echo ""
