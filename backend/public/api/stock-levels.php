<?php
declare(strict_types=1);

/*
 * Stock levels for the Supply Management screens (see src/supply.php).
 * GET ?warehouseId=N (blank: every stock point) [&adjustment=ID] [&transfer=ID] [&reservation=ID]
 *   → { "onHand": { itemId: "12" }, "reserved": { itemId: "3" } }
 * The document being edited (adjustment / transfer / reservation id) is left out of its own figures.
 * GET ?itemId=N → { "points": [ { warehouseId, code, name, qty } ] }: the stock points holding that item.
 * GET ?forDoc=dn|ti|st [&id=N] → { "onHand": { warehouseId|0: { itemId: qty } }, "defaultPoint": { itemId: warehouseId },
 *   "points": { warehouseId: name } }: what a Delivery Note, Tax Invoice or Stock Transfer may take out (the one being
 *   edited, id, left out of the figures), for its "only 10 available" check on the lines.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/supply.php';

allow_methods('GET');
$forDoc = (string) ($_GET['forDoc'] ?? '');
if ($forDoc !== '') {
    if (!in_array($forDoc, ['dn', 'ti', 'st'], true)) {
        throw new ValidationError(['forDoc' => 'Unknown document.']);
    }
    $docId = query_id('id');
    $matrix = stock_on_hand_matrix($docId !== null ? ['doc' => $forDoc, 'docId' => $docId] : []);
    $onHand = [];
    foreach ($matrix as $w => $byItem) {
        foreach ($byItem as $item => $qty) {
            $onHand[(string) $w][(string) $item] = round($qty, 3);
        }
    }
    $points = [];
    foreach (query('SELECT id, warehouse_name FROM warehouses')->fetchAll() as $w) {
        $points[(string) $w['id']] = $w['warehouse_name'];
    }
    json_out(['onHand' => (object) $onHand, 'defaultPoint' => (object) array_filter(stock_default_points(), static fn ($p) => $p !== null),
        'points' => (object) $points]);
}
$itemId = query_id('itemId');
if ($itemId !== null) {
    json_out(['points' => sm_item_stock_points($itemId)]);
}
$warehouseId = query_id('warehouseId');
json_out([
    'onHand' => (object) sm_stock_on_hand($warehouseId, query_id('adjustment') ?? 0, query_id('transfer') ?? 0),
    'reserved' => (object) sm_reserved($warehouseId, query_id('reservation') ?? 0),
]);
