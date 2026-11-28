<?php
declare(strict_types=1);

require_once __DIR__ . '/purchase_book.php';
require_once __DIR__ . '/stock_report.php';
require_once __DIR__ . '/returns_common.php';     // the lists' Filter: who made it (Employee)

/*
 * Supply Management: Stock Adjustment (ADJ000001), Stock Transfer (ST-0001) and Stock Reservation (SR000001).
 *
 * Stock on hand at a stock point, per item (sm_stock_on_hand()), is worked out from what the books hold:
 *   + the opening stock of the item's sourcing lines there (as the Stock Point page counts it)
 *   + GRN accepted quantities received there (less what each GRN line sent on to other stock points)
 *   + GRN line stock transfers into it
 *   − delivery note quantities delivered from it (the line's stock point, else the note's)
 *   ± stock transfers out of / into it
 *   ± stock adjustments there (physical − system quantity)
 * Reserved stock (sm_reserved()) is the quantity on stock reservations whose required date has not passed;
 * available = on hand − reserved.
 */

const SM_RES_TYPES = ['Sales Order', 'Quotation', 'Customer Request', 'Project', 'Internal Use', 'Other'];
const SM_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

/* ---------- Stock levels ---------- */

/* [itemId => quantity] at one stock point, or across every stock point when $warehouseId is null. The figures come
   from the stock ledger (src/stock_report.php), the same as the Stock Report's. */
function sm_stock_on_hand(?int $warehouseId, int $exceptAdjustment = 0, int $exceptTransfer = 0): array
{
    $matrix = stock_on_hand_matrix(['adjustment' => $exceptAdjustment, 'transfer' => $exceptTransfer]);
    $stock = [];
    foreach ($matrix as $w => $byItem) {
        if ($warehouseId !== null && (int) $w !== $warehouseId) {
            continue;
        }
        foreach ($byItem as $itemId => $qty) {
            $stock[$itemId] = ($stock[$itemId] ?? 0.0) + $qty;
        }
    }
    $stock = array_filter($stock, static fn (float $q) => abs($q) > 0.0005);
    return array_map(static fn (float $q) => pb_qty(number_format($q, 3, '.', '')), $stock);
}

/* Where one item's stock is: [{ warehouseId, code, name, qty }] for each stock point holding some (not 0). */
function sm_item_stock_points(int $itemId): array
{
    $matrix = stock_on_hand_matrix();
    $out = [];
    foreach (query('SELECT id, warehouse_code, warehouse_name FROM warehouses ORDER BY warehouse_code')->fetchAll() as $w) {
        $qty = $matrix[(int) $w['id']][$itemId] ?? 0.0;
        if (abs($qty) > 0.0005) {
            $out[] = ['warehouseId' => (int) $w['id'], 'code' => $w['warehouse_code'], 'name' => $w['warehouse_name'],
                'qty' => pb_qty(number_format($qty, 3, '.', ''))];
        }
    }
    return $out;
}

/* [itemId => quantity] held by stock reservations still running (required date today or later). */
function sm_reserved(?int $warehouseId, int $exceptReservation = 0): array
{
    $sql = 'SELECT ri.item_id, SUM(ri.quantity) AS qty FROM stock_reservation_items ri JOIN stock_reservations r ON r.id = ri.stock_reservation_id
            WHERE r.required_date >= CURDATE() AND r.id <> ? AND ri.item_id IS NOT NULL';
    $params = [$exceptReservation];
    if ($warehouseId !== null) {
        $sql .= ' AND r.warehouse_id = ?';
        $params[] = $warehouseId;
    }
    $out = [];
    foreach (query($sql . ' GROUP BY ri.item_id', $params)->fetchAll() as $r) {
        $out[(int) $r['item_id']] = pb_qty((string) $r['qty']);
    }
    return $out;
}

/* ---------- Shared line handling ---------- */

/* The document's item lines. $extras: payload key => [column, label, kind ('qty' | 'money' | 'text'), size]. */
function sm_read_lines(Input $in, array $extras, bool $zeroQty, string $qtyLabel): array
{
    $lines = [];
    foreach ($in->rows('items') as $index => $raw) {
        $r = new Input($raw);
        $itemId = $r->id('itemId', 'item', 'items');
        $name = $r->text('itemName', 'Item name', 200);
        if ($itemId === null && $name === '' && trim((string) ($raw['itemCode'] ?? '')) === '') {
            continue;
        }
        $line = [
            'itemId' => $itemId, 'itemCode' => $r->text('itemCode', 'Item code', 30), 'itemName' => $name,
            'brandId' => $r->id('brandId', 'brand', 'brands'), 'brandName' => $r->text('brandName', 'Brand', 150),
            'uomId' => $r->id('uomId', 'unit', 'uoms'), 'unit' => $r->text('unit', 'Unit', 80),
            'itemNameHtml' => $r->text('itemNameHtml', 'Formatted item name', 4000),
            'quantity' => $r->decimal('quantity', $qtyLabel, 14, 3, true),
        ];
        if ($line['quantity'] !== null && !$zeroQty && (float) $line['quantity'] <= 0) {
            $r->fail('quantity', "$qtyLabel must be more than 0.");
        }
        foreach ($extras as $key => [, $label, $kind, $size]) {
            if ($kind === 'qty') {                      // a stock figure: may be below 0
                $value = trim((string) ($raw[$key] ?? ''));
                if ($value !== '' && !preg_match('/^-?\d{1,11}(\.\d{1,3})?$/', $value)) {
                    $r->fail($key, "$label must be a number with up to 3 decimals.");
                }
                $line[$key] = $value === '' || !is_numeric($value) ? '0' : $value;
                continue;
            }
            $line[$key] = $kind === 'text' ? $r->text($key, $label, $size) : ($r->decimal($key, $label, 14, 3) ?? '0');
        }
        if ($itemId !== null) {
            $item = query('SELECT item_code, item_name FROM items WHERE id = ?', [$itemId])->fetch();
            $line['itemCode'] = $item['item_code'];
            $line['itemName'] = $item['item_name'];
        } else {
            $r->fail('itemName', 'pick an item from the Item master.');
        }
        if ($line['brandId'] !== null) {
            $line['brandName'] = (string) query('SELECT brand_name FROM brands WHERE id = ?', [$line['brandId']])->fetchColumn();
        }
        if ($line['uomId'] !== null) {
            $line['unit'] = (string) query('SELECT uom_name FROM uoms WHERE id = ?', [$line['uomId']])->fetchColumn();
        }
        $line['itemNameHtml'] = pb_item_name_html($line['itemNameHtml'], $line['itemName']);
        try {
            $r->done();
        } catch (ValidationError $e) {
            $in->fail('items', 'Item row ' . ($index + 1) . ': ' . (array_values($e->fields)[0] ?? 'is not valid.'));
            continue;
        }
        $lines[] = $line;
    }
    if (!$lines) {
        $in->fail('items', 'Add at least one item.');
    }
    return $lines;
}

function sm_save_lines(string $table, string $owner, int $docId, array $lines, array $extras): void
{
    query("DELETE FROM `$table` WHERE `$owner` = ?", [$docId]);
    foreach ($lines as $order => $l) {
        $columns = ['sort_order' => $order + 1, 'item_id' => $l['itemId'], 'item_code' => $l['itemCode'], 'item_name' => $l['itemName'],
            'item_name_html' => $l['itemNameHtml'], 'brand_id' => $l['brandId'], 'brand_name' => $l['brandName'],
            'uom_id' => $l['uomId'], 'unit' => $l['unit'], 'quantity' => $l['quantity']];
        foreach ($extras as $key => [$column]) {
            $columns[$column] = $l[$key];
        }
        $names = implode(', ', array_map(static fn ($c) => "`$c`", array_keys($columns)));
        $marks = implode(', ', array_fill(0, count($columns), '?'));
        query("INSERT INTO `$table` (`$owner`, $names) VALUES (?, $marks)", [$docId, ...array_values($columns)]);
    }
}

function sm_find_lines(string $table, string $owner, int $docId, array $extras): array
{
    $sql = "SELECT l.*, it.item_code AS master_code, it.item_name AS master_name FROM `$table` l
            LEFT JOIN items it ON it.id = l.item_id WHERE l.`$owner` = ? ORDER BY l.sort_order, l.id";
    return array_map(static function (array $l) use ($extras): array {
        $name = (string) ($l['master_name'] ?? $l['item_name']);
        $line = [
            'itemId' => $l['item_id'] === null ? null : (int) $l['item_id'], 'itemCode' => $l['master_code'] ?? $l['item_code'], 'itemName' => $name,
            'itemNameHtml' => pb_item_name_html((string) ($l['item_name_html'] ?? ''), $name) ?? '',
            'brandId' => $l['brand_id'] === null ? null : (int) $l['brand_id'], 'brandName' => $l['brand_name'],
            'uomId' => $l['uom_id'] === null ? null : (int) $l['uom_id'], 'unit' => $l['unit'], 'quantity' => $l['quantity'],
        ];
        foreach ($extras as $key => [$column]) {
            $line[$key] = (string) $l[$column];
        }
        return $line;
    }, query($sql, [$docId])->fetchAll());
}

function sm_header_common(Input $in, array $data): array
{
    return [
        'remarks' => pb_clean_html($in->text('remarks', 'Remarks', 20000)),
        'include_signatory' => pb_flag($data, 'includeSignatory'), 'attach_seal' => pb_flag($data, 'attachSeal'),
        'extra_signatories' => pb_signatories($in, $data),
    ];
}

function sm_warehouse(?int $id): array
{
    $w = $id === null ? false : query('SELECT warehouse_code, warehouse_name FROM warehouses WHERE id = ?', [$id])->fetch();
    return $w ? ['code' => $w['warehouse_code'], 'name' => $w['warehouse_name']] : ['code' => '', 'name' => ''];
}

function sm_user_name(): string
{
    $user = current_user();
    return (string) ($user['fullName'] ?? '') ?: (string) ($user['username'] ?? '');
}

/* ---------- Stock Adjustment ---------- */

const SA_EXTRAS = [
    'systemQty' => ['system_qty', 'System quantity', 'qty', 0],
    'unitCost' => ['unit_cost', 'Unit cost', 'money', 0],
    'lineReason' => ['line_reason', 'Reason', 'text', 200],
];

function sa_format(array $row): array
{
    $count = (int) query('SELECT COUNT(*) FROM stock_adjustment_items WHERE stock_adjustment_id = ?', [$row['id']])->fetchColumn();
    $w = sm_warehouse($row['warehouse_id'] === null ? null : (int) $row['warehouse_id']);
    return pb_common($row) + rr_list_extras($row, (string) ($row['requested_by'] ?? '')) + [
        'code' => $row['sa_code'], 'adjustmentDate' => $row['sa_date'], 'date' => $row['sa_date'],
        'warehouseId' => $row['warehouse_id'] === null ? null : (int) $row['warehouse_id'], 'warehouseCode' => $w['code'], 'warehouseName' => $w['name'],
        'name' => $w['name'], 'adjustmentType' => $row['adjustment_type'], 'reason' => $row['reason'],
        'requestedBy' => $row['requested_by'], 'approvedBy' => $row['approved_by'], 'itemCount' => $count,
        'netQuantity' => pb_qty((string) $row['net_quantity']), 'totalValue' => $row['total_value'], 'grandTotal' => $row['total_value'],
    ];
}

function stock_adjustments_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM stock_adjustments';
    $params = [];
    if ($search !== '') {
        $sql .= ' WHERE sa_code LIKE ? OR reason LIKE ? OR warehouse_id IN (SELECT id FROM warehouses WHERE warehouse_name LIKE ?)';
        $params = [like($search), like($search), like($search)];
    }
    return array_map('sa_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function stock_adjustment_find(int $id): array
{
    $row = query('SELECT * FROM stock_adjustments WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Stock adjustment not found.');
    }
    return sa_format($row) + ['items' => sm_find_lines('stock_adjustment_items', 'stock_adjustment_id', $id, SA_EXTRAS)];
}

function stock_adjustment_next_code(): string
{
    return pb_next_code('stock_adjustments', 'sa_code', 'ADJ', 6);
}

function stock_adjustment_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(pb_as_input(stock_adjustment_find($id), ['adjustmentDate', 'warehouseId', 'reason', 'requestedBy', 'approvedBy']), $data);
    }
    $in = new Input($data);
    $v = [
        'sa_date' => $in->date('adjustmentDate', 'Adjustment date') ?? date('Y-m-d'),
        'warehouse_id' => $in->id('warehouseId', 'stock point', 'warehouses'),
        'reason' => $in->text('reason', 'Reason', 150),
        'requested_by' => $in->text('requestedBy', 'Requested by', 120),
        'approved_by' => $in->text('approvedBy', 'Approved by', 120),
    ] + sm_header_common($in, $data);
    if ($v['warehouse_id'] === null) {
        $in->fail('warehouseId', 'Select the stock point.');
    }
    $lines = sm_read_lines($in, SA_EXTRAS, true, 'Physical quantity');
    $in->done();
    $net = 0.0;
    $value = 0.0;
    $up = $down = false;
    foreach ($lines as $l) {
        $diff = (float) $l['quantity'] - (float) $l['systemQty'];
        $net += $diff;
        $value += $diff * (float) $l['unitCost'];
        $up = $up || $diff > 0.0005;
        $down = $down || $diff < -0.0005;
    }
    $v += ['adjustment_type' => $up && $down ? 'Mixed' : ($up ? 'Increase' : ($down ? 'Decrease' : '')),
        'net_quantity' => number_format($net, 3, '.', ''), 'total_value' => pb_money($value)];
    $id = stock_safe_transaction(static function () use ($id, $v, $lines): int {
        $new = $id === null;
        $id = pb_write_header('stock_adjustments', 'sa_code', $id, $v, 'stock_adjustment_next_code');
        if ($new) {
            rr_record_creator('stock_adjustments', $id);   // who made it (Filter › Employee)
        }
        sm_save_lines('stock_adjustment_items', 'stock_adjustment_id', $id, $lines, SA_EXTRAS);
        return $id;
    });
    return stock_adjustment_find($id);
}

function stock_adjustment_delete(int $id): void
{
    // Deleting it may take stock below zero (goods already delivered): refused then.
    stock_safe_transaction(static fn () => delete_row('stock_adjustments', $id, 'Stock adjustment not found.'));
}

/* ---------- Stock Transfer ---------- */

const ST_EXTRAS = ['unitCost' => ['unit_cost', 'Unit cost', 'money', 0]];

function st_format(array $row): array
{
    [$count, $qty] = pb_line_totals('stock_transfer_items', 'stock_transfer_id', (int) $row['id']);
    $from = sm_warehouse($row['from_warehouse_id'] === null ? null : (int) $row['from_warehouse_id']);
    $to = sm_warehouse($row['to_warehouse_id'] === null ? null : (int) $row['to_warehouse_id']);
    return pb_common($row) + rr_list_extras($row, '') + [
        'code' => $row['st_code'], 'transferDate' => $row['st_date'], 'date' => $row['st_date'], 'expectedDate' => $row['expected_date'] ?? '',
        'fromWarehouseId' => $row['from_warehouse_id'] === null ? null : (int) $row['from_warehouse_id'], 'fromWarehouseCode' => $from['code'], 'fromWarehouseName' => $from['name'],
        'toWarehouseId' => $row['to_warehouse_id'] === null ? null : (int) $row['to_warehouse_id'], 'toWarehouseCode' => $to['code'], 'toWarehouseName' => $to['name'],
        'name' => trim($from['name'] . ' → ' . $to['name'], ' →'), 'transferReason' => $row['transfer_reason'],
        'itemCount' => $count, 'totalQty' => $qty, 'subtotal' => $row['grand_total'], 'grandTotal' => $row['grand_total'],
    ];
}

function stock_transfers_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM stock_transfers';
    $params = [];
    if ($search !== '') {
        $sql .= ' WHERE st_code LIKE ? OR transfer_reason LIKE ?
                  OR from_warehouse_id IN (SELECT id FROM warehouses WHERE warehouse_name LIKE ?)
                  OR to_warehouse_id IN (SELECT id FROM warehouses WHERE warehouse_name LIKE ?)';
        $params = [like($search), like($search), like($search), like($search)];
    }
    return array_map('st_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function stock_transfer_find(int $id): array
{
    $row = query('SELECT * FROM stock_transfers WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Stock transfer not found.');
    }
    return st_format($row) + ['items' => sm_find_lines('stock_transfer_items', 'stock_transfer_id', $id, ST_EXTRAS)];
}

function stock_transfer_next_code(): string
{
    return pb_next_code('stock_transfers', 'st_code', 'ST-', 4);
}

function stock_transfer_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(pb_as_input(stock_transfer_find($id), ['transferDate', 'expectedDate', 'fromWarehouseId', 'toWarehouseId', 'transferReason']), $data);
    }
    $in = new Input($data);
    $v = [
        'st_date' => $in->date('transferDate', 'Transfer date'),
        'expected_date' => $in->date('expectedDate', 'Expected date'),
        'from_warehouse_id' => $in->id('fromWarehouseId', 'stock point', 'warehouses'),
        'to_warehouse_id' => $in->id('toWarehouseId', 'stock point', 'warehouses'),
        'transfer_reason' => $in->text('transferReason', 'Transfer reason', 200),
    ] + sm_header_common($in, $data);
    if ($v['st_date'] === null) {
        $in->fail('transferDate', 'Enter the transfer date.');
    }
    if ($v['from_warehouse_id'] === null) {
        $in->fail('fromWarehouseId', 'Select the stock point the stock leaves.');
    }
    if ($v['to_warehouse_id'] === null) {
        $in->fail('toWarehouseId', 'Select the stock point the stock goes to.');
    } elseif ($v['to_warehouse_id'] === $v['from_warehouse_id']) {
        $in->fail('toWarehouseId', 'The destination must be a different stock point from the source.');
    }
    if ($v['expected_date'] !== null && $v['st_date'] !== null && $v['expected_date'] < $v['st_date']) {
        $in->fail('expectedDate', 'The expected date cannot be before the transfer date.');
    }
    $lines = sm_read_lines($in, ST_EXTRAS, false, 'Quantity');
    $in->done();
    $total = 0.0;
    foreach ($lines as $l) {
        $total += (float) $l['quantity'] * (float) $l['unitCost'];
    }
    $v['grand_total'] = pb_money($total);
    $id = stock_safe_transaction(static function () use ($id, $v, $lines): int {
        $new = $id === null;
        $id = pb_write_header('stock_transfers', 'st_code', $id, $v, 'stock_transfer_next_code');
        if ($new) {
            rr_record_creator('stock_transfers', $id);   // who made it (Filter › Employee)
        }
        sm_save_lines('stock_transfer_items', 'stock_transfer_id', $id, $lines, ST_EXTRAS);
        return $id;
    });
    return stock_transfer_find($id);
}

function stock_transfer_delete(int $id): void
{
    // Deleting it may take stock below zero (goods already delivered): refused then.
    stock_safe_transaction(static fn () => delete_row('stock_transfers', $id, 'Stock transfer not found.'));
}

/* ---------- Stock Reservation ---------- */

function sr_format(array $row): array
{
    [$count, $qty] = pb_line_totals('stock_reservation_items', 'stock_reservation_id', (int) $row['id']);
    $w = sm_warehouse($row['warehouse_id'] === null ? null : (int) $row['warehouse_id']);
    $customer = $row['customer_id'] === null ? null : query('SELECT customer_code, customer_name FROM customers WHERE id = ?', [$row['customer_id']])->fetch();
    return pb_common($row) + rr_list_extras($row, (string) ($row['created_by'] ?? '')) + [
        'code' => $row['sr_code'], 'reservationDate' => $row['sr_date'], 'date' => $row['sr_date'],
        'reservationType' => $row['reservation_type'], 'referenceNo' => $row['reference_no'],
        'customerId' => $customer ? (int) $row['customer_id'] : null, 'customerName' => $customer ? $customer['customer_name'] : '',
        'name' => $customer ? $customer['customer_name'] : '',
        'warehouseId' => $row['warehouse_id'] === null ? null : (int) $row['warehouse_id'], 'warehouseCode' => $w['code'], 'warehouseName' => $w['name'],
        'requiredDate' => $row['required_date'], 'priority' => $row['priority'], 'createdBy' => $row['created_by'],
        'status' => $row['required_date'] >= date('Y-m-d') ? 'Active' : 'Expired',
        'itemCount' => $count, 'totalQty' => $qty,
    ];
}

function stock_reservations_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM stock_reservations';
    $params = [];
    if ($search !== '') {
        $sql .= ' WHERE sr_code LIKE ? OR reference_no LIKE ? OR reservation_type LIKE ?
                  OR customer_id IN (SELECT id FROM customers WHERE customer_name LIKE ?)';
        $params = [like($search), like($search), like($search), like($search)];
    }
    return array_map('sr_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function stock_reservation_find(int $id): array
{
    $row = query('SELECT * FROM stock_reservations WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Stock reservation not found.');
    }
    return sr_format($row) + ['items' => sm_find_lines('stock_reservation_items', 'stock_reservation_id', $id, [])];
}

function stock_reservation_next_code(): string
{
    return pb_next_code('stock_reservations', 'sr_code', 'SR', 6);
}

function stock_reservation_save(array $data, ?int $id = null): array
{
    $createdBy = $id === null ? sm_user_name() : (string) query('SELECT created_by FROM stock_reservations WHERE id = ?', [$id])->fetchColumn();
    if ($id !== null) {
        $data = array_replace(pb_as_input(stock_reservation_find($id), ['reservationDate', 'reservationType', 'referenceNo', 'customerId',
            'warehouseId', 'requiredDate', 'priority']), $data);
    }
    $in = new Input($data);
    $v = [
        'sr_date' => $in->date('reservationDate', 'Reservation date'),
        'reservation_type' => $in->choice('reservationType', 'Reservation type', SM_RES_TYPES, 'Sales Order'),
        'reference_no' => $in->text('referenceNo', 'Reference number', 60),
        'customer_id' => $in->id('customerId', 'customer', 'customers'),
        'warehouse_id' => $in->id('warehouseId', 'stock point', 'warehouses'),
        'required_date' => $in->date('requiredDate', 'Required date'),
        'priority' => $in->choice('priority', 'Priority', SM_PRIORITIES, 'Normal'),
        'created_by' => $createdBy,
    ] + sm_header_common($in, $data);
    if ($v['sr_date'] === null) {
        $in->fail('reservationDate', 'Enter the reservation date.');
    }
    if ($v['required_date'] === null) {
        $in->fail('requiredDate', 'Enter the date the stock is required.');
    } elseif ($v['sr_date'] !== null && $v['required_date'] < $v['sr_date']) {
        $in->fail('requiredDate', 'The required date cannot be before the reservation date.');
    }
    $lines = sm_read_lines($in, [], false, 'Reserved quantity');
    $in->done();
    $id = transaction(static function () use ($id, $v, $lines): int {
        $new = $id === null;
        $id = pb_write_header('stock_reservations', 'sr_code', $id, $v, 'stock_reservation_next_code');
        if ($new) {
            rr_record_creator('stock_reservations', $id);   // who made it (Filter › Employee)
        }
        sm_save_lines('stock_reservation_items', 'stock_reservation_id', $id, $lines, []);
        return $id;
    });
    return stock_reservation_find($id);
}

function stock_reservation_delete(int $id): void
{
    delete_row('stock_reservations', $id, 'Stock reservation not found.');
}
