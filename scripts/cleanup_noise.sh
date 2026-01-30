#!/usr/bin/env bash
# cleanup_noise.sh - Find and optionally remove noise files
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

Find and optionally remove noise files from the repository.

Options:
  --apply           Actually delete files (default: dry run, list only)
  --path DIR        Scan specific directory (default: repo root)
  --include-git     Include .git directory in scan
  --help            Show this help

Noise patterns detected:
  - .DS_Store (macOS)
  - *.swp, *.swo (vim swap)
  - *.bak, *.backup* (backup files)
  - *~ (editor backups)
  - *.orig (merge originals)
  - *.pyc, __pycache__ (Python)
  - node_modules (if not in .gitignore)
  - .env (if contains secrets)

Examples:
  $(basename "$0")                    # List noise files
  $(basename "$0") --apply            # Delete noise files
  $(basename "$0") --path infra/      # Scan specific directory

EOF
    exit 0
}

log() { echo -e "${GREEN}[CLEAN]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_delete() { echo -e "${RED}[DELETE]${NC} $1"; }

# Parse arguments
APPLY=false
SCAN_PATH="$REPO_ROOT"
INCLUDE_GIT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --apply) APPLY=true; shift ;;
        --path) SCAN_PATH="$2"; shift 2 ;;
        --include-git) INCLUDE_GIT=true; shift ;;
        --help|-h) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

# Noise patterns
NOISE_PATTERNS=(
    ".DS_Store"
    "._*"
    "*.swp"
    "*.swo"
    "*.bak"
    "*.backup"
    "*.backup.*"
    "*~"
    "*.orig"
    "*.pyc"
    "*.pyo"
    "Thumbs.db"
    "desktop.ini"
)

# Directories to always skip
SKIP_DIRS=(
    "node_modules"
    ".next"
    "dist"
    "__pycache__"
)

# Build find exclusions
FIND_EXCLUDES=""
for dir in "${SKIP_DIRS[@]}"; do
    FIND_EXCLUDES="$FIND_EXCLUDES -path '*/$dir' -prune -o"
done

if ! $INCLUDE_GIT; then
    FIND_EXCLUDES="$FIND_EXCLUDES -path '*/.git' -prune -o"
fi

# Track findings
declare -a NOISE_FILES=()
TOTAL_SIZE=0

log "Scanning: $SCAN_PATH"
log "Mode: $(if $APPLY; then echo 'APPLY (will delete)'; else echo 'DRY RUN (list only)'; fi)"
echo ""

# Find noise files
for pattern in "${NOISE_PATTERNS[@]}"; do
    while IFS= read -r -d '' file; do
        NOISE_FILES+=("$file")
        if [[ -f "$file" ]]; then
            size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
            TOTAL_SIZE=$((TOTAL_SIZE + size))
        fi
    done < <(eval "find '$SCAN_PATH' $FIND_EXCLUDES -name '$pattern' -print0 2>/dev/null" || true)
done

# Find __pycache__ directories
while IFS= read -r -d '' dir; do
    NOISE_FILES+=("$dir")
done < <(eval "find '$SCAN_PATH' $FIND_EXCLUDES -type d -name '__pycache__' -print0 2>/dev/null" || true)

# Check for .env files with actual secrets (not examples)
while IFS= read -r -d '' file; do
    filename=$(basename "$file")
    if [[ "$filename" == ".env" ]] && [[ "$filename" != ".env.example" ]] && [[ "$filename" != ".env.sample" ]]; then
        # Check if it contains actual secrets (not just placeholders)
        if grep -qE "(PASSWORD|SECRET|TOKEN|API_KEY)=[^$\{]" "$file" 2>/dev/null; then
            log_warn "Found .env with potential secrets: $file"
            log_warn "  -> This should be in .gitignore, not committed"
        fi
    fi
done < <(eval "find '$SCAN_PATH' $FIND_EXCLUDES -name '.env*' -print0 2>/dev/null" || true)

# Report findings
echo "========================================"
echo "  Noise Files Found"
echo "========================================"
echo ""

if [[ ${#NOISE_FILES[@]} -eq 0 ]]; then
    log "No noise files found!"
    exit 0
fi

# Group by type
declare -A TYPE_COUNTS
for file in "${NOISE_FILES[@]}"; do
    filename=$(basename "$file")
    ext="${filename##*.}"
    if [[ "$filename" == ".DS_Store" ]]; then
        type=".DS_Store"
    elif [[ "$filename" == "__pycache__" ]]; then
        type="__pycache__"
    elif [[ "$filename" == ._* ]]; then
        type="._* (macOS)"
    elif [[ "$ext" == "swp" || "$ext" == "swo" ]]; then
        type="vim swap"
    elif [[ "$ext" == "bak" || "$filename" == *".backup"* ]]; then
        type="backup"
    elif [[ "$filename" == *"~" ]]; then
        type="editor backup"
    else
        type="other"
    fi
    TYPE_COUNTS[$type]=$((${TYPE_COUNTS[$type]:-0} + 1))
done

echo "Summary by type:"
for type in "${!TYPE_COUNTS[@]}"; do
    echo "  $type: ${TYPE_COUNTS[$type]}"
done
echo ""
echo "Total: ${#NOISE_FILES[@]} files"
echo "Size: $((TOTAL_SIZE / 1024)) KB"
echo ""

# List files
echo "Files:"
for file in "${NOISE_FILES[@]}"; do
    rel_path="${file#$REPO_ROOT/}"
    if $APPLY; then
        log_delete "$rel_path"
        rm -rf "$file"
    else
        echo "  $rel_path"
    fi
done

echo ""

if $APPLY; then
    log "Deleted ${#NOISE_FILES[@]} noise files/directories"
else
    log_warn "DRY RUN - no files deleted"
    echo ""
    echo "To delete these files, run:"
    echo "  $0 --apply"
fi
