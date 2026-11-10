<?php
declare(strict_types=1);

/*
 * Stock points (the warehouses table): offices, warehouses and shops.
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/warehouses.php';

serve_master('warehouses_list', 'warehouse_find', 'warehouse_next_code', 'warehouse_save', 'warehouse_delete');
