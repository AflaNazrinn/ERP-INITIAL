<?php
declare(strict_types=1);

/*
 * Sub-category lookup.
 *   GET               → every sub-category of the active categories (?q= search)
 *   GET ?categoryId=N → only that category's
 * Sub-categories are created with their category (POST categories.php).
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/categories.php';

allow_methods('GET');
json_out(sub_categories_list(query_id('categoryId'), query_search()));
