<?php
declare(strict_types=1);

/*
 * Purchase requests (Purchase Book).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 * GET ?people=1: the employees for the Filter's Employee list (pb_people()).
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/purchase_book.php';

// GET ?people=1 → every employee's code, name, status and username, for the Purchase Book Filter's Employee list.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && isset($_GET['people'])) {
    json_out(pb_people());
}
serve_master('purchase_requests_list', 'purchase_request_find', 'purchase_request_next_code', 'purchase_request_save', 'purchase_request_delete');
