<?php
declare(strict_types=1);

/*
 * Rack / bin lookup.
 *   GET                → every active location (?q= search)
 *   GET ?warehouseId=N → only that warehouse's
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/warehouses.php';

allow_methods('GET');
json_out(rack_bins_list(query_id('warehouseId'), query_search()));
