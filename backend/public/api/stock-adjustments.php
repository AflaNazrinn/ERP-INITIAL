<?php
declare(strict_types=1);

/*
 * Stock adjustments (Supply Management › Stock Adjustment).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/supply.php';

serve_master('stock_adjustments_list', 'stock_adjustment_find', 'stock_adjustment_next_code', 'stock_adjustment_save', 'stock_adjustment_delete');
