from . import models
from . import wizard


def _pre_init_migrate_accounts(env):
    """Pre-init hook: migrate Selection-based account fields to integer (Many2one)
    BEFORE the ORM tries to reconcile column types.

    This runs with a raw cursor (env is actually cr for pre_init_hook).
    """
    cr = env

    # Check if ocr_document_line table exists and debit_account is still varchar
    cr.execute("""
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'ocr_document_line' AND column_name = 'debit_account'
    """)
    row = cr.fetchone()
    if not row or row[0] in ('integer', 'bigint'):
        # Fresh install or already migrated
        return

    # ---------------------------------------------------------------
    # Step 1: Create ocr_account table and seed data manually
    # (The ORM hasn't created it yet in pre_init_hook)
    # ---------------------------------------------------------------
    cr.execute("""
        CREATE TABLE IF NOT EXISTS ocr_account (
            id SERIAL PRIMARY KEY,
            name VARCHAR NOT NULL,
            code VARCHAR NOT NULL,
            account_type VARCHAR NOT NULL,
            yayoi_name VARCHAR,
            sequence INTEGER DEFAULT 10,
            active BOOLEAN DEFAULT TRUE,
            display_name VARCHAR,
            create_uid INTEGER,
            create_date TIMESTAMP DEFAULT now(),
            write_uid INTEGER,
            write_date TIMESTAMP DEFAULT now()
        )
    """)

    # Seed data
    seed = [
        # Debit accounts
        ('仕入高', 'shiire', 'debit', '仕入高', 10),
        ('消耗品費', 'shoumouhin', 'debit', '消耗品費', 20),
        ('事務用品費', 'jimu', 'debit', '事務用品費', 30),
        ('交際費', 'kousai', 'debit', '交際費', 40),
        ('会議費', 'kaigi', 'debit', '会議費', 50),
        ('旅費交通費', 'ryohi', 'debit', '旅費交通費', 60),
        ('通信費', 'tsuushin', 'debit', '通信費', 70),
        ('水道光熱費', 'suido', 'debit', '水道光熱費', 80),
        ('租税公課', 'sozei', 'debit', '租税公課', 90),
        ('雑費', 'zappi', 'debit', '雑費', 100),
        # Credit accounts
        ('現金', 'genkin', 'credit', '現金', 10),
        ('普通預金', 'yokin', 'credit', '普通預金', 20),
        ('買掛金', 'kaikake', 'credit', '買掛金', 30),
        ('未払金', 'miharai', 'credit', '未払金', 40),
        ('クレジットカード', 'card', 'credit', 'クレジットカード', 50),
    ]

    for name, code, atype, yname, seq in seed:
        cr.execute("""
            INSERT INTO ocr_account (name, code, account_type, yayoi_name, sequence, display_name)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
        """, (name, code, atype, yname, seq, name))

    # Build code → id map
    cr.execute("SELECT id, code, account_type FROM ocr_account")
    account_map = {}
    for aid, code, atype in cr.fetchall():
        account_map[(code, atype)] = aid

    # ---------------------------------------------------------------
    # Step 2: Migrate ocr_document_line columns
    # ---------------------------------------------------------------
    _migrate_table_columns(cr, 'ocr_document_line', [
        ('debit_account', 'debit'),
        ('credit_account', 'credit'),
        ('ocr_debit_account', 'debit'),
        ('ocr_credit_account', 'credit'),
    ], account_map)

    # ---------------------------------------------------------------
    # Step 3: Migrate ocr_client columns
    # ---------------------------------------------------------------
    _migrate_table_columns(cr, 'ocr_client', [
        ('default_debit_account', 'debit'),
        ('default_credit_account', 'credit'),
    ], account_map)

    # ---------------------------------------------------------------
    # Step 4: Migrate ocr_account_rule columns
    # ---------------------------------------------------------------
    _migrate_table_columns(cr, 'ocr_account_rule', [
        ('debit_account', 'debit'),
        ('credit_account', 'credit'),
    ], account_map)


def _migrate_table_columns(cr, table, columns, account_map):
    """Convert varchar selection columns to integer Many2one columns."""
    for col, atype in columns:
        cr.execute("""
            SELECT data_type FROM information_schema.columns
            WHERE table_name = %s AND column_name = %s
        """, (table, col))
        row = cr.fetchone()
        if not row or row[0] in ('integer', 'bigint'):
            continue

        # Rename old → _old, create new integer column
        cr.execute(f'ALTER TABLE {table} RENAME COLUMN "{col}" TO "{col}_old"')
        cr.execute(f'ALTER TABLE {table} ADD COLUMN "{col}" INTEGER')

        # Copy mapped values
        for (code, at), acct_id in account_map.items():
            if at == atype:
                cr.execute(f"""
                    UPDATE {table} SET "{col}" = %s WHERE "{col}_old" = %s
                """, (acct_id, code))

        # Drop old column
        cr.execute(f'ALTER TABLE {table} DROP COLUMN "{col}_old"')
