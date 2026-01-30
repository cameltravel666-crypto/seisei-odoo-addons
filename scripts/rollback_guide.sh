#!/usr/bin/env bash
# rollback_guide.sh - Print rollback steps for different scenarios
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Print rollback procedures for different scenarios.

Options:
  --tag TAG         Target rollback tag (default: show available tags)
  --stack STACK     Specific stack to rollback (e.g., edge-traefik, odoo18-prod)
  --full            Show full rollback procedure including database
  --aws             Include AWS snapshot commands
  --help            Show this help

Examples:
  $(basename "$0")                           # Show available tags
  $(basename "$0") --tag main1.0            # Rollback to main1.0
  $(basename "$0") --stack edge-traefik     # Rollback specific stack
  $(basename "$0") --full --aws             # Full rollback with AWS commands

EOF
    exit 0
}

section() { echo -e "\n${CYAN}=== $1 ===${NC}\n"; }
warn() { echo -e "${YELLOW}WARNING:${NC} $1"; }

# Parse arguments
TARGET_TAG=""
TARGET_STACK=""
SHOW_FULL=false
SHOW_AWS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --tag) TARGET_TAG="$2"; shift 2 ;;
        --stack) TARGET_STACK="$2"; shift 2 ;;
        --full) SHOW_FULL=true; shift ;;
        --aws) SHOW_AWS=true; shift ;;
        --help|-h) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

# Show available tags
section "Available Release Tags"
echo "Recent tags in repository:"
git -C "$REPO_ROOT" tag -l 'main*' --sort=-version:refname 2>/dev/null | head -10 || echo "  (no tags found)"
echo ""

if [[ -z "$TARGET_TAG" && -z "$TARGET_STACK" ]]; then
    echo "Specify --tag or --stack for detailed rollback steps."
    exit 0
fi

# Stack-specific rollback
if [[ -n "$TARGET_STACK" ]]; then
    section "Stack Rollback: $TARGET_STACK"

    cat << EOF
# 1. SSH to production server
ssh -i ~/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141

# 2. Navigate to stack directory
cd /srv/stacks/$TARGET_STACK

# 3. Check current state
docker compose ps
docker compose config

# 4. Pull previous version (if using git-tracked compose)
git log --oneline -5 docker-compose.yml
git checkout <previous_commit> -- docker-compose.yml

# 5. Restart stack
docker compose down
docker compose up -d

# 6. Verify
docker compose ps
docker compose logs --tail=50

# 7. If using specific image tags, edit docker-compose.yml:
#    Change: image: myapp:latest
#    To:     image: myapp:<previous_tag>
EOF
fi

# Tag-based rollback
if [[ -n "$TARGET_TAG" ]]; then
    section "Tag Rollback: $TARGET_TAG"

    cat << EOF
# 1. SSH to production server
ssh -i ~/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141

# 2. Navigate to repo
cd /opt/seisei-main  # or wherever repo is deployed

# 3. Fetch and checkout tag
git fetch origin
git checkout $TARGET_TAG

# 4. Review changes
git diff HEAD~1 --stat

# 5. Restart affected stacks
# For each stack that changed:
cd infra/stacks/edge-traefik && docker compose up -d
cd ../odoo18-prod && docker compose up -d
cd ../erp-seisei && docker compose up -d
# etc.

# 6. Verify all containers are healthy
docker ps --format 'table {{.Names}}\t{{.Status}}'
EOF
fi

# Full rollback including database
if $SHOW_FULL; then
    section "Full Rollback (Including Database)"

    cat << EOF
WARNING: Database rollback may cause data loss!
Only use for critical failures.

# 1. Stop all application containers
docker stop odoo18-prod-web seisei-erp-app qr-bff

# 2. Backup current database state (just in case)
docker exec seisei-db pg_dumpall -U odoo > /tmp/backup_before_rollback.sql

# 3. Find available database snapshots
# Check local backups:
ls -la /srv/backups/postgres/

# 4. Restore database from backup
docker exec -i seisei-db psql -U odoo < /srv/backups/postgres/<backup_file>.sql

# 5. Restore application code to matching version
git checkout $TARGET_TAG

# 6. Restart applications
docker start odoo18-prod-web seisei-erp-app qr-bff

# 7. Clear caches
docker exec odoo18-prod-web python3 -c "import odoo; odoo.cache.clear()"
EOF
fi

# AWS snapshot commands
if $SHOW_AWS; then
    section "AWS EBS Snapshot Rollback"

    cat << EOF
# Prerequisites:
# - AWS CLI configured
# - Instance ID and volume IDs known

# 1. Find instance and volume information
aws ec2 describe-instances \\
    --filters "Name=tag:Name,Values=seisei-production" \\
    --query 'Reservations[].Instances[].[InstanceId,BlockDeviceMappings[].Ebs.VolumeId]'

# 2. List available snapshots
aws ec2 describe-snapshots \\
    --owner-ids self \\
    --filters "Name=tag:Environment,Values=production" \\
    --query 'Snapshots[].[SnapshotId,StartTime,Description]' \\
    --output table

# 3. Create new volume from snapshot
aws ec2 create-volume \\
    --snapshot-id snap-xxxxxxxxx \\
    --availability-zone ap-northeast-1a \\
    --volume-type gp3 \\
    --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=seisei-rollback}]'

# 4. Stop instance
aws ec2 stop-instances --instance-ids i-xxxxxxxxx

# 5. Detach current volume
aws ec2 detach-volume --volume-id vol-current

# 6. Attach rollback volume
aws ec2 attach-volume \\
    --volume-id vol-rollback \\
    --instance-id i-xxxxxxxxx \\
    --device /dev/sda1

# 7. Start instance
aws ec2 start-instances --instance-ids i-xxxxxxxxx

# 8. Verify
ssh -i ~/Projects/Pem/odoo-2025.pem ubuntu@<new-ip>
docker ps
EOF
fi

section "Post-Rollback Verification"

cat << EOF
After rollback, verify:

1. All containers running:
   docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

2. No error logs:
   docker logs traefik --tail=20
   docker logs odoo18-prod-web --tail=20
   docker logs seisei-erp-app --tail=20

3. Endpoints responding:
   curl -s https://biznexus.seisei.tokyo/api/health
   curl -s https://testodoo.seisei.tokyo/web/health

4. Drift check passes:
   ./scripts/drift_check.sh --local

5. Update monitoring/alerting if needed
EOF

section "Emergency Contacts"

cat << EOF
- Infrastructure: Check #devops channel
- Database issues: Review pg_stat_activity
- Traefik routing: Check /srv/stacks/edge-traefik/logs/
EOF
