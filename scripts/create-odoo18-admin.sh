#!/bin/bash
# Create admin@seisei.tokyo in all Odoo 18 tenant databases

ADMIN_EMAIL="admin@seisei.tokyo"
ADMIN_NAME="Seisei Admin"
PASSWORD_HASH='$pbkdf2-sha512$600000$dy4lRKj1PscYY8w5h3DuXQ$cHoiI8OOCQLoCPwHd.2fdbl8v1BsXztVndI90OsCDd3R3Hf2dx6jTgUrJ.5YFAXmDqtbTOcUirgla6Aw0JPvWg'

DATABASES="ten_00000001 ten_00000002 ten_mkpkc8d7 ten_mkqxyts2 ten_mkqyqs61 ten_mkqznir8 ten_mkqzyn00 ten_test123 ten_testodoo"

cd /opt/seisei-odoo

run_sql() {
    local db=$1
    local sql=$2
    docker compose exec -T db psql -U odoo -d "$db" -t -c "$sql" 2>&1
}

echo "============================================================"
echo "Creating unified admin account: $ADMIN_EMAIL"
echo "============================================================"

success_count=0

for db in $DATABASES; do
    echo ""
    echo "=================================================="
    echo "Processing database: $db"
    echo "=================================================="

    # Check if user already exists
    existing=$(run_sql "$db" "SELECT id FROM res_users WHERE login = '$ADMIN_EMAIL'")
    existing_id=$(echo "$existing" | grep -oE '[0-9]+' | head -1)

    if [ -n "$existing_id" ]; then
        echo "  User exists (id=$existing_id), updating password..."
        run_sql "$db" "UPDATE res_users SET password = '$PASSWORD_HASH' WHERE login = '$ADMIN_EMAIL'" > /dev/null
        echo "  [OK] Password updated"
        success_count=$((success_count + 1))
        continue
    fi

    # Get company_id first
    company_id=$(run_sql "$db" "SELECT id FROM res_company ORDER BY id LIMIT 1" | grep -oE '[0-9]+' | head -1)
    if [ -z "$company_id" ]; then
        echo "  [ERROR] No company found in database"
        continue
    fi
    echo "  Using company_id=$company_id"

    # Create partner with explicit company_id value (autopost_bills is required in Odoo 18)
    partner_result=$(run_sql "$db" "INSERT INTO res_partner (name, email, company_id, active, type, autopost_bills, create_uid, write_uid, create_date, write_date) VALUES ('$ADMIN_NAME', '$ADMIN_EMAIL', $company_id, true, 'contact', 'ask', 1, 1, now(), now()) RETURNING id")

    partner_id=$(echo "$partner_result" | grep -oE '[0-9]+' | head -1)

    if [ -z "$partner_id" ]; then
        echo "  [ERROR] Failed to create partner: $partner_result"
        continue
    fi
    echo "  Created partner id=$partner_id"

    # Create user with explicit values
    user_result=$(run_sql "$db" "INSERT INTO res_users (partner_id, login, password, active, company_id, notification_type, share, create_uid, write_uid, create_date, write_date) VALUES ($partner_id, '$ADMIN_EMAIL', '$PASSWORD_HASH', true, $company_id, 'inbox', false, 1, 1, now(), now()) RETURNING id")

    user_id=$(echo "$user_result" | grep -oE '[0-9]+' | head -1)

    if [ -z "$user_id" ]; then
        echo "  [ERROR] Failed to create user: $user_result"
        continue
    fi
    echo "  Created user id=$user_id"

    # Copy groups from user ID 2 (typically the first admin)
    run_sql "$db" "INSERT INTO res_groups_users_rel (gid, uid) SELECT gid, $user_id FROM res_groups_users_rel WHERE uid = 2 ON CONFLICT DO NOTHING" > /dev/null 2>&1

    # Add admin group (base.group_system)
    run_sql "$db" "INSERT INTO res_groups_users_rel (gid, uid) SELECT res_id, $user_id FROM ir_model_data WHERE module = 'base' AND name = 'group_system' ON CONFLICT DO NOTHING" > /dev/null 2>&1

    # Add to all companies
    run_sql "$db" "INSERT INTO res_company_users_rel (cid, user_id) SELECT id, $user_id FROM res_company ON CONFLICT DO NOTHING" > /dev/null 2>&1

    echo "  [OK] Created admin user $ADMIN_EMAIL (id=$user_id)"
    success_count=$((success_count + 1))
done

echo ""
echo "============================================================"
echo "SUMMARY"
echo "============================================================"
echo "Success: $success_count/9"
echo ""
echo "Login credentials:"
echo "  Email:    $ADMIN_EMAIL"
echo "  Password: Seisei@2026"
