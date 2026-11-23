<?php
declare(strict_types=1);

/*
 * Stock Ledger › Damaged Stock › Move to Stock.
 * POST { "key": "sr:12:5", "qty": 3, "description": "Repaired and pressure tested" } → { key, qty, left }
 * Takes the quantity off that damaged line and adds it to the stock on hand (history: Damage Restock).
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/stock_report.php';

allow_methods('POST');
lock_writes();
json_out(damage_restock_save(json_input()), 201);
