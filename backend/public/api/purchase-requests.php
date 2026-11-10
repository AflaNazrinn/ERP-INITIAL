<?php
declare(strict_types=1);

/*
 * Purchase requests (Purchase Book).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/purchase_book.php';

serve_master('purchase_requests_list', 'purchase_request_find', 'purchase_request_next_code', 'purchase_request_save', 'purchase_request_delete');
