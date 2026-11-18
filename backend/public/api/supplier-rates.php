<?php
declare(strict_types=1);

/*
 * The prices each supplier has given for items, for the Sales Order's Auto-Select Best Supplier:
 *   GET → [{ supplierId, supplierName, currency, itemId, itemName, rate, source }, …], newest first.
 * From the supplier's quotation lines (Supplier › Quotations), its purchase order lines, and the buying costs
 * of earlier multi-supplier sales orders. A rate of 0 is left out.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';

allow_methods('GET');
$rows = [];
$add = static function (array $r, string $source) use (&$rows): void {
    if ((float) $r['rate'] <= 0) {
        return;
    }
    $rows[] = ['supplierId' => (int) $r['supplier_id'], 'supplierName' => $r['supplier_name'], 'currency' => strtoupper((string) $r['currency']),
        'itemId' => $r['item_id'] === null ? null : (int) $r['item_id'], 'itemName' => (string) $r['item_name'], 'rate' => $r['rate'], 'source' => $source];
};
foreach (query('SELECT q.supplier_id, s.supplier_name, s.currency, NULL AS item_id, q.item_name, q.rate
                FROM supplier_quotation_items q JOIN suppliers s ON s.id = q.supplier_id WHERE s.status = \'active\'
                ORDER BY q.id DESC')->fetchAll() as $r) {
    $add($r, 'Supplier quotation');
}
foreach (query('SELECT o.supplier_id, s.supplier_name, o.currency, l.item_id, l.item_name, l.price AS rate
                FROM purchase_order_items l JOIN purchase_orders o ON o.id = l.purchase_order_id JOIN suppliers s ON s.id = o.supplier_id
                WHERE l.foc = 0 ORDER BY o.po_date DESC, l.id DESC')->fetchAll() as $r) {
    $add($r, 'Purchase order');
}
foreach (query('SELECT l.supplier_id, s.supplier_name, COALESCE(NULLIF(l.supplier_currency, \'\'), s.currency) AS currency, l.item_id, l.item_name,
                       l.buying_cost AS rate
                FROM sales_order_items l JOIN suppliers s ON s.id = l.supplier_id ORDER BY l.id DESC')->fetchAll() as $r) {
    $add($r, 'Sales order');
}
json_out($rows);
