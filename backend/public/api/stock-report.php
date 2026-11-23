<?php
declare(strict_types=1);

/*
 * The Stock Report (Supply Management › Stock Report): GET → { generatedAt, movements, damaged, items, stockPoints }.
 * Every stock movement worked out from the documents (src/stock_report.php); the page sums it per item and stock point.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/stock_report.php';

allow_methods('GET');
json_out(stock_report());
