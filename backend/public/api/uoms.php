<?php
declare(strict_types=1);

/*
 * Units of measure (uoms).
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/uoms.php';

serve_master('uoms_list', 'uom_find', 'uom_next_code', 'uom_save', 'uom_delete');
