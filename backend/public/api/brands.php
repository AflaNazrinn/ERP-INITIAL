<?php
declare(strict_types=1);

/*
 * Brands and the items sold under them (item_brands).
 *   GET            → list (?q= search)
 *   GET ?id=N      → one record
 *   GET ?nextCode  → the code the next save will get (preview only)
 *   POST (JSON)    → create; 201 with the saved record, 422 with field errors
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/brands.php';

$method = allow_methods('GET', 'POST');
if ($method === 'POST') {
    json_out(brand_create(json_input()), 201);
}
if (isset($_GET['nextCode'])) {
    json_out(['code' => brand_next_code()]);
}
$id = query_id('id');
json_out($id !== null ? brand_find($id) : brands_list(query_search()));
