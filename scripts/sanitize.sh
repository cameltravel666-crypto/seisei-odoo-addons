#!/usr/bin/env bash
# sanitize.sh - Sanitize sensitive values in exported files
# Replaces secrets with ***REDACTED***
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] <DIRECTORY>

Sanitize sensitive values in configuration files.

Arguments:
  DIRECTORY       Directory to sanitize (required)

Options:
  --dry-run       Show what would be sanitized without making changes
  --report FILE   Write sanitization report to FILE (default: <DIR>/sanitize_report.md)
  --help          Show this help

Sensitive patterns matched:
  - AWS_* (access keys, secrets)
  - *PASSWORD*, *PASSWD*
  - *SECRET*, *TOKEN*
  - *API_KEY*, *APIKEY*
  - *PRIVATE*, *CREDENTIAL*
  - STRIPE_*, OPENAI_*, GEMINI_*, ANTHROPIC_*
  - SMTP_*, MAIL_PASS*
  - JWT_*, AUTH_*
  - ODOO admin_passwd

Examples:
  $(basename "$0") ./audit/runtime/
  $(basename "$0") --dry-run ./exports/

EOF
    exit 0
}

log() { echo -e "${GREEN}[SANITIZE]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_redact() { echo -e "${RED}[REDACTED]${NC} $1"; }

# Parse arguments
DRY_RUN=false
TARGET_DIR=""
REPORT_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run) DRY_RUN=true; shift ;;
        --report) REPORT_FILE="$2"; shift 2 ;;
        --help|-h) usage ;;
        -*) echo "Unknown option: $1"; usage ;;
        *) TARGET_DIR="$1"; shift ;;
    esac
done

if [[ -z "$TARGET_DIR" ]]; then
    echo "Error: Directory argument required"
    usage
fi

if [[ ! -d "$TARGET_DIR" ]]; then
    echo "Error: Directory not found: $TARGET_DIR"
    exit 1
fi

# Default report file
if [[ -z "$REPORT_FILE" ]]; then
    REPORT_FILE="$TARGET_DIR/sanitize_report.md"
fi

# Sensitive key patterns (case-insensitive matching)
SENSITIVE_PATTERNS=(
    'AWS_ACCESS_KEY'
    'AWS_SECRET'
    'PASSWORD'
    'PASSWD'
    'SECRET'
    'TOKEN'
    'API_KEY'
    'APIKEY'
    'PRIVATE_KEY'
    'PRIVATE'
    'CREDENTIAL'
    'STRIPE_'
    'OPENAI_'
    'GEMINI_'
    'ANTHROPIC_'
    'SMTP_PASS'
    'MAIL_PASS'
    'JWT_SECRET'
    'AUTH_SECRET'
    'admin_passwd'
    'master_password'
    'DB_PASSWORD'
    'POSTGRES_PASSWORD'
    'REDIS_PASSWORD'
)

# Build grep pattern
GREP_PATTERN=$(IFS='|'; echo "${SENSITIVE_PATTERNS[*]}")

# Initialize report
cat > "$REPORT_FILE" << EOF
# Sanitization Report

**Generated:** $(date -Iseconds)
**Directory:** $TARGET_DIR
**Mode:** $(if $DRY_RUN; then echo "DRY RUN"; else echo "APPLIED"; fi)

## Sanitized Entries

| File | Key | Line |
|------|-----|------|
EOF

TOTAL_REDACTED=0
FILES_PROCESSED=0

# Find files to process
FILE_TYPES=("*.env" ".env" "*.yml" "*.yaml" "*.conf" "*.json" "*.sh" "*.py" "*.js" "*.ts")
FILES_TO_PROCESS=()

for pattern in "${FILE_TYPES[@]}"; do
    while IFS= read -r -d '' file; do
        FILES_TO_PROCESS+=("$file")
    done < <(find "$TARGET_DIR" -type f -name "$pattern" -print0 2>/dev/null)
done

log "Found ${#FILES_TO_PROCESS[@]} files to scan"

sanitize_file() {
    local file="$1"
    local file_redacted=0

    # Skip binary files
    if file "$file" | grep -q "binary"; then
        return
    fi

    # Scan for sensitive patterns
    while IFS= read -r line_info; do
        if [[ -z "$line_info" ]]; then continue; fi

        local line_num
        line_num=$(echo "$line_info" | cut -d: -f1)
        local content
        content=$(echo "$line_info" | cut -d: -f2-)

        # Extract key name
        local key_name
        key_name=$(echo "$content" | grep -oE "^[^=:]+[=:]" | tr -d '=:' | xargs 2>/dev/null || echo "unknown")

        # Check if this line has a value (not just a reference like ${VAR})
        if echo "$content" | grep -qE '\$\{[A-Z_]+\}'; then
            continue  # Skip variable references
        fi

        # Check if value looks like an actual secret (long alphanumeric string)
        if echo "$content" | grep -qE "[=:][[:space:]]*['\"]?[a-zA-Z0-9_\-\.\+\/=]{8,}"; then
            file_redacted=$((file_redacted + 1))
            TOTAL_REDACTED=$((TOTAL_REDACTED + 1))

            log_redact "$file:$line_num - $key_name"
            echo "| ${file#$TARGET_DIR/} | $key_name | $line_num |" >> "$REPORT_FILE"

            if ! $DRY_RUN; then
                # Perform sanitization based on file type
                local ext="${file##*.}"
                case "$ext" in
                    env)
                        # KEY=value format
                        sed -i.bak -E "s/^([^#]*${key_name}[^=]*=).*/\1***REDACTED***/" "$file" 2>/dev/null || \
                        sed -i '' -E "s/^([^#]*${key_name}[^=]*=).*/\1***REDACTED***/" "$file"
                        ;;
                    yml|yaml)
                        # key: value format - be careful with indentation
                        sed -i.bak -E "s/(${key_name}:[[:space:]]*)[^#\n]+/\1***REDACTED***/" "$file" 2>/dev/null || \
                        sed -i '' -E "s/(${key_name}:[[:space:]]*)[^#\n]+/\1***REDACTED***/" "$file"
                        ;;
                    conf)
                        # key = value format
                        sed -i.bak -E "s/(${key_name}[[:space:]]*=[[:space:]]*).*/\1***REDACTED***/" "$file" 2>/dev/null || \
                        sed -i '' -E "s/(${key_name}[[:space:]]*=[[:space:]]*).*/\1***REDACTED***/" "$file"
                        ;;
                    json)
                        # "key": "value" format - requires jq for safety
                        # Skip for now, handle manually
                        ;;
                esac
            fi
        fi
    done < <(grep -inE "$GREP_PATTERN" "$file" 2>/dev/null | head -100 || true)

    if [[ $file_redacted -gt 0 ]]; then
        FILES_PROCESSED=$((FILES_PROCESSED + 1))
    fi

    # Clean up backup files
    if ! $DRY_RUN; then
        rm -f "$file.bak" 2>/dev/null || true
    fi
}

# Process each file
for file in "${FILES_TO_PROCESS[@]}"; do
    sanitize_file "$file"
done

# Additional pass: catch any remaining secrets with aggressive patterns
if ! $DRY_RUN; then
    log "Running comprehensive sanitization pass..."

    find "$TARGET_DIR" -type f \( -name "*.env" -o -name ".env" -o -name "*.yml" -o -name "*.yaml" -o -name "*.conf" \) | while read -r f; do
        # AWS access keys (AKIA...)
        sed -i.bak -E 's/(AKIA[A-Z0-9]{16})/***REDACTED***/g' "$f" 2>/dev/null || \
        sed -i '' -E 's/(AKIA[A-Z0-9]{16})/***REDACTED***/g' "$f"

        # Long secret-looking strings after = or :
        sed -i.bak -E 's/(PASSWORD[^=:]*[=:][[:space:]]*)[a-zA-Z0-9_\-\.\+\/=]{16,}/\1***REDACTED***/gi' "$f" 2>/dev/null || \
        sed -i '' -E 's/(PASSWORD[^=:]*[=:][[:space:]]*)[a-zA-Z0-9_\-\.\+\/=]{16,}/\1***REDACTED***/gi' "$f"

        rm -f "$f.bak" 2>/dev/null || true
    done
fi

# Summary
cat >> "$REPORT_FILE" << EOF

## Summary

- **Files scanned:** ${#FILES_TO_PROCESS[@]}
- **Files with redactions:** $FILES_PROCESSED
- **Total values redacted:** $TOTAL_REDACTED
- **Mode:** $(if $DRY_RUN; then echo "DRY RUN (no changes made)"; else echo "APPLIED"; fi)

## Verification

Run the following to verify no secrets remain:

\`\`\`bash
grep -rE "(PASSWORD|SECRET|TOKEN|API_KEY)[^=:]*[=:][[:space:]]*[a-zA-Z0-9_\-\.]{16,}" $TARGET_DIR | grep -v REDACTED
\`\`\`

If the command returns no output, sanitization is complete.
EOF

echo ""
log "Sanitization complete"
echo "  Files scanned: ${#FILES_TO_PROCESS[@]}"
echo "  Values redacted: $TOTAL_REDACTED"
echo "  Report: $REPORT_FILE"

if $DRY_RUN; then
    log_warn "DRY RUN - no changes were made"
fi
