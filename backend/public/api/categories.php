<?php
declare(strict_types=1);

/*
 * Categories with their sub-categories.
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/categories.php';

serve_master('categories_list', 'category_find', 'category_next_code', 'category_save', 'category_delete');
