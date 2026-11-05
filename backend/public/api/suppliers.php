<?php
declare(strict_types=1);

/*
 * Suppliers (Party › Creditors) with contacts and supplier_brands.
 *   GET            → list (?q= search)
 *   GET ?id=N      → one record
 *   GET ?nextCode  → the code the next save will get (preview only)
 *   POST (JSON)    → create; 201 with the saved record, 422 with field errors
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/suppliers.php';

$method = allow_methods('GET', 'POST');
if ($method === 'POST') {
    json_out(supplier_create(json_input()), 201);
}
if (isset($_GET['nextCode'])) {
    json_out(['code' => supplier_next_code()]);
}
$id = query_id('id');
json_out($id !== null ? supplier_find($id) : suppliers_list(query_search()));
