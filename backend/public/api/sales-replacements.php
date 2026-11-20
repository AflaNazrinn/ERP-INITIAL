<?php
declare(strict_types=1);

/*
 * Sales replacements (Return & Replacement › Sales Replacement).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/sales_replacement.php';

serve_master('sales_replacements_list', 'sales_replacement_find', 'sales_replacement_next_code', 'sales_replacement_save', 'sales_replacement_delete');
