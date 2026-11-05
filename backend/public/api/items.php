<?php
declare(strict_types=1);

/*
 * Item master with its sourcing rows.
 *   GET            → list (?q= search)
 *   GET ?id=N      → one record
 *   GET ?nextCode  → the code the next save will get (preview only)
 *   POST (JSON)    → create; 201 with the saved record, 422 with field errors
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/items.php';

$method = allow_methods('GET', 'POST');
if ($method === 'POST') {
    json_out(item_create(json_input()), 201);
}
if (isset($_GET['nextCode'])) {
    json_out(['code' => item_next_code()]);
}
$id = query_id('id');
json_out($id !== null ? item_find($id) : items_list(query_search()));
