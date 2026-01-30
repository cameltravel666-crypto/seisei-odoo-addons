#!/usr/bin/env bash
# make_release_tarball.sh - Create a sanitized release tarball
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Create a sanitized release tarball.

Options:
  --tag TAG         Release tag name (required, e.g., main1.0.1)
  --output DIR      Output directory (default: dist/releases/<tag>/)
  --skip-sanitize   Skip sanitization step (use if already sanitized)
  --help            Show this help

Examples:
  $(basename "$0") --tag main1.0.1
  $(basename "$0") --tag main1.0.1 --output /tmp/releases

EOF
    exit 0
}

log() { echo -e "${GREEN}[RELEASE]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
TAG=""
OUTPUT_DIR=""
SKIP_SANITIZE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --tag) TAG="$2"; shift 2 ;;
        --output) OUTPUT_DIR="$2"; shift 2 ;;
        --skip-sanitize) SKIP_SANITIZE=true; shift ;;
        --help|-h) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

if [[ -z "$TAG" ]]; then
    log_error "Tag is required. Use --tag <tag_name>"
    exit 1
fi

# Validate tag format
if ! [[ "$TAG" =~ ^main[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] && ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    log_warn "Tag '$TAG' doesn't match expected format (main1.0.x or v1.0.0)"
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Set output directory
if [[ -z "$OUTPUT_DIR" ]]; then
    OUTPUT_DIR="$REPO_ROOT/dist/releases/$TAG"
fi

mkdir -p "$OUTPUT_DIR"

log "Creating release: $TAG"
log "Output: $OUTPUT_DIR"

# Create temporary directory for release contents
TEMP_DIR=$(mktemp -d)
RELEASE_DIR="$TEMP_DIR/seisei-$TAG"
mkdir -p "$RELEASE_DIR"

# Define what to include
INCLUDE_DIRS=(
    "infra"
    "odoo_modules"
    "services"
    "scripts"
    "docs"
    "audit/locks"
    ".github"
)

INCLUDE_FILES=(
    "README.md"
    "Makefile"
    ".gitignore"
    "docker-compose.yml"
    "Dockerfile"
)

# Copy directories
for dir in "${INCLUDE_DIRS[@]}"; do
    if [[ -d "$REPO_ROOT/$dir" ]]; then
        mkdir -p "$RELEASE_DIR/$(dirname "$dir")"
        cp -r "$REPO_ROOT/$dir" "$RELEASE_DIR/$dir"
        log "Added: $dir/"
    fi
done

# Copy files
for file in "${INCLUDE_FILES[@]}"; do
    if [[ -f "$REPO_ROOT/$file" ]]; then
        cp "$REPO_ROOT/$file" "$RELEASE_DIR/"
        log "Added: $file"
    fi
done

# Create audit directory if needed
mkdir -p "$RELEASE_DIR/audit/locks"

# Run sanitization
if ! $SKIP_SANITIZE; then
    log "Running sanitization..."
    if [[ -x "$SCRIPT_DIR/sanitize.sh" ]]; then
        "$SCRIPT_DIR/sanitize.sh" "$RELEASE_DIR" || log_warn "Sanitization had warnings"
    else
        log_warn "sanitize.sh not found or not executable"
    fi
fi

# Add release metadata
cat > "$RELEASE_DIR/RELEASE.md" << EOF
# Release $TAG

**Created:** $(date -Iseconds)
**Git Commit:** $(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
**Git Branch:** $(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "unknown")

## Contents

This release includes:
- Infrastructure configurations (infra/)
- Odoo modules (odoo_modules/)
- Microservices (services/)
- Operations scripts (scripts/)
- Documentation (docs/)
- Lock files for drift detection (audit/locks/)

## Deployment

See \`docs/ops/RELEASE_PROCESS.md\` for deployment instructions.

## Verification

After deployment, run:
\`\`\`bash
./scripts/drift_check.sh --local
\`\`\`

## Sanitization

All sensitive values have been replaced with \`***REDACTED***\`.
Replace these with actual values from your secrets management system.
EOF

# Verify no secrets in release
log "Verifying no plaintext secrets..."
LEAKS=$(grep -rE "(PASSWORD|SECRET|TOKEN|API_KEY)[^=:]*[=:][[:space:]]*[a-zA-Z0-9_\-\.]{16,}" "$RELEASE_DIR" 2>/dev/null | grep -v "REDACTED" | grep -v ".pyc" | wc -l || echo "0")

if [[ "$LEAKS" -gt 0 ]]; then
    log_error "Found $LEAKS potential secret leaks!"
    grep -rE "(PASSWORD|SECRET|TOKEN|API_KEY)[^=:]*[=:][[:space:]]*[a-zA-Z0-9_\-\.]{16,}" "$RELEASE_DIR" 2>/dev/null | grep -v "REDACTED" | grep -v ".pyc" | head -5
    log_error "Release aborted. Fix secrets before creating release."
    rm -rf "$TEMP_DIR"
    exit 1
fi

log "No plaintext secrets found"

# Create tarball
TARBALL_NAME="seisei-$TAG-sanitized.tar.gz"
log "Creating tarball: $TARBALL_NAME"

cd "$TEMP_DIR"
tar -czf "$OUTPUT_DIR/$TARBALL_NAME" "seisei-$TAG"

# Create checksum
cd "$OUTPUT_DIR"
sha256sum "$TARBALL_NAME" > "$TARBALL_NAME.sha256" 2>/dev/null || \
shasum -a 256 "$TARBALL_NAME" > "$TARBALL_NAME.sha256"

# Cleanup
rm -rf "$TEMP_DIR"

# Summary
log "Release created successfully!"
echo ""
echo "Output files:"
ls -lh "$OUTPUT_DIR/"
echo ""
echo "Tarball: $OUTPUT_DIR/$TARBALL_NAME"
echo "Size: $(ls -lh "$OUTPUT_DIR/$TARBALL_NAME" | awk '{print $5}')"
echo ""
echo "Next steps:"
echo "  1. git tag -a $TAG -m 'Release $TAG'"
echo "  2. git push origin $TAG"
echo "  3. Upload $TARBALL_NAME to releases"
