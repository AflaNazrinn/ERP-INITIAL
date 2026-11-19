<?php
declare(strict_types=1);

/*
 * Sales entries (Transaction Entry › Sales Entry).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/sales_entry.php';

serve_master('sales_entries_list', 'sales_entry_find', 'sales_entry_next_code', 'sales_entry_save', 'sales_entry_delete');
