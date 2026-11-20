<?php
declare(strict_types=1);

/*
 * Purchase returns (Return & Replacement › Purchase Return).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/purchase_return.php';

serve_master('purchase_returns_list', 'purchase_return_find', 'purchase_return_next_code', 'purchase_return_save', 'purchase_return_delete');
