<?php
declare(strict_types=1);

/*
 * Item master with its sourcing rows.
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/items.php';

serve_master('items_list', 'item_find', 'item_next_code', 'item_save', 'item_delete');
