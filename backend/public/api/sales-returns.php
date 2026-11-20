<?php
declare(strict_types=1);

/*
 * Sales returns (Return & Replacement › Sales Return).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/sales_return.php';

serve_master('sales_returns_list', 'sales_return_find', 'sales_return_next_code', 'sales_return_save', 'sales_return_delete');
