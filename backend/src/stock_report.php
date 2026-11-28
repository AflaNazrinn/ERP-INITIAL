<?php
declare(strict_types=1);

require_once __DIR__ . '/purchase_book.php';

/*
 * The stock ledger: every movement of stock, worked out from the documents (there is no separate stock table).
 * One row per item line, in (+) or out (−) of a stock point:
 *
 *   Opening Stock               the opening stock on the Item page's sourcing lines (older items: the item's total)
 *   Stock In (GRN)              a GRN's accepted quantity, at the GRN's stock point
 *   Transfer Out / Transfer In  a GRN line's stock transfers, and Stock Transfers (Supply Management)
 *   Stock In (Purchase)         a Purchase Entry with no GRN (goods taken in on the bill itself)
 *   Stock Out (Delivery Note)   a delivery note line, from its stock point (else the note's)
 *   Stock Out (Invoice)         a tax invoice not made from a delivery note (proforma invoices move nothing)
 *   Stock Out (Replacement)     a sales replacement's goods given to the buyer
 *   Stock In (Replacement)      a purchase replacement's goods received from the supplier
 *   Adjustment (+) / (−)        a stock adjustment's counted difference
 *   Damage Restock              damaged goods moved back to stock (Damaged Stock › Move to Stock)
 *
 * Sales returns and purchase returns never change the stock on hand: every returned line is listed as damaged stock
 * (the Stock Ledger's Damaged Stock, Sales Return / Purchase Return). So are a sales replacement's returned goods
 * collected from the buyer and a purchase replacement's returned goods held at the stock point.
 * Move to Stock (damage_restocks) takes a quantity off a damaged line and adds it to the stock on hand: the damaged
 * line keeps its original quantity (origQty) and shows what is still damaged (qty); a line with nothing left is gone.
 *
 * A line with no stock point of its own (a tax invoice, a purchase entry) uses the item's stock point: its first
 * sourcing line's, else the item's.
 */

/* Each table's source runs on its own: a company database without a newer table (its migration not run yet)
   simply has no rows from it. */
function stk_rows(string $sql, array $params = []): array
{
    try {
        return query($sql, $params)->fetchAll();
    } catch (PDOException) {
        return [];
    }
}

/*
 * [movements, damaged]. $except: ['adjustment' => id, 'transfer' => id] leaves that document out (the document
 * being edited, so its own figures are not counted twice).
 */
function stock_ledger(array $except = []): array
{
    $moves = [];
    $damaged = [];
    $defaultPoint = [];
    foreach (stk_rows('SELECT i.id, COALESCE((SELECT ib.warehouse_id FROM item_brands ib WHERE ib.item_id = i.id AND ib.warehouse_id IS NOT NULL
                       ORDER BY ib.sort_order, ib.id LIMIT 1), i.warehouse_id) AS warehouse_id FROM items i') as $r) {
        $defaultPoint[(int) $r['id']] = $r['warehouse_id'] === null ? null : (int) $r['warehouse_id'];
    }
    $add = static function (array $m) use (&$moves): void {
        if ($m['itemId'] === null || (float) $m['qty'] <= 0) {
            return;
        }
        $m['itemId'] = (int) $m['itemId'];
        $m['warehouseId'] = $m['warehouseId'] === null ? null : (int) $m['warehouseId'];
        $m['qty'] = (float) $m['qty'];
        $m['rate'] = (float) ($m['rate'] ?? 0);
        $moves[] = $m + ['party' => '', 'remarks' => '', 'by' => ''];
    };
    $point = static fn ($itemId, $warehouseId) => $warehouseId !== null ? (int) $warehouseId : ($defaultPoint[(int) $itemId] ?? null);

    // Opening stock.
    foreach (stk_rows('SELECT ib.item_id, ib.warehouse_id, ib.opening_stock, ib.price_per_unit, i.item_code, i.buying_rate, DATE(i.created_at) AS d
                       FROM item_brands ib JOIN items i ON i.id = ib.item_id WHERE ib.opening_stock IS NOT NULL') as $r) {
        $add(['date' => $r['d'], 'ref' => $r['item_code'], 'doc' => 'opening', 'docId' => 0, 'type' => 'Opening Stock', 'dir' => 'in',
            'itemId' => $r['item_id'], 'warehouseId' => $point($r['item_id'], $r['warehouse_id']), 'qty' => $r['opening_stock'],
            'rate' => (float) $r['price_per_unit'] ?: (float) $r['buying_rate'], 'remarks' => 'Opening stock']);
    }
    foreach (stk_rows("SELECT i.id AS item_id, i.item_code, i.buying_rate, NULLIF(i.available_stock, '') AS qty, DATE(i.created_at) AS d FROM items i
                       WHERE NOT EXISTS (SELECT 1 FROM item_brands ib WHERE ib.item_id = i.id AND ib.opening_stock IS NOT NULL)") as $r) {
        if ($r['qty'] !== null && is_numeric($r['qty'])) {
            $add(['date' => $r['d'], 'ref' => $r['item_code'], 'doc' => 'opening', 'docId' => 0, 'type' => 'Opening Stock', 'dir' => 'in',
                'itemId' => $r['item_id'], 'warehouseId' => $point($r['item_id'], null), 'qty' => $r['qty'], 'rate' => $r['buying_rate'],
                'remarks' => 'Opening stock']);
        }
    }

    // GRNs and their stock transfers.
    foreach (stk_rows('SELECT g.id, g.grn_code, g.grn_date, g.warehouse_id, COALESCE(po.po_code, g.po_number) AS po, s.supplier_name,
                              gi.item_id, gi.accepted_qty, gi.unit_cost, gi.transfers
                       FROM grn_items gi JOIN grns g ON g.id = gi.grn_id
                       LEFT JOIN purchase_orders po ON po.id = g.purchase_order_id LEFT JOIN suppliers s ON s.id = g.supplier_id
                       ORDER BY g.grn_date, g.id, gi.sort_order') as $r) {
        $at = $point($r['item_id'], $r['warehouse_id']);
        $add(['date' => $r['grn_date'], 'ref' => $r['grn_code'], 'doc' => 'grn', 'docId' => (int) $r['id'], 'type' => 'Stock In (GRN)', 'dir' => 'in',
            'itemId' => $r['item_id'], 'warehouseId' => $at, 'qty' => $r['accepted_qty'], 'rate' => $r['unit_cost'], 'party' => (string) $r['supplier_name'],
            'remarks' => 'Stock in via GRN' . ($r['po'] ? ' against ' . $r['po'] : '')]);
        foreach (grn_find_transfers($r['transfers'] ?? null) as $t) {
            $add(['date' => $r['grn_date'], 'ref' => $r['grn_code'], 'doc' => 'grn', 'docId' => (int) $r['id'], 'type' => 'Transfer Out', 'dir' => 'out',
                'itemId' => $r['item_id'], 'warehouseId' => $at, 'qty' => $t['quantity'], 'rate' => $r['unit_cost'],
                'party' => 'To ' . $t['warehouseName'], 'remarks' => 'Stock transfer on receipt']);
            $add(['date' => $r['grn_date'], 'ref' => $r['grn_code'], 'doc' => 'grn', 'docId' => (int) $r['id'], 'type' => 'Transfer In', 'dir' => 'in',
                'itemId' => $r['item_id'], 'warehouseId' => $t['warehouseId'], 'qty' => $t['quantity'], 'rate' => $r['unit_cost'],
                'party' => 'From GRN ' . $r['grn_code'], 'remarks' => 'Stock transfer on receipt']);
        }
    }

    // Purchase entries without a GRN.
    foreach (stk_rows('SELECT p.id, p.pe_code, p.pe_date, s.supplier_name, pi.item_id, pi.quantity, pi.price
                       FROM purchase_entry_items pi JOIN purchase_entries p ON p.id = pi.purchase_entry_id
                       LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.grn_id IS NULL') as $r) {
        $add(['date' => $r['pe_date'], 'ref' => $r['pe_code'], 'doc' => 'pe', 'docId' => (int) $r['id'], 'type' => 'Stock In (Purchase)', 'dir' => 'in',
            'itemId' => $r['item_id'], 'warehouseId' => $point($r['item_id'], null), 'qty' => $r['quantity'], 'rate' => $r['price'],
            'party' => (string) $r['supplier_name'], 'remarks' => 'Purchased']);
    }

    // Delivery notes and tax invoices (an invoice made from a delivery note moves nothing more).
    foreach (stk_rows('SELECT d.id, d.dn_code, d.dn_date, d.salesman, c.customer_name, di.item_id, di.quantity, di.price,
                              COALESCE(di.warehouse_id, d.warehouse_id) AS warehouse_id
                       FROM delivery_note_items di JOIN delivery_notes d ON d.id = di.delivery_note_id
                       LEFT JOIN customers c ON c.id = d.customer_id') as $r) {
        $add(['date' => $r['dn_date'], 'ref' => $r['dn_code'], 'doc' => 'dn', 'docId' => (int) $r['id'], 'type' => 'Stock Out (Delivery Note)', 'dir' => 'out',
            'itemId' => $r['item_id'], 'warehouseId' => $point($r['item_id'], $r['warehouse_id']), 'qty' => $r['quantity'], 'rate' => $r['price'],
            'party' => (string) $r['customer_name'], 'remarks' => 'Stock out via delivery note', 'by' => (string) $r['salesman']]);
    }
    foreach (stk_rows("SELECT t.id, t.ti_code, t.ti_date, t.salesman, c.customer_name, ti.item_id, ti.quantity, ti.price
                       FROM tax_invoice_items ti JOIN tax_invoices t ON t.id = ti.tax_invoice_id LEFT JOIN customers c ON c.id = t.customer_id
                       WHERE t.delivery_note_id IS NULL AND t.document_title NOT LIKE '%Proforma%'") as $r) {
        $add(['date' => $r['ti_date'], 'ref' => $r['ti_code'], 'doc' => 'ti', 'docId' => (int) $r['id'], 'type' => 'Stock Out (Invoice)', 'dir' => 'out',
            'itemId' => $r['item_id'], 'warehouseId' => $point($r['item_id'], null), 'qty' => $r['quantity'], 'rate' => $r['price'],
            'party' => (string) $r['customer_name'], 'remarks' => 'Stock out via invoice', 'by' => (string) $r['salesman']]);
    }

    // Sales returns and purchase returns: damaged stock only (the stock on hand does not change).
    foreach (stk_rows('SELECT r.id, r.sr_code, r.sr_date, r.warehouse_id, r.return_reason, c.customer_name, ri.item_id, ri.quantity, ri.price, ri.item_condition
                       FROM sales_return_items ri JOIN sales_returns r ON r.id = ri.sales_return_id LEFT JOIN customers c ON c.id = r.customer_id') as $r) {
        $damaged[] = ['date' => $r['sr_date'], 'ref' => $r['sr_code'], 'doc' => 'sr', 'docId' => (int) $r['id'], 'itemId' => $r['item_id'],
            'warehouseId' => $point($r['item_id'], $r['warehouse_id']), 'qty' => $r['quantity'], 'rate' => $r['price'], 'party' => (string) $r['customer_name'],
            'source' => 'Sales Return', 'side' => 'sales', 'condition' => $r['item_condition'],
            'remarks' => $r['return_reason'] ?: $r['item_condition'], 'by' => ''];
    }
    foreach (stk_rows('SELECT r.id, r.prt_code, r.prt_date, r.warehouse_id, r.return_reason, r.created_by, s.supplier_name, ri.item_id, ri.quantity, ri.price, ri.item_condition
                       FROM purchase_return_items ri JOIN purchase_returns r ON r.id = ri.purchase_return_id LEFT JOIN suppliers s ON s.id = r.supplier_id') as $r) {
        $damaged[] = ['date' => $r['prt_date'], 'ref' => $r['prt_code'], 'doc' => 'prt', 'docId' => (int) $r['id'], 'itemId' => $r['item_id'],
            'warehouseId' => $point($r['item_id'], $r['warehouse_id']), 'qty' => $r['quantity'], 'rate' => $r['price'], 'party' => (string) $r['supplier_name'],
            'source' => 'Purchase Return', 'side' => 'purchase', 'condition' => $r['item_condition'],
            'remarks' => $r['return_reason'] ?: $r['item_condition'], 'by' => (string) $r['created_by']];
    }

    // Sales replacements: the replacement goes out; returned goods collected from the buyer are damaged stock
    // (unused ones go back into stock).
    foreach (stk_rows('SELECT r.id, r.srp_code, r.srp_date, r.warehouse_id, r.returned_goods, c.customer_name, ri.item_id, ri.replacement_item_id,
                              ri.quantity, ri.price, ri.old_price, ri.item_condition
                       FROM sales_replacement_items ri JOIN sales_replacements r ON r.id = ri.sales_replacement_id LEFT JOIN customers c ON c.id = r.customer_id') as $r) {
        $out = $r['replacement_item_id'] ?? $r['item_id'];
        $add(['date' => $r['srp_date'], 'ref' => $r['srp_code'], 'doc' => 'srp', 'docId' => (int) $r['id'], 'type' => 'Stock Out (Replacement)', 'dir' => 'out',
            'itemId' => $out, 'warehouseId' => $point($out, $r['warehouse_id']), 'qty' => $r['quantity'], 'rate' => $r['price'],
            'party' => (string) $r['customer_name'], 'remarks' => 'Replacement given to the buyer']);
        if ($r['returned_goods'] === 'Collected from Buyer') {
            $row = ['date' => $r['srp_date'], 'ref' => $r['srp_code'], 'doc' => 'srp', 'docId' => (int) $r['id'], 'itemId' => $r['item_id'],
                'warehouseId' => $point($r['item_id'], $r['warehouse_id']), 'qty' => $r['quantity'], 'rate' => $r['old_price'],
                'party' => (string) $r['customer_name'], 'remarks' => 'Returned goods collected · ' . $r['item_condition']];
            if ($r['item_condition'] === 'Unused') {
                $add($row + ['type' => 'Stock In (Replacement Return)', 'dir' => 'in']);
            } else {
                $damaged[] = $row + ['source' => 'Sales Replacement', 'side' => 'sales', 'condition' => $r['item_condition'], 'by' => ''];
            }
        }
    }

    // Purchase replacements: the replacement comes in; the returned goods leave stock (held at the stock point:
    // damaged stock).
    foreach (stk_rows('SELECT r.id, r.prp_code, r.prp_date, r.warehouse_id, r.returned_goods, r.created_by, s.supplier_name, ri.item_id,
                              ri.replacement_item_id, ri.quantity, ri.price, ri.old_price, ri.item_condition
                       FROM purchase_replacement_items ri JOIN purchase_replacements r ON r.id = ri.purchase_replacement_id
                       LEFT JOIN suppliers s ON s.id = r.supplier_id') as $r) {
        $in = $r['replacement_item_id'] ?? $r['item_id'];
        $add(['date' => $r['prp_date'], 'ref' => $r['prp_code'], 'doc' => 'prp', 'docId' => (int) $r['id'], 'type' => 'Stock In (Replacement)', 'dir' => 'in',
            'itemId' => $in, 'warehouseId' => $point($in, $r['warehouse_id']), 'qty' => $r['quantity'], 'rate' => $r['price'],
            'party' => (string) $r['supplier_name'], 'remarks' => 'Replacement received from the supplier', 'by' => (string) $r['created_by']]);
        $at = $point($r['item_id'], $r['warehouse_id']);
        $add(['date' => $r['prp_date'], 'ref' => $r['prp_code'], 'doc' => 'prp', 'docId' => (int) $r['id'], 'type' => 'Stock Out (Replacement Return)', 'dir' => 'out',
            'itemId' => $r['item_id'], 'warehouseId' => $at, 'qty' => $r['quantity'], 'rate' => $r['old_price'], 'party' => (string) $r['supplier_name'],
            'remarks' => 'Returned goods · ' . $r['returned_goods'] . ' · ' . $r['item_condition'], 'by' => (string) $r['created_by']]);
        if ($r['returned_goods'] === 'Held at Stock Point') {
            $damaged[] = ['date' => $r['prp_date'], 'ref' => $r['prp_code'], 'doc' => 'prp', 'docId' => (int) $r['id'], 'itemId' => $r['item_id'],
                'warehouseId' => $at, 'qty' => $r['quantity'], 'rate' => $r['old_price'], 'party' => (string) $r['supplier_name'],
                'remarks' => 'Returned goods held at the stock point', 'source' => 'Purchase Replacement', 'side' => 'purchase',
                'condition' => $r['item_condition'], 'by' => (string) $r['created_by']];
        }
    }

    // Stock transfers.
    foreach (stk_rows('SELECT t.id, t.st_code, t.st_date, t.transfer_reason, t.from_warehouse_id, t.to_warehouse_id, fw.warehouse_name AS from_name,
                              tw.warehouse_name AS to_name, ti.item_id, ti.quantity, ti.unit_cost
                       FROM stock_transfer_items ti JOIN stock_transfers t ON t.id = ti.stock_transfer_id
                       LEFT JOIN warehouses fw ON fw.id = t.from_warehouse_id LEFT JOIN warehouses tw ON tw.id = t.to_warehouse_id
                       WHERE t.id <> ?', [(int) ($except['transfer'] ?? 0)]) as $r) {
        $note = $r['transfer_reason'] ?: 'Stock transfer';
        $add(['date' => $r['st_date'], 'ref' => $r['st_code'], 'doc' => 'st', 'docId' => (int) $r['id'], 'type' => 'Transfer Out', 'dir' => 'out',
            'itemId' => $r['item_id'], 'warehouseId' => $r['from_warehouse_id'], 'qty' => $r['quantity'], 'rate' => $r['unit_cost'],
            'party' => 'To ' . $r['to_name'], 'remarks' => $note]);
        $add(['date' => $r['st_date'], 'ref' => $r['st_code'], 'doc' => 'st', 'docId' => (int) $r['id'], 'type' => 'Transfer In', 'dir' => 'in',
            'itemId' => $r['item_id'], 'warehouseId' => $r['to_warehouse_id'], 'qty' => $r['quantity'], 'rate' => $r['unit_cost'],
            'party' => 'From ' . $r['from_name'], 'remarks' => $note]);
    }

    // Stock adjustments.
    foreach (stk_rows("SELECT a.id, a.sa_code, a.sa_date, a.warehouse_id, a.reason, a.requested_by, ai.item_id, ai.quantity - ai.system_qty AS diff,
                              ai.unit_cost, ai.line_reason
                       FROM stock_adjustment_items ai JOIN stock_adjustments a ON a.id = ai.stock_adjustment_id
                       WHERE a.id <> ?", [(int) ($except['adjustment'] ?? 0)]) as $r) {
        $diff = (float) $r['diff'];
        $add(['date' => $r['sa_date'], 'ref' => $r['sa_code'], 'doc' => 'sa', 'docId' => (int) $r['id'],
            'type' => $diff >= 0 ? 'Adjustment (+)' : 'Adjustment (−)', 'dir' => $diff >= 0 ? 'in' : 'out',
            'itemId' => $r['item_id'], 'warehouseId' => $r['warehouse_id'], 'qty' => abs($diff), 'rate' => $r['unit_cost'],
            'party' => $r['line_reason'] ?: $r['reason'], 'remarks' => $r['line_reason'] ?: ($r['reason'] ?: 'Stock adjustment'), 'by' => (string) $r['requested_by']]);
    }

    // Damaged goods moved back to stock: a Damage Restock in, and off the damaged line(s) of that return.
    $restocked = [];
    foreach (stk_rows('SELECT d.id, d.restock_date, d.source_doc, d.source_id, d.source_ref, d.item_id, d.warehouse_id, d.quantity, d.rate,
                              d.description, d.created_by
                       FROM damage_restocks d ORDER BY d.restock_date, d.id') as $r) {
        $key = $r['source_doc'] . ':' . $r['source_id'] . ':' . $r['item_id'];
        $restocked[$key] = ($restocked[$key] ?? 0.0) + (float) $r['quantity'];
        $add(['date' => $r['restock_date'], 'ref' => $r['source_ref'], 'doc' => 'restock', 'docId' => (int) $r['id'], 'type' => 'Damage Restock',
            'dir' => 'in', 'itemId' => $r['item_id'], 'warehouseId' => $point($r['item_id'], $r['warehouse_id']), 'qty' => $r['quantity'],
            'rate' => $r['rate'], 'party' => 'From Damaged Stock (' . $r['source_ref'] . ')',
            'side' => in_array($r['source_doc'], ['sr', 'srp'], true) ? 'sales' : 'purchase',
            'remarks' => 'Stock adjustment – moved from Damaged Stock' . ($r['description'] !== '' ? ': ' . $r['description'] : ''),
            'by' => (string) $r['created_by']]);
    }
    $left = [];
    foreach ($damaged as $d) {
        $d['itemId'] = (int) $d['itemId'];
        $d['warehouseId'] = $d['warehouseId'] === null ? null : (int) $d['warehouseId'];
        $d['origQty'] = (float) $d['qty'];
        $d['rate'] = (float) $d['rate'];
        $key = $d['doc'] . ':' . $d['docId'] . ':' . $d['itemId'];
        $off = min($restocked[$key] ?? 0.0, $d['origQty']);
        $restocked[$key] = ($restocked[$key] ?? 0.0) - $off;
        $d['qty'] = round($d['origQty'] - $off, 3);
        $d['key'] = $key;
        if ($d['qty'] > 0) {
            $left[] = $d;
        }
    }
    $damaged = $left;

    usort($moves, static fn ($a, $b) => [$a['date'], $a['dir'] === 'in' ? 0 : 1] <=> [$b['date'], $b['dir'] === 'in' ? 0 : 1]);
    return [$moves, $damaged];
}

/* [warehouseId|0 => [itemId => quantity]]: stock on hand per stock point (0: lines with no stock point). */
function stock_on_hand_matrix(array $except = []): array
{
    [$moves] = stock_ledger($except);
    $out = [];
    foreach ($moves as $m) {
        $w = $m['warehouseId'] ?? 0;
        $out[$w][$m['itemId']] = ($out[$w][$m['itemId']] ?? 0.0) + ($m['dir'] === 'in' ? $m['qty'] : -$m['qty']);
    }
    return $out;
}

/* The Stock Report's data: the ledger, the damaged stock, and the items and stock points it names. */
function stock_report(): array
{
    [$moves, $damaged] = stock_ledger();
    $items = [];
    foreach (stk_rows('SELECT i.id, i.item_code, i.item_name, i.buying_rate, i.selling_price, i.min_stock_level, u.uom_name AS unit,
                              COALESCE(NULLIF(i.brand_name, \'\'), b.brand_name, (SELECT ib.brand_name FROM item_brands ib
                                       WHERE ib.item_id = i.id AND ib.brand_name <> \'\' ORDER BY ib.sort_order, ib.id LIMIT 1), \'\') AS brand
                       FROM items i LEFT JOIN uoms u ON u.id = i.uom_id LEFT JOIN brands b ON b.id = i.brand_id') as $r) {
        $items[(int) $r['id']] = ['code' => $r['item_code'], 'name' => $r['item_name'], 'brand' => (string) $r['brand'], 'unit' => (string) $r['unit'],
            'buyingRate' => (float) $r['buying_rate'], 'sellingPrice' => (float) $r['selling_price'],
            'minStock' => $r['min_stock_level'] === null || $r['min_stock_level'] === '' ? null : (float) $r['min_stock_level']];
    }
    $points = [];
    foreach (stk_rows('SELECT id, warehouse_code, warehouse_name FROM warehouses ORDER BY warehouse_code') as $r) {
        $points[(int) $r['id']] = ['code' => $r['warehouse_code'], 'name' => $r['warehouse_name']];
    }
    $known = static fn (array $rows) => array_values(array_filter($rows, static fn ($m) => isset($items[$m['itemId']])));
    return ['generatedAt' => date('c'), 'movements' => $known($moves), 'damaged' => $known($damaged),
        'items' => (object) $items, 'stockPoints' => (object) $points];
}

/*
 * Move to Stock: { key: "sr:12:5" (a damaged line's key), qty, description } → the saved restock.
 * The quantity may not be more than is still damaged on that return's line(s) for the item.
 */
function damage_restock_save(array $data): array
{
    $key = trim((string) ($data['key'] ?? ''));
    $qty = $data['qty'] ?? null;
    $description = trim((string) ($data['description'] ?? ''));
    [, $damaged] = stock_ledger();
    $lines = array_values(array_filter($damaged, static fn ($d) => $d['key'] === $key));
    if (!$lines) {
        throw new ValidationError(['key' => 'Choose a damaged item.']);
    }
    // Only goods a customer sent back (sales return, sales replacement) go back into stock; a purchase return's goods
    // go back to the supplier.
    if (($lines[0]['side'] ?? '') !== 'sales') {
        throw new ValidationError(['key' => 'Only a sales return\'s damaged goods can be moved to stock.']);
    }
    $available = round(array_sum(array_column($lines, 'qty')), 3);
    if (!is_numeric($qty) || (float) $qty <= 0) {
        throw new ValidationError(['qty' => 'Enter a quantity more than 0.']);
    }
    $qty = round((float) $qty, 3);
    if ($qty > $available) {
        throw new ValidationError(['qty' => 'Only ' . rtrim(rtrim(number_format($available, 3, '.', ''), '0'), '.') . ' is in Damaged Stock.']);
    }
    if (mb_strlen($description) > 300) {
        throw new ValidationError(['description' => 'Keep the description within 300 characters.']);
    }
    $line = $lines[0];
    $user = current_user();
    $by = (string) ($user['fullName'] ?? '') ?: (string) ($user['username'] ?? '');
    query('INSERT INTO damage_restocks (restock_date, source_doc, source_id, source_ref, item_id, warehouse_id, quantity, rate, description, created_by)
           VALUES (CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$line['doc'], $line['docId'], $line['ref'], $line['itemId'], $line['warehouseId'], $qty, $line['rate'], $description, $by]);
    return ['key' => $key, 'qty' => $qty, 'left' => round($available - $qty, 3)];
}

