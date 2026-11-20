<?php
declare(strict_types=1);

/*
 * Stock transfers (Supply Management › Stock Transfer).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/supply.php';

serve_master('stock_transfers_list', 'stock_transfer_find', 'stock_transfer_next_code', 'stock_transfer_save', 'stock_transfer_delete');
