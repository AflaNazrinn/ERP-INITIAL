<?php
declare(strict_types=1);

/*
 * What an item was last bought for, for the Sales Order's Buying Cost:
 *   GET ?itemId=12[&supplierId=3] → { rate, currency, supplierId, supplierName, source, code, date } or null.
 * The newest bill in Purchase Entry (what was paid), else the newest GRN's unit cost (accepted goods), else the
 * newest purchase order price. With supplierId, that supplier's purchases first, then any supplier's.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';

allow_methods('GET');
$itemId = (int) ($_GET['itemId'] ?? 0);
$supplierId = (int) ($_GET['supplierId'] ?? 0);
if ($itemId <= 0) {
    json_out(null);
}

$sources = [
    'Purchase entry' => 'SELECT l.price AS rate, d.currency, d.supplier_id, s.supplier_name, d.pe_code AS code, d.pe_date AS date
                         FROM purchase_entry_items l JOIN purchase_entries d ON d.id = l.purchase_entry_id
                         JOIN suppliers s ON s.id = d.supplier_id
                         WHERE l.item_id = ? AND l.price > 0 AND l.foc = 0 %s ORDER BY d.pe_date DESC, d.id DESC LIMIT 1',
    'GRN'            => 'SELECT l.unit_cost AS rate, s.currency, d.supplier_id, s.supplier_name, d.grn_code AS code, d.grn_date AS date
                         FROM grn_items l JOIN grns d ON d.id = l.grn_id JOIN suppliers s ON s.id = d.supplier_id
                         WHERE l.item_id = ? AND l.unit_cost > 0 AND l.accepted_qty > 0 %s ORDER BY d.grn_date DESC, d.id DESC LIMIT 1',
    'Purchase order' => 'SELECT l.price AS rate, d.currency, d.supplier_id, s.supplier_name, d.po_code AS code, d.po_date AS date
                         FROM purchase_order_items l JOIN purchase_orders d ON d.id = l.purchase_order_id
                         JOIN suppliers s ON s.id = d.supplier_id
                         WHERE l.item_id = ? AND l.price > 0 AND l.foc = 0 %s ORDER BY d.po_date DESC, d.id DESC LIMIT 1',
];

foreach ($supplierId > 0 ? [true, false] : [false] as $ofSupplier) {
    foreach ($sources as $source => $sql) {
        $row = query(sprintf($sql, $ofSupplier ? 'AND d.supplier_id = ?' : ''), $ofSupplier ? [$itemId, $supplierId] : [$itemId])->fetch();
        if ($row) {
            json_out(['rate' => $row['rate'], 'currency' => strtoupper((string) $row['currency']), 'supplierId' => (int) $row['supplier_id'],
                'supplierName' => $row['supplier_name'], 'source' => $source, 'code' => $row['code'], 'date' => $row['date']]);
        }
    }
}
json_out(null);
