<?php
declare(strict_types=1);

/*
 * Quotation requests to suppliers (RFQ, Purchase Book).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/purchase_book.php';

serve_master('quotation_requests_list', 'quotation_request_find', 'quotation_request_next_code', 'quotation_request_save', 'quotation_request_delete');
