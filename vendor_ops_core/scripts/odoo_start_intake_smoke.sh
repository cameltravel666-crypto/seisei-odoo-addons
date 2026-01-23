#!/bin/bash
# Part D: Acceptance test script for Start Intake functionality
# Usage: ./scripts/odoo_start_intake_smoke.sh [ODOO_URL] [ODOO_DB] [ODOO_USER] [ODOO_PASSWORD]

set -euo pipefail

ODOO_URL="${1:-http://127.0.0.1:8069}"
ODOO_DB="${2:-opss_seisei_tokyo}"
ODOO_USER="${3:-admin}"
ODOO_PASSWORD="${4:-admin}"

TEST_TENANT_CODE="TEN-000007"
TEST_STORE="S001"
TEST_MONTH="2026-01"

echo "=========================================="
echo "Odoo Start Intake Smoke Test"
echo "=========================================="
echo "Odoo URL: $ODOO_URL"
echo "Database: $ODOO_DB"
echo "User: $ODOO_USER"
echo ""

# Python script to execute via Odoo shell
PYTHON_SCRIPT=$(cat <<'PYEOF'
import sys
import xmlrpc.client

# Connect to Odoo
url = sys.argv[1]
db = sys.argv[2]
username = sys.argv[3]
password = sys.argv[4]
tenant_code = sys.argv[5]
store_code = sys.argv[6]
effective_month = sys.argv[7]

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})

if not uid:
    print("ERROR: Authentication failed")
    sys.exit(1)

models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# 1) Find or create tenant
print("1) Finding tenant...")
tenant_ids = models.execute_kw(
    db, uid, password,
    'vendor.ops.tenant', 'search',
    [[('code', '=', tenant_code)]]
)

if not tenant_ids:
    print(f"   Tenant {tenant_code} not found, creating...")
    tenant_id = models.execute_kw(
        db, uid, password,
        'vendor.ops.tenant', 'create',
        [{'name': f'Test Tenant {tenant_code}', 'code': tenant_code}]
    )
    print(f"   Created tenant ID: {tenant_id}")
else:
    tenant_id = tenant_ids[0]
    print(f"   Found tenant ID: {tenant_id}")

# 2) Trigger Start Intake wizard
print("")
print("2) Triggering Start Intake wizard...")
wizard_id = models.execute_kw(
    db, uid, password,
    'vendor.ops.start.intake.wizard', 'create',
    [{
        'tenant_id': tenant_id,
        'store_code': store_code,
        'effective_month': effective_month,
        'note': 'Smoke test batch'
    }]
)
print(f"   Created wizard ID: {wizard_id}")

# Call action_start_intake
print("   Calling action_start_intake...")
try:
    result = models.execute_kw(
        db, uid, password,
        'vendor.ops.start.intake.wizard', 'action_start_intake',
        [[wizard_id]]
    )
    print(f"   Result: {result}")
except Exception as e:
    print(f"   ERROR: {e}")
    sys.exit(1)

# 3) Verify batch record
print("")
print("3) Verifying batch record...")
batch_ids = models.execute_kw(
    db, uid, password,
    'vendor.ops.intake.batch', 'search',
    [[('tenant_id', '=', tenant_id), ('store_code', '=', store_code), ('effective_month', '=', effective_month)]]
)

if not batch_ids:
    print("   ERROR: Batch not found")
    sys.exit(1)

batch_id = batch_ids[0]
batch_data = models.execute_kw(
    db, uid, password,
    'vendor.ops.intake.batch', 'read',
    [[batch_id], ['bridge_batch_id', 'client_record_url', 'notion_pack_url', 'status']]
)[0]

print(f"   Batch ID: {batch_id}")
print(f"   Bridge Batch ID: {batch_data.get('bridge_batch_id', 'N/A')}")
print(f"   Client Record URL: {batch_data.get('client_record_url', 'N/A')}")
print(f"   Notion Pack URL: {batch_data.get('notion_pack_url', 'N/A')}")
print(f"   Status: {batch_data.get('status', 'N/A')}")

# 4) Validation
print("")
print("4) Validation:")
errors = []

if not batch_data.get('bridge_batch_id'):
    errors.append("bridge_batch_id is empty")
    print("   ❌ bridge_batch_id is empty")
else:
    print(f"   ✓ bridge_batch_id: {batch_data['bridge_batch_id']}")

if not batch_data.get('client_record_url'):
    errors.append("client_record_url is empty")
    print("   ❌ client_record_url is empty")
else:
    print(f"   ✓ client_record_url: {batch_data['client_record_url']}")
    # Check if it's a valid Notion URL
    if 'notion.so' in batch_data['client_record_url']:
        print("   ✓ URL format is valid (contains notion.so)")
    else:
        print("   ⚠ URL format may be invalid")

if not batch_data.get('notion_pack_url'):
    print("   ⚠ notion_pack_url is empty (optional)")
else:
    print(f"   ✓ notion_pack_url: {batch_data['notion_pack_url']}")
    if 'notion.so' in batch_data['notion_pack_url']:
        print("   ✓ URL format is valid (contains notion.so)")

if batch_data.get('status') != 'collecting':
    errors.append(f"status is {batch_data.get('status')}, expected 'collecting'")
    print(f"   ❌ status: {batch_data.get('status')} (expected 'collecting')")
else:
    print(f"   ✓ status: {batch_data['status']}")

# 5) Test idempotency
print("")
print("5) Testing idempotency (create same batch again)...")
wizard_id2 = models.execute_kw(
    db, uid, password,
    'vendor.ops.start.intake.wizard', 'create',
    [{
        'tenant_id': tenant_id,
        'store_code': store_code,
        'effective_month': effective_month,
    }]
)

try:
    result2 = models.execute_kw(
        db, uid, password,
        'vendor.ops.start.intake.wizard', 'action_start_intake',
        [[wizard_id2]]
    )
    batch_ids2 = models.execute_kw(
        db, uid, password,
        'vendor.ops.intake.batch', 'search',
        [[('tenant_id', '=', tenant_id), ('store_code', '=', store_code), ('effective_month', '=', effective_month)]]
    )
    
    if len(batch_ids2) == 1 and batch_ids2[0] == batch_id:
        print(f"   ✓ Idempotency OK: Same batch ID {batch_id} returned")
    else:
        errors.append(f"Idempotency failed: Expected 1 batch, got {len(batch_ids2)}")
        print(f"   ❌ Idempotency failed: {len(batch_ids2)} batches found")
except Exception as e:
    errors.append(f"Idempotency test error: {e}")
    print(f"   ❌ Error: {e}")

# Summary
print("")
print("==========================================")
print("Summary")
print("==========================================")
if errors:
    print("❌ FAILED:")
    for error in errors:
        print(f"  - {error}")
    sys.exit(1)
else:
    print("✓ All validations passed")
    sys.exit(0)
PYEOF
)

# Execute Python script
echo "$PYTHON_SCRIPT" | python3 - "$ODOO_URL" "$ODOO_DB" "$ODOO_USER" "$ODOO_PASSWORD" "$TEST_TENANT_CODE" "$TEST_STORE" "$TEST_MONTH"

