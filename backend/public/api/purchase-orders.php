<?php
declare(strict_types=1);

/*
 * Purchase orders (Purchase Book).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/purchase_book.php';

serve_master('purchase_orders_list', 'purchase_order_find', 'purchase_order_next_code', 'purchase_order_save', 'purchase_order_delete');
