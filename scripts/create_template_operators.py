#!/usr/bin/env python3
"""
Create operator staff accounts (staff01/staff02/staff03) in Odoo template databases.

Operators get all business module permissions but NO access to Settings/Administration.
When a tenant is cloned from a template, these operators are inherited automatically.

Usage:
    python3 scripts/create_template_operators.py                    # All templates
    python3 scripts/create_template_operators.py --db ten_tpl_food_v1  # Single template

Environment variables (optional overrides):
    ODOO_URL          default: http://54.65.127.141:8069
    MASTER_USER       default: admin@seisei.tokyo
    MASTER_PASSWORD   default: Seisei@2026
"""

import argparse
import os
import sys
import xmlrpc.client

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ODOO_URL = os.environ.get("ODOO_URL", "http://54.65.127.141:8069")
MASTER_USER = os.environ.get("MASTER_USER", "admin@seisei.tokyo")
MASTER_PASSWORD = os.environ.get("MASTER_PASSWORD", "admin")

# Template databases (from tenant_create.sh + other known templates)
TEMPLATE_DATABASES = [
    "ten_tpl_food_v1",
    "ten_tpl_trade_v1",
    "ten_tpl_service_v1",
    "ten_tpl_b2b_v1",
    "tpl_consulting",
    "tpl_production",
    "tpl_realestate",
    "tpl_restaurant",
    "tpl_retail",
    "tpl_service",
]

# Operator accounts to create
OPERATORS = [
    {"login": "staff01", "name": "Staff 01", "password": "Seisei@Staff01"},
    {"login": "staff02", "name": "Staff 02", "password": "Seisei@Staff02"},
    {"login": "staff03", "name": "Staff 03", "password": "Seisei@Staff03"},
]

# Groups to EXCLUDE – these grant Settings / Access Rights visibility
EXCLUDED_GROUPS = [
    ("base", "group_system"),       # Settings menu
    ("base", "group_erp_manager"),  # Access Rights management
    ("base", "group_portal"),       # Portal user type (mutually exclusive with Internal)
    ("base", "group_public"),       # Public user type (mutually exclusive with Internal)
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_excluded_group_ids(models, db, uid, password):
    """Resolve XML IDs to res.groups IDs for the groups we want to exclude."""
    excluded_ids = set()
    for module, name in EXCLUDED_GROUPS:
        refs = models.execute_kw(
            db, uid, password,
            "ir.model.data", "search_read",
            [[["module", "=", module], ["name", "=", name], ["model", "=", "res.groups"]]],
            {"fields": ["res_id"], "limit": 1},
        )
        if refs:
            excluded_ids.add(refs[0]["res_id"])
            print(f"    Excluding group {module}.{name} (id={refs[0]['res_id']})")
        else:
            print(f"    [WARN] Group {module}.{name} not found – skipping exclusion")
    return excluded_ids


def get_operator_groups(models, db, uid, password):
    """Return list of group IDs: all groups minus the excluded admin groups."""
    all_groups = models.execute_kw(
        db, uid, password,
        "res.groups", "search", [[]],
    )
    excluded = get_excluded_group_ids(models, db, uid, password)
    operator_groups = [g for g in all_groups if g not in excluded]
    print(f"    Total groups: {len(all_groups)}, excluded: {len(excluded)}, "
          f"assigning: {len(operator_groups)}")
    return operator_groups


def create_or_update_operator(models, db, uid, password, operator, group_ids):
    """Create an operator user or update if it already exists."""
    login = operator["login"]

    existing = models.execute_kw(
        db, uid, password,
        "res.users", "search_read",
        [[["login", "=", login]]],
        {"fields": ["id", "login", "name"]},
    )

    vals = {
        "password": operator["password"],
        "groups_id": [(6, 0, group_ids)],
        "active": True,
    }

    if existing:
        user_id = existing[0]["id"]
        models.execute_kw(
            db, uid, password,
            "res.users", "write",
            [[user_id], vals],
        )
        print(f"    [UPDATED] {login} (id={user_id}) – password & groups refreshed")
    else:
        vals.update({
            "name": operator["name"],
            "login": login,
            "email": f"{login}@operator.local",
        })
        user_id = models.execute_kw(
            db, uid, password,
            "res.users", "create",
            [vals],
        )
        print(f"    [CREATED] {login} (id={user_id})")

    return user_id


# ---------------------------------------------------------------------------
# Main logic
# ---------------------------------------------------------------------------

def process_database(db_name):
    """Create/update all operator accounts in a single template database."""
    print(f"\n{'=' * 60}")
    print(f"Processing template: {db_name}")
    print("=" * 60)

    try:
        common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
        models = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")

        uid = common.authenticate(db_name, MASTER_USER, MASTER_PASSWORD, {})
        if not uid:
            print(f"  [ERROR] Authentication failed as {MASTER_USER}")
            return False

        print(f"  Authenticated as {MASTER_USER} (uid={uid})")

        # Compute operator groups once per database
        group_ids = get_operator_groups(models, db_name, uid, MASTER_PASSWORD)

        for op in OPERATORS:
            create_or_update_operator(models, db_name, uid, MASTER_PASSWORD, op, group_ids)

        print(f"  [OK] All operators processed for {db_name}")
        return True

    except Exception as e:
        print(f"  [ERROR] {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Create operator accounts in Odoo template databases",
    )
    parser.add_argument(
        "--db",
        help="Process a single template database instead of all",
    )
    args = parser.parse_args()

    databases = [args.db] if args.db else TEMPLATE_DATABASES

    print("=" * 60)
    print("Creating template operator accounts")
    print(f"  URL:    {ODOO_URL}")
    print(f"  Master: {MASTER_USER}")
    print(f"  Targets: {len(databases)} database(s)")
    print("=" * 60)

    success = 0
    failed = 0

    for db in databases:
        if process_database(db):
            success += 1
        else:
            failed += 1

    print(f"\n{'=' * 60}")
    print("SUMMARY")
    print("=" * 60)
    print(f"  Success: {success}/{len(databases)}")
    print(f"  Failed:  {failed}/{len(databases)}")

    if failed:
        print("\n[WARNING] Some databases failed. Check errors above.")
        sys.exit(1)
    else:
        print("\n[SUCCESS] Operator accounts ready in all template databases!")
        print("\nCredentials:")
        for op in OPERATORS:
            print(f"  {op['login']} / {op['password']}")


if __name__ == "__main__":
    main()
