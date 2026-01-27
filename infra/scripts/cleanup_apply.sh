#!/bin/bash
# =============================================================================
# cleanup_apply.sh - Apply cleanup changes with rollback support
# =============================================================================
# Purpose: Move identified cleanup candidates to .archive/ directory
#          All changes are reversible via --rollback flag
#
# Usage:
#   ./cleanup_apply.sh              # Execute cleanup
#   ./cleanup_apply.sh --dry-run    # Preview only
#   ./cleanup_apply.sh --rollback   # Restore from archive
#
# =============================================================================

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ARCHIVE_DIR="${REPO_ROOT}/.archive"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MANIFEST="${ARCHIVE_DIR}/manifest_${TIMESTAMP}.txt"

# Flags
DRY_RUN=false
ROLLBACK=false

# Print functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --rollback)
                ROLLBACK=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
}

# Initialize archive directory
init_archive() {
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would create: $ARCHIVE_DIR"
        return
    fi

    mkdir -p "$ARCHIVE_DIR/docs"
    mkdir -p "$ARCHIVE_DIR/deploy_artifacts"
    mkdir -p "$ARCHIVE_DIR/qr_ordering_docs"

    # Create manifest
    echo "# Cleanup Manifest - $TIMESTAMP" > "$MANIFEST"
    echo "# Format: original_path -> archive_path" >> "$MANIFEST"
    echo "" >> "$MANIFEST"

    log_success "Initialized archive directory"
}

# Archive a file
archive_file() {
    local src="$1"
    local dest_subdir="$2"
    local full_src="${REPO_ROOT}/${src}"
    local dest_dir="${ARCHIVE_DIR}/${dest_subdir}"
    local full_dest="${dest_dir}/$(basename "$src")"

    if [[ ! -e "$full_src" ]]; then
        return
    fi

    if [[ "$DRY_RUN" == true ]]; then
        local size=$(du -h "$full_src" 2>/dev/null | cut -f1)
        echo "  [DRY RUN] Would archive: $src ($size)"
        return
    fi

    mkdir -p "$dest_dir"
    mv "$full_src" "$full_dest"
    echo "$src -> $full_dest" >> "$MANIFEST"
    local size=$(du -h "$full_dest" 2>/dev/null | cut -f1)
    echo "  Archived: $src ($size)"
}

# Archive QR ordering documentation
archive_qr_docs() {
    log_info "Archiving QR ordering documentation..."

    local qr_docs=(
        "odoo_modules/seisei/qr_ordering/BOTTOM_BAR_QUICK_REF.md"
        "odoo_modules/seisei/qr_ordering/BOTTOM_BAR_REFACTOR_REPORT.md"
        "odoo_modules/seisei/qr_ordering/BOTTOM_BAR_SUMMARY.md"
        "odoo_modules/seisei/qr_ordering/CART_PRICE_BUG_ANALYSIS.md"
        "odoo_modules/seisei/qr_ordering/COMPARE_WITH_SERVER.md"
        "odoo_modules/seisei/qr_ordering/DELIVERY_REPORT.md"
        "odoo_modules/seisei/qr_ordering/DEPLOY_V2.md"
        "odoo_modules/seisei/qr_ordering/DEPLOYMENT_RECORD.md"
        "odoo_modules/seisei/qr_ordering/DEPLOYMENT_STATUS.md"
        "odoo_modules/seisei/qr_ordering/FIX_REPORT.md"
        "odoo_modules/seisei/qr_ordering/README_BOTTOM_BAR.md"
        "odoo_modules/seisei/qr_ordering/README_V2.md"
        "odoo_modules/seisei/qr_ordering/TEST_BOTTOM_BAR.md"
        "odoo_modules/seisei/qr_ordering/V1_V2_FIX_SUMMARY.md"
        "odoo_modules/seisei/qr_ordering/V2_CHECKLIST.md"
    )

    local count=0
    for doc in "${qr_docs[@]}"; do
        if [[ -f "${REPO_ROOT}/${doc}" ]]; then
            archive_file "$doc" "qr_ordering_docs"
            ((count++))
        fi
    done

    log_success "Archived $count QR ordering docs"
}

# Archive deploy artifacts
archive_deploy_artifacts() {
    log_info "Archiving deploy artifacts..."

    local count=0
    while IFS= read -r -d '' file; do
        local rel_path="${file#$REPO_ROOT/}"
        archive_file "$rel_path" "deploy_artifacts"
        ((count++))
    done < <(find "$REPO_ROOT" -maxdepth 1 -name "*.tar.gz" -type f -print0 2>/dev/null)

    log_success "Archived $count deploy artifacts"
}

# Update .gitignore
update_gitignore() {
    local gitignore="${REPO_ROOT}/.gitignore"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would update .gitignore"
        return
    fi

    if [[ -f "$gitignore" ]]; then
        if ! grep -q "^\.archive/" "$gitignore" 2>/dev/null; then
            echo "" >> "$gitignore"
            echo "# Archived files (cleanup)" >> "$gitignore"
            echo ".archive/" >> "$gitignore"
            log_success "Added .archive/ to .gitignore"
        fi
    fi
}

# Rollback from archive
do_rollback() {
    log_warn "Rollback mode - restoring from archive"

    # Find most recent manifest
    local latest_manifest=$(ls -t "${ARCHIVE_DIR}"/manifest_*.txt 2>/dev/null | head -1)

    if [[ -z "$latest_manifest" || ! -f "$latest_manifest" ]]; then
        log_error "No manifest found in $ARCHIVE_DIR"
        exit 1
    fi

    log_info "Using manifest: $latest_manifest"

    while IFS= read -r line; do
        [[ "$line" =~ ^#.*$ ]] && continue
        [[ -z "$line" ]] && continue

        local original=$(echo "$line" | cut -d' ' -f1)
        local archived=$(echo "$line" | cut -d' ' -f3)

        if [[ -f "$archived" ]]; then
            local dest="${REPO_ROOT}/${original}"
            mkdir -p "$(dirname "$dest")"
            mv "$archived" "$dest"
            log_success "Restored: $original"
        fi
    done < "$latest_manifest"

    log_success "Rollback complete"
}

# Print summary
print_summary() {
    echo ""
    echo "========================================"
    echo " Cleanup Summary"
    echo "========================================"

    if [[ "$DRY_RUN" == true ]]; then
        echo ""
        echo "This was a DRY RUN - no files were moved."
        echo ""
        echo "To execute cleanup:"
        echo "  ./cleanup_apply.sh"
    else
        echo ""
        echo "Files archived to: $ARCHIVE_DIR"
        echo "Manifest: $MANIFEST"
        echo ""
        echo "To rollback:"
        echo "  ./cleanup_apply.sh --rollback"
        echo ""

        if [[ -d "$ARCHIVE_DIR" ]]; then
            local size=$(du -sh "$ARCHIVE_DIR" 2>/dev/null | cut -f1)
            echo "Space archived: $size"
        fi
    fi
    echo ""
}

# Main execution
main() {
    parse_args "$@"

    echo ""
    echo "=============================================="
    echo " Cleanup Apply"
    echo "=============================================="
    echo ""

    if [[ "$ROLLBACK" == true ]]; then
        do_rollback
        exit 0
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_warn "DRY RUN MODE - No files will be moved"
        echo ""
    fi

    init_archive
    echo ""

    archive_qr_docs
    echo ""

    archive_deploy_artifacts
    echo ""

    update_gitignore

    print_summary
}

main "$@"
