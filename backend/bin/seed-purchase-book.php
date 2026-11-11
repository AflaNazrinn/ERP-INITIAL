<?php
declare(strict_types=1);

/*
 * Adds demo Purchase Book documents: 3 purchase requests, 3 quotation requests (from those requests),
 * 3 purchase orders (from those quotations) and 3 GRNs (receiving those orders).
 * They are saved through the same functions the API uses, so codes, validation and totals are the real ones.
 * The lines use the suppliers, items and stock points already in the database (purchase request lines must be
 * Item master items, so at least one item is needed). Every demo document's remarks start with "Demo data", so they are easy to find and delete.
 * Refuses to run twice (when a demo purchase request already exists).
 *
 *   With SSH:     php backend/bin/seed-purchase-book.php
 *   Without SSH:  upload this file to public_html/api/seed-purchase-book.php, open
 *                 https://<your-domain>/api/seed-purchase-book.php once, read the result, then DELETE the file.
 */

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    ini_set('display_errors', '0');
}

// backend/bin/ in the repository, or public_html/api/ on Hostinger (src/ is next to public_html).
$root = is_dir(__DIR__ . '/../src') ? dirname(__DIR__) : dirname(__DIR__, 2);
require_once "$root/src/purchase_book.php";

const DEMO = 'Demo data';
$say = static fn (string $line) => print($line . "\n");
$created = [];                                   // [table, id], removed again if a later document fails

// A failed run leaves nothing behind: the documents already saved are deleted, newest first (lines cascade).
$undo = static function () use (&$created): void {
    foreach (array_reverse($created) as [$table, $id]) {
        query("DELETE FROM `$table` WHERE id = ?", [$id]);
    }
};

try {
    if (query('SELECT COUNT(*) FROM purchase_requests WHERE remarks LIKE ?', [DEMO . '%'])->fetchColumn() > 0) {
        $say('Demo Purchase Book documents already exist; nothing added.');
        exit(PHP_SAPI === 'cli' ? 1 : 0);
    }

    $suppliers = query("SELECT id, supplier_name FROM suppliers WHERE status = 'active' ORDER BY id LIMIT 3")->fetchAll();
    if (!$suppliers) {
        $say('Add at least one supplier first (Masters > Supplier); nothing added.');
        exit(1);
    }
    $supplier = static fn (int $i): int => (int) $suppliers[$i % count($suppliers)]['id'];
    $warehouse = query('SELECT id FROM warehouses ORDER BY id LIMIT 1')->fetchColumn();

    // Six lines to share out: the first items on file (repeated when there are fewer than six).
    $items = query('SELECT id, uom_id, buying_rate FROM items ORDER BY id LIMIT 6')->fetchAll();
    if (!$items) {
        $say('Add at least one item first (Masters > Item, or php backend/bin/seed-demo-data.php); nothing added.');
        exit(1);
    }
    while (count($items) < 6) {
        $items[] = $items[count($items) % count($items)];
    }
    $typed = [['GATE VALVE 2" SS316', 'Pieces', 12.5], ['BALL BEARING 6205-2RS', 'Pieces', 3.2], ['PTFE THREAD SEAL TAPE', 'Roll', 0.35],
        ['MCB 32A 3 POLE', 'Pieces', 9.75], ['SAFETY GLOVES NITRILE', 'Pair', 1.1], ['PRESSURE GAUGE 0-10 BAR', 'Pieces', 7.4]];
    $line = static function (int $n) use ($items, $typed): array {
        if (isset($items[$n])) {
            $rate = (float) ($items[$n]['buying_rate'] ?? 0);
            return [['itemId' => (int) $items[$n]['id'], 'uomId' => $items[$n]['uom_id']], $rate > 0 ? $rate : $typed[$n][2]];
        }
        return [['itemName' => $typed[$n][0], 'unit' => $typed[$n][1]], $typed[$n][2]];
    };
    $day = static fn (int $ago): string => date('Y-m-d', strtotime(sprintf('%+d days', -$ago)));   // negative: days ahead

    // [purchase type, lines (index => quantity), required in days, location]
    $plans = [
        ['Against Order', [0 => 10, 1 => 24, 2 => 50], 7, 'Muscat Main Warehouse'],
        ['Stock Replenishment', [3 => 6, 4 => 40], 14, 'Muscat Main Warehouse'],
        ['Urgent', [5 => 4, 0 => 2], 3, 'Sohar Site Store'],
    ];
    $made = ['pr' => [], 'rfq' => [], 'po' => [], 'grn' => []];
    foreach ($plans as $i => [$type, $quantities, $within, $location]) {
        $ago = 9 - $i * 3;                         // documents spread over the last nine days
        $lines = [];
        foreach ($quantities as $n => $qty) {
            $lines[] = $line($n)[0] + ['quantity' => (string) $qty];
        }

        $pr = purchase_request_save([
            'referenceNo' => 'SO-2026-' . str_pad((string) (41 + $i), 3, '0', STR_PAD_LEFT), 'purchaseType' => $type,
            'requestedDate' => $day($ago), 'requiredDate' => $day($ago - $within), 'requestedBy' => 'ADMIN',
            'deliveryLocation' => $location, 'remarks' => DEMO . ': purchase request ' . ($i + 1) . '.', 'items' => $lines,
        ]);
        $made['pr'][] = $pr['code'];
        $created[] = ['purchase_requests', $pr['id']];

        $rfq = quotation_request_save([
            'purchaseRequestId' => $pr['id'], 'requestDate' => $day($ago - 1), 'submissionDeadline' => $day($ago - 4),
            'supplierIds' => array_values(array_unique([$supplier($i), $supplier($i + 1)])),
            'remarks' => DEMO . ': please quote your best price and delivery time.', 'items' => $lines,
        ]);
        $made['rfq'][] = $rfq['code'];
        $created[] = ['quotation_requests', $rfq['id']];

        $priced = [];
        foreach ($quantities as $n => $qty) {
            [$item, $rate] = $line($n);
            $priced[] = $item + ['quantity' => (string) $qty, 'price' => number_format($rate, 3, '.', ''), 'vatRate' => '5',
                'discountPct' => $i === 1 ? '5' : '0'];
        }
        $po = purchase_order_save([
            'poDate' => $day($ago - 2), 'quotationRequestId' => $rfq['id'], 'quotationNumber' => 'QT-2026-' . str_pad((string) (101 + $i), 3, '0', STR_PAD_LEFT),
            'deliveryDate' => $day($ago - 2 - $within), 'deliveryLocation' => $location, 'deliveryTerms' => ['2–3 weeks from PO date, DAP Muscat', '1 week, ex-works', 'Immediate, delivered to site'][$i],
            'paymentMode' => ['As usual', 'Credit', 'Bank Transfer'][$i], 'salesman' => 'ADMIN', 'salesmanContact' => '+968 9123 456' . $i,
            'certifications' => [['N/A'], ['MTC Certificate', 'COC Certificate'], ['Pressure Test', 'TPI Certificate']][$i],
            'supplierId' => $supplier($i), 'contactName' => '', 'contactNumber' => '', 'vatMode' => 'exclude',
            'discountAmount' => $i === 2 ? '2.000' : '0', 'shipping' => ['0', '5.000', '12.500'][$i],
            'remarks' => '<div><b>' . DEMO . ':</b> <span style="color: #dc2626">' . ['Deliver in original packing.', 'Mill test certificates required with the goods.', 'Urgent delivery required.'][$i] . '</span></div>',
            'includeSignatory' => true, 'items' => $priced,
        ]);
        $made['po'][] = $po['code'];
        $created[] = ['purchase_orders', $po['id']];

        if ($warehouse === false) {
            continue;
        }
        $received = [];
        foreach ($po['items'] as $k => $l) {
            $qty = (float) $l['quantity'];
            $rejected = $i === 1 && $k === 0 ? 1.0 : 0.0;     // one rejected piece on the second GRN
            $received[] = ['itemId' => $l['itemId'], 'itemName' => $l['itemName'], 'itemCode' => $l['itemCode'], 'uomId' => $l['uomId'], 'unit' => $l['unit'],
                'receivedQty' => (string) $qty, 'acceptedQty' => (string) ($qty - $rejected), 'rejectedQty' => (string) $rejected,
                'unitCost' => $l['price'], 'vatRate' => $l['vatRate'], 'discountPct' => $l['discountPct']];
        }
        $grn = grn_save([
            'grnDate' => $day(max(0, $ago - 3)), 'supplierId' => $po['supplierId'], 'warehouseId' => (int) $warehouse,
            'purchaseOrderId' => $po['id'], 'poNumber' => $po['code'], 'vatMode' => 'exclude',
            'remarks' => DEMO . ': goods received against ' . $po['code'] . '.', 'items' => $received,
        ]);
        $made['grn'][] = $grn['code'];
        $created[] = ['grns', $grn['id']];
    }

    $say('Demo Purchase Book documents added:');
    $say('  Purchase Requests:  ' . implode(', ', $made['pr']));
    $say('  Quotation Requests: ' . implode(', ', $made['rfq']));
    $say('  Purchase Orders:    ' . implode(', ', $made['po']));
    $say('  GRNs:               ' . ($made['grn'] ? implode(', ', $made['grn']) : 'none (add a stock point first: Masters > Stock Point)'));
    if (PHP_SAPI !== 'cli') {
        $say("\nNow DELETE this file from public_html/api/.");
    }
} catch (ValidationError $e) {
    $undo();
    $say('Not added, a document was refused: ' . json_encode($e->fields, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    exit(1);
} catch (Throwable $e) {
    $undo();
    $say('Not added: ' . get_class($e) . ': ' . $e->getMessage());
    exit(1);
}
