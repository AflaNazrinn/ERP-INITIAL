<?php
declare(strict_types=1);

/*
 * Goods receipt notes (GRN, Purchase Book).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/purchase_book.php';

serve_master('grns_list', 'grn_find', 'grn_next_code', 'grn_save', 'grn_delete');
