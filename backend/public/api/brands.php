<?php
declare(strict_types=1);

/*
 * Brands and the items sold under them.
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/brands.php';

serve_master('brands_list', 'brand_find', 'brand_next_code', 'brand_save', 'brand_delete');
