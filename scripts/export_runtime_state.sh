#!/usr/bin/env bash
# export_runtime_state.sh - Export current runtime state for drift detection
# Run this on the production server to capture current state
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="${1:-/srv/release_export/runtime_$TIMESTAMP}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

usage() {
    cat << EOF
Usage: $(basename "$0") [OUTPUT_DIR]

Export current runtime state for drift detection.

Arguments:
  OUTPUT_DIR    Where to save exports (default: /srv/release_export/runtime_\$TIMESTAMP)

Exports:
  - Docker container state (ps, inspect, images)
  - Compose file hashes
  - Traefik router/service state
  - Odoo addon hashes
  - Key configuration hashes

Examples:
  $(basename "$0")
  $(basename "$0") /tmp/runtime_export

EOF
    exit 0
}

[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && usage

log() { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Create output directory
mkdir -p "$OUTPUT_DIR"
log "Output directory: $OUTPUT_DIR"

# 1. Docker state
log "Exporting Docker state..."
mkdir -p "$OUTPUT_DIR/docker"

docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' > "$OUTPUT_DIR/docker/ps.txt" 2>/dev/null || true
docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}' > "$OUTPUT_DIR/docker/images.txt" 2>/dev/null || true
docker network ls > "$OUTPUT_DIR/docker/networks.txt" 2>/dev/null || true
docker volume ls > "$OUTPUT_DIR/docker/volumes.txt" 2>/dev/null || true

# Key containers inspect (filtered)
CONTAINERS="traefik seisei-odoo-router odoo18-prod-web odoo-tenant odoo-admin seisei-db seisei-erp-app qr-bff ocr-service"
echo "{" > "$OUTPUT_DIR/docker/inspect_filtered.json"
echo '  "timestamp": "'"$TIMESTAMP"'",' >> "$OUTPUT_DIR/docker/inspect_filtered.json"
echo '  "containers": {' >> "$OUTPUT_DIR/docker/inspect_filtered.json"

first=true
for container in $CONTAINERS; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
        if [ "$first" = true ]; then first=false; else echo "," >> "$OUTPUT_DIR/docker/inspect_filtered.json"; fi

        docker inspect "$container" 2>/dev/null | jq --arg name "$container" '
        .[0] | {
            ($name): {
                Image: .Config.Image,
                ImageId: .Image,
                State: .State.Status,
                Mounts: [.Mounts[] | {Type, Source, Destination}],
                EnvKeys: [.Config.Env[] | split("=")[0]],
                Networks: [.NetworkSettings.Networks | keys[]]
            }
        }' | jq -r 'to_entries[] | "    \"\(.key)\": \(.value | tojson)"' >> "$OUTPUT_DIR/docker/inspect_filtered.json"
    fi
done

echo "" >> "$OUTPUT_DIR/docker/inspect_filtered.json"
echo "  }" >> "$OUTPUT_DIR/docker/inspect_filtered.json"
echo "}" >> "$OUTPUT_DIR/docker/inspect_filtered.json"

# 2. Docker images lock
log "Generating docker_images.lock.json..."
echo "{" > "$OUTPUT_DIR/docker_images.lock.json"
echo '  "generated_at": "'"$(date -Iseconds)"'",' >> "$OUTPUT_DIR/docker_images.lock.json"
echo '  "images": {' >> "$OUTPUT_DIR/docker_images.lock.json"

first=true
for container in $CONTAINERS; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
        if [ "$first" = true ]; then first=false; else echo "," >> "$OUTPUT_DIR/docker_images.lock.json"; fi
        image=$(docker inspect "$container" --format '{{.Config.Image}}' 2>/dev/null || echo "unknown")
        image_id=$(docker inspect "$container" --format '{{.Image}}' 2>/dev/null || echo "unknown")
        printf '    "%s": {"image": "%s", "imageId": "%s"}' "$container" "$image" "$image_id" >> "$OUTPUT_DIR/docker_images.lock.json"
    fi
done

echo "" >> "$OUTPUT_DIR/docker_images.lock.json"
echo "  }" >> "$OUTPUT_DIR/docker_images.lock.json"
echo "}" >> "$OUTPUT_DIR/docker_images.lock.json"

# 3. Compose file hashes
log "Generating compose_sha256.lock.txt..."
: > "$OUTPUT_DIR/compose_sha256.lock.txt"

for dir in /srv/stacks /opt/seisei-odoo /opt/qr-bff; do
    if [ -d "$dir" ]; then
        find "$dir" -name "docker-compose*.yml" -o -name "docker-compose*.yaml" 2>/dev/null | while read -r f; do
            sha=$(sha256sum "$f" 2>/dev/null | cut -d' ' -f1)
            echo "$sha  $f" >> "$OUTPUT_DIR/compose_sha256.lock.txt"
        done
    fi
done

# 4. Traefik state
log "Exporting Traefik state..."
mkdir -p "$OUTPUT_DIR/traefik"

curl -s http://localhost:8888/api/http/routers 2>/dev/null | jq '.' > "$OUTPUT_DIR/traefik/routers.json" 2>/dev/null || echo "[]" > "$OUTPUT_DIR/traefik/routers.json"
curl -s http://localhost:8888/api/http/services 2>/dev/null | jq '.' > "$OUTPUT_DIR/traefik/services.json" 2>/dev/null || echo "[]" > "$OUTPUT_DIR/traefik/services.json"
curl -s http://localhost:8888/api/http/middlewares 2>/dev/null | jq '.' > "$OUTPUT_DIR/traefik/middlewares.json" 2>/dev/null || echo "[]" > "$OUTPUT_DIR/traefik/middlewares.json"

# 5. Odoo addons hashes
log "Generating odoo_addons_modules.hash.txt..."
: > "$OUTPUT_DIR/odoo_addons_modules.hash.txt"

ADDONS_DIRS="/opt/seisei-odoo/addons/current /opt/seisei-odoo-addons/odoo_modules/seisei /mnt/extra-addons/seisei"
for addons_dir in $ADDONS_DIRS; do
    if [ -d "$addons_dir" ]; then
        log "Found addons at: $addons_dir"
        find "$addons_dir" -maxdepth 1 -type d | while read -r d; do
            if [ "$d" != "$addons_dir" ]; then
                module=$(basename "$d")
                hash=$(find "$d" -type f -exec sha256sum {} \; 2>/dev/null | sort | sha256sum | cut -d' ' -f1)
                echo "$hash  $module" >> "$OUTPUT_DIR/odoo_addons_modules.hash.txt"
            fi
        done
        break  # Use first found
    fi
done

# 6. Key config hashes
log "Generating config hashes..."
echo "# Configuration file hashes" > "$OUTPUT_DIR/config_hashes.txt"
echo "# Generated: $TIMESTAMP" >> "$OUTPUT_DIR/config_hashes.txt"
echo "" >> "$OUTPUT_DIR/config_hashes.txt"

CONFIG_FILES=(
    "/opt/seisei-odoo/config/odoo.conf"
    "/srv/stacks/edge-traefik/traefik.yml"
    "/srv/stacks/edge-traefik/dynamic/services.yml"
    "/srv/stacks/edge-traefik/dynamic/middlewares.yml"
)

for cfg in "${CONFIG_FILES[@]}"; do
    if [ -f "$cfg" ]; then
        sha=$(sha256sum "$cfg" 2>/dev/null | cut -d' ' -f1)
        echo "$sha  $cfg" >> "$OUTPUT_DIR/config_hashes.txt"
    fi
done

# 7. Nginx router config
log "Exporting Nginx router config..."
mkdir -p "$OUTPUT_DIR/nginx"
docker cp seisei-odoo-router:/etc/nginx/conf.d/default.conf "$OUTPUT_DIR/nginx/default.conf" 2>/dev/null || true
if [ -f "$OUTPUT_DIR/nginx/default.conf" ]; then
    sha256sum "$OUTPUT_DIR/nginx/default.conf" > "$OUTPUT_DIR/nginx/default.conf.sha256"
fi

# 8. Summary
log "Generating summary..."
cat > "$OUTPUT_DIR/SUMMARY.md" << EOF
# Runtime State Export

**Timestamp:** $TIMESTAMP
**Server:** $(hostname)

## Files Generated

| File | Description |
|------|-------------|
| docker/ps.txt | Container list |
| docker/images.txt | Image list |
| docker/inspect_filtered.json | Container details (filtered) |
| docker_images.lock.json | Image lock file |
| compose_sha256.lock.txt | Compose file hashes |
| traefik/*.json | Traefik API dumps |
| odoo_addons_modules.hash.txt | Addon module hashes |
| config_hashes.txt | Key config file hashes |
| nginx/default.conf | Nginx router config |

## Container Count

$(docker ps -a --format '{{.Names}}' | wc -l) containers found

## Next Steps

1. Copy to local machine:
   \`\`\`bash
   scp -r ubuntu@server:$OUTPUT_DIR ./audit/runtime/
   \`\`\`

2. Run sanitization:
   \`\`\`bash
   ./scripts/sanitize.sh ./audit/runtime/$TIMESTAMP
   \`\`\`

3. Compare with baseline:
   \`\`\`bash
   ./scripts/drift_check.sh --local
   \`\`\`
EOF

log "Export complete: $OUTPUT_DIR"
echo ""
echo "Files generated:"
find "$OUTPUT_DIR" -type f -name "*.json" -o -name "*.txt" -o -name "*.md" | head -20
echo ""
echo "Total size: $(du -sh "$OUTPUT_DIR" | cut -f1)"
