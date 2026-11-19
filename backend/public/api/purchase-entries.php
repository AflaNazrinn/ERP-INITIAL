<?php
declare(strict_types=1);

/*
 * Purchase entries (Transaction Entry › Purchase Entry).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/purchase_entry.php';

serve_master('purchase_entries_list', 'purchase_entry_find', 'purchase_entry_next_code', 'purchase_entry_save', 'purchase_entry_delete');
