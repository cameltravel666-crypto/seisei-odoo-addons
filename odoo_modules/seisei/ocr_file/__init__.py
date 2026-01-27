# -*- coding: utf-8 -*-

from . import models
from . import controllers
from . import wizard


def _post_init_fix_null_states(env):
    """Fix NULL state values in ocr.file.task and recompute source_file_count"""
    env.cr.execute("""
        UPDATE ocr_file_task SET state = 'draft' WHERE state IS NULL;
    """)
    env.cr.execute("""
        UPDATE ocr_file_source SET state = 'pending' WHERE state IS NULL;
    """)
    # Recompute source_file_count for all tasks
    tasks = env['ocr.file.task'].search([])
    tasks._compute_source_file_count()
