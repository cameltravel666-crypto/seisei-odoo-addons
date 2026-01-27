#!/bin/bash
# =============================================================================
# cleanup_audit.sh - Audit unused files and environment variables
# =============================================================================
# Purpose: Generate a cleanup report without making any changes
#
# Usage:
#   ./cleanup_audit.sh [--output-dir DIR]
#
# Output:
#   docs/CLEANUP_REPORT.md - Detailed cleanup recommendations
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
OUTPUT_DIR="${1:-$REPO_ROOT/docs}"
REPORT_FILE="${OUTPUT_DIR}/CLEANUP_REPORT.md"

# Print functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Initialize report
init_report() {
    mkdir -p "$OUTPUT_DIR"
    cat > "$REPORT_FILE" << 'EOF'
# Cleanup Audit Report

Generated: $(date '+%Y-%m-%d %H:%M:%S')

This report identifies potentially unused files and variables for cleanup review.

---

EOF
    # Replace date placeholder
    sed -i.bak "s/\$(date '+%Y-%m-%d %H:%M:%S')/$(date '+%Y-%m-%d %H:%M:%S')/" "$REPORT_FILE"
    rm -f "${REPORT_FILE}.bak"
}

# Audit environment variables
audit_env_vars() {
    log_info "Auditing environment variables..."

    echo "## 1. Environment Variables Audit" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    # Collect all env vars from compose files
    local compose_vars=$(grep -rh '\${[A-Z_]*' "$REPO_ROOT"/infra/stacks/*/docker-compose*.yml 2>/dev/null | \
        grep -oE '\$\{[A-Z_]+' | sed 's/\${//' | sort -u || echo "")

    # Collect all env vars from odoo.conf
    local conf_vars=$(grep -rh '\${[A-Z_]*' "$REPO_ROOT"/infra/stacks/*/config/*.conf 2>/dev/null | \
        grep -oE '\$\{[A-Z_]+' | sed 's/\${//' | sort -u || echo "")

    # Collect env vars from Python code
    local python_vars=$(grep -rh "os\.getenv\|os\.environ" "$REPO_ROOT"/odoo_modules/seisei/ 2>/dev/null | \
        grep -oE "getenv\(['\"][A-Z_]+['\"]|environ\[['\"][A-Z_]+['\"]" | \
        sed "s/getenv(['\"]//;s/environ\[['\"]//;s/['\"].*//" | sort -u || echo "")

    # Collect env vars from .env.example files
    local example_vars=$(grep -rh "^[A-Z_]*=" "$REPO_ROOT"/infra/stacks/*/.env.example 2>/dev/null | \
        cut -d= -f1 | sort -u || echo "")

    echo "### Variables Used in Docker Compose" >> "$REPORT_FILE"
    echo "\`\`\`" >> "$REPORT_FILE"
    echo "$compose_vars" >> "$REPORT_FILE"
    echo "\`\`\`" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    echo "### Variables Used in Python Code" >> "$REPORT_FILE"
    echo "\`\`\`" >> "$REPORT_FILE"
    echo "$python_vars" >> "$REPORT_FILE"
    echo "\`\`\`" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    echo "### Variables in .env.example" >> "$REPORT_FILE"
    echo "\`\`\`" >> "$REPORT_FILE"
    echo "$example_vars" >> "$REPORT_FILE"
    echo "\`\`\`" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    # Find potentially unused (in example but not in code)
    echo "### Potentially Unused Variables" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "Variables in .env.example but not found in compose/code:" >> "$REPORT_FILE"
    echo "\`\`\`" >> "$REPORT_FILE"

    for var in $example_vars; do
        if ! echo "$compose_vars $python_vars $conf_vars" | grep -qw "$var"; then
            echo "$var (not found in code)" >> "$REPORT_FILE"
        fi
    done

    echo "\`\`\`" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
}

# Audit markdown files
audit_markdown() {
    log_info "Auditing markdown files..."

    echo "## 2. Markdown Files Audit" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    echo "### Large Documentation Files (>10KB)" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "| File | Size | Last Modified |" >> "$REPORT_FILE"
    echo "|------|------|---------------|" >> "$REPORT_FILE"

    find "$REPO_ROOT" -name "*.md" -size +10k -type f 2>/dev/null | \
        grep -v node_modules | grep -v .git | \
        while read -r file; do
            local size=$(du -h "$file" | cut -f1)
            local modified=$(stat -f "%Sm" -t "%Y-%m-%d" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null | cut -d' ' -f1)
            local rel_path="${file#$REPO_ROOT/}"
            echo "| \`$rel_path\` | $size | $modified |" >> "$REPORT_FILE"
        done

    echo "" >> "$REPORT_FILE"

    # Identify debug/fix documentation
    echo "### Potential Debug/Fix Documentation (candidates for archive)" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    local debug_patterns="DEBUG|FIX|DIAGNOSE|BUG|ANALYSIS|SUMMARY|REPORT|CHECKLIST|DELIVERY|STATUS"

    echo "Files matching debug patterns:" >> "$REPORT_FILE"
    echo "\`\`\`" >> "$REPORT_FILE"

    find "$REPO_ROOT" -name "*.md" -type f 2>/dev/null | \
        grep -v node_modules | grep -v .git | grep -v docs/CLEANUP_REPORT | \
        while read -r file; do
            local basename=$(basename "$file")
            if echo "$basename" | grep -qE "$debug_patterns"; then
                local rel_path="${file#$REPO_ROOT/}"
                local size=$(du -h "$file" | cut -f1)
                echo "$rel_path ($size)" >> "$REPORT_FILE"
            fi
        done

    echo "\`\`\`" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
}

# Audit archive files
audit_archives() {
    log_info "Auditing archive files..."

    echo "## 3. Archive Files Audit" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    echo "### Compressed Archives (.tar.gz, .zip)" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "| File | Size |" >> "$REPORT_FILE"
    echo "|------|------|" >> "$REPORT_FILE"

    find "$REPO_ROOT" \( -name "*.tar.gz" -o -name "*.zip" \) -type f 2>/dev/null | \
        grep -v node_modules | grep -v .git | \
        while read -r file; do
            local size=$(du -h "$file" | cut -f1)
            local rel_path="${file#$REPO_ROOT/}"
            echo "| \`$rel_path\` | $size |" >> "$REPORT_FILE"
        done

    echo "" >> "$REPORT_FILE"
    echo "**Recommendation:** Move to \`.archive/\` or delete if no longer needed." >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
}

# Audit duplicate modules
audit_duplicates() {
    log_info "Auditing potential duplicates..."

    echo "## 4. Potential Duplicate Code" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    echo "### OCR-related Modules" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "Multiple OCR modules detected:" >> "$REPORT_FILE"
    echo "\`\`\`" >> "$REPORT_FILE"

    find "$REPO_ROOT/odoo_modules" -type d -name "*ocr*" 2>/dev/null | \
        while read -r dir; do
            local rel_path="${dir#$REPO_ROOT/}"
            local manifest="$dir/__manifest__.py"
            if [[ -f "$manifest" ]]; then
                local name=$(grep -o "'name'.*" "$manifest" | head -1)
                echo "$rel_path: $name" >> "$REPORT_FILE"
            fi
        done

    echo "\`\`\`" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "**Review:** Determine if all OCR modules are needed or can be consolidated." >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
}

# Generate cleanup script recommendation
generate_cleanup_script() {
    log_info "Generating cleanup recommendations..."

    echo "## 5. Recommended Actions" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    cat >> "$REPORT_FILE" << 'EOF'
### Safe to Archive

Files that can be moved to `.archive/` with low risk:

```bash
# Run from repository root
mkdir -p .archive/docs
mkdir -p .archive/deploy_artifacts

# Move debug documentation
find odoo_modules -name "*SUMMARY*.md" -exec mv {} .archive/docs/ \;
find odoo_modules -name "*REPORT*.md" -exec mv {} .archive/docs/ \;
find odoo_modules -name "*CHECKLIST*.md" -exec mv {} .archive/docs/ \;

# Move deploy artifacts
mv *.tar.gz .archive/deploy_artifacts/ 2>/dev/null || true
```

### Requires Review

- OCR module consolidation (multiple similar modules)
- Unused environment variables
- Large markdown files in module directories

### Do Not Archive

- `README.md` files
- `CLAUDE.md` (AI assistant config)
- `docs/INVENTORY.md` (infrastructure inventory)
- `docs/ISOLATION.md` (module isolation strategy)
- Active deployment configs
EOF

    echo "" >> "$REPORT_FILE"
}

# Main execution
main() {
    echo ""
    echo "=============================================="
    echo " Cleanup Audit"
    echo "=============================================="
    echo ""

    log_info "Repository: $REPO_ROOT"
    log_info "Output: $REPORT_FILE"
    echo ""

    init_report
    audit_env_vars
    audit_markdown
    audit_archives
    audit_duplicates
    generate_cleanup_script

    log_success "Audit complete!"
    echo ""
    echo "Report generated: $REPORT_FILE"
    echo ""
    echo "Next steps:"
    echo "  1. Review the report: cat $REPORT_FILE"
    echo "  2. Run cleanup: ./cleanup_apply.sh"
    echo ""
}

main "$@"
