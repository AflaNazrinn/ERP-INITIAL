<?php
declare(strict_types=1);

/*
 * Customers (Party › Debtors) with contacts, quotations, orders and documents.
 * GET list / one / next code, POST create, PUT update, DELETE: see serve_master() in src/api_bootstrap.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/customers.php';

serve_master('customers_list', 'customer_find', 'customer_next_code', 'customer_save', 'customer_delete');
