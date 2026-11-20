<?php
declare(strict_types=1);

/*
 * Purchase replacements (Return & Replacement › Purchase Replacement).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/purchase_replacement.php';

serve_master('purchase_replacements_list', 'purchase_replacement_find', 'purchase_replacement_next_code', 'purchase_replacement_save', 'purchase_replacement_delete');
