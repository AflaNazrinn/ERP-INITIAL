<?php
declare(strict_types=1);

/*
 * Stock levels for the Supply Management screens (see src/supply.php).
 * GET ?warehouseId=N (blank: every stock point) [&adjustment=ID] [&transfer=ID] [&reservation=ID]
 *   → { "onHand": { itemId: "12" }, "reserved": { itemId: "3" } }
 * The document being edited (adjustment / transfer / reservation id) is left out of its own figures.
 * GET ?itemId=N → { "points": [ { warehouseId, code, name, qty } ] }: the stock points holding that item.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/supply.php';

allow_methods('GET');
$itemId = query_id('itemId');
if ($itemId !== null) {
    json_out(['points' => sm_item_stock_points($itemId)]);
}
$warehouseId = query_id('warehouseId');
json_out([
    'onHand' => (object) sm_stock_on_hand($warehouseId, query_id('adjustment') ?? 0, query_id('transfer') ?? 0),
    'reserved' => (object) sm_reserved($warehouseId, query_id('reservation') ?? 0),
]);
