<?php
declare(strict_types=1);

/*
 * Suppliers (Party › Creditors) with contacts, brands, quotations, orders and documents.
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/suppliers.php';

serve_master('suppliers_list', 'supplier_find', 'supplier_next_code', 'supplier_save', 'supplier_delete');
