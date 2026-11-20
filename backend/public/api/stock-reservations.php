<?php
declare(strict_types=1);

/*
 * Stock reservations (Supply Management › Stock Reservation).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/supply.php';

serve_master('stock_reservations_list', 'stock_reservation_find', 'stock_reservation_next_code', 'stock_reservation_save', 'stock_reservation_delete');
