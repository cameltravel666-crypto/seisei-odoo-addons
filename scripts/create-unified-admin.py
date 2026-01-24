#!/usr/bin/env python3
"""
Create unified admin account admin@seisei.tokyo across all Odoo 18 tenant databases
"""

import xmlrpc.client
import ssl
import sys

# Configuration
ODOO_URL = "http://54.65.127.141:8069"
ADMIN_EMAIL = "admin@seisei.tokyo"
ADMIN_PASSWORD = "Seisei@2026"
ADMIN_NAME = "Seisei Admin"

# Master credentials (existing admin to create new user)
MASTER_USER = "Josh"
MASTER_PASSWORD = "wind1982"

# All tenant databases
DATABASES = [
    "ten_00000001",
    "ten_00000002",
    "ten_mkpkc8d7",
    "ten_mkqxyts2",
    "ten_mkqyqs61",
    "ten_mkqznir8",
    "ten_mkqzyn00",
    "ten_test123",
    "ten_testodoo",
]

def create_admin_in_db(db_name):
    """Create admin@seisei.tokyo in a specific database"""
    print(f"\n{'='*50}")
    print(f"Processing database: {db_name}")
    print('='*50)

    try:
        # XML-RPC endpoints
        common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')
        models = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/object')

        # Authenticate with master credentials
        uid = common.authenticate(db_name, MASTER_USER, MASTER_PASSWORD, {})
        if not uid:
            print(f"  [ERROR] Failed to authenticate as {MASTER_USER}")
            return False

        print(f"  Authenticated as {MASTER_USER} (uid={uid})")

        # Check if admin@seisei.tokyo already exists
        existing = models.execute_kw(
            db_name, uid, MASTER_PASSWORD,
            'res.users', 'search_read',
            [[['login', '=', ADMIN_EMAIL]]],
            {'fields': ['id', 'login', 'name']}
        )

        if existing:
            print(f"  [SKIP] User {ADMIN_EMAIL} already exists (id={existing[0]['id']})")
            # Update password if user exists
            models.execute_kw(
                db_name, uid, MASTER_PASSWORD,
                'res.users', 'write',
                [[existing[0]['id']], {'password': ADMIN_PASSWORD}]
            )
            print(f"  [OK] Password updated for existing user")
            return True

        # Get the Settings (Administration) group for full admin access
        admin_group = models.execute_kw(
            db_name, uid, MASTER_PASSWORD,
            'res.groups', 'search',
            [[['category_id.name', 'ilike', 'Administration'], ['name', 'ilike', 'Settings']]],
            {'limit': 1}
        )

        if not admin_group:
            # Try alternative: base.group_system
            admin_group = models.execute_kw(
                db_name, uid, MASTER_PASSWORD,
                'ir.model.data', 'search_read',
                [[['module', '=', 'base'], ['name', '=', 'group_system']]],
                {'fields': ['res_id'], 'limit': 1}
            )
            if admin_group:
                admin_group = [admin_group[0]['res_id']]

        # Get all groups to give full access
        all_groups = models.execute_kw(
            db_name, uid, MASTER_PASSWORD,
            'res.groups', 'search',
            [[]]
        )

        print(f"  Found {len(all_groups)} groups to assign")

        # Create new user with all groups
        user_vals = {
            'name': ADMIN_NAME,
            'login': ADMIN_EMAIL,
            'email': ADMIN_EMAIL,
            'password': ADMIN_PASSWORD,
            'groups_id': [(6, 0, all_groups)],  # Assign all groups
            'active': True,
        }

        new_user_id = models.execute_kw(
            db_name, uid, MASTER_PASSWORD,
            'res.users', 'create',
            [user_vals]
        )

        print(f"  [OK] Created user {ADMIN_EMAIL} (id={new_user_id})")
        return True

    except Exception as e:
        print(f"  [ERROR] {str(e)}")
        return False

def main():
    print("="*60)
    print("Creating unified admin account: admin@seisei.tokyo")
    print("="*60)

    success_count = 0
    fail_count = 0

    for db in DATABASES:
        if create_admin_in_db(db):
            success_count += 1
        else:
            fail_count += 1

    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"Success: {success_count}/{len(DATABASES)}")
    print(f"Failed:  {fail_count}/{len(DATABASES)}")

    if fail_count > 0:
        print("\n[WARNING] Some databases failed. Check errors above.")
        sys.exit(1)
    else:
        print("\n[SUCCESS] Admin account created in all databases!")
        print(f"\nLogin credentials:")
        print(f"  Email:    {ADMIN_EMAIL}")
        print(f"  Password: {ADMIN_PASSWORD}")

if __name__ == "__main__":
    main()
