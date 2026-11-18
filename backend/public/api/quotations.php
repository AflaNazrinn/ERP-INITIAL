<?php
declare(strict_types=1);

/*
 * Quotations (Trade Management).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/sales_book.php';

sb_serve('qt');
