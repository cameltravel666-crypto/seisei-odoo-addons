# -*- coding: utf-8 -*-
# Post-migration script to add unique constraint

def migrate(cr, version):
    """Add unique constraint on (tenant_id, store_code, effective_month)."""
    # Check if constraint already exists
    cr.execute("""
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'vendor_ops_intake_batch' 
        AND constraint_name = 'unique_tenant_store_month'
    """)
    
    if not cr.fetchone():
        cr.execute("""
            ALTER TABLE vendor_ops_intake_batch
            ADD CONSTRAINT unique_tenant_store_month 
            UNIQUE (tenant_id, store_code, effective_month)
        """)

