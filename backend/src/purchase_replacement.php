<?php
declare(strict_types=1);

require_once __DIR__ . '/purchase_book.php';
require_once __DIR__ . '/stock_report.php';      // stock_safe_transaction(): stock never below zero
require_once __DIR__ . '/returns_common.php';     // the lists' Filter: who made it (Employee)
require_once __DIR__ . '/sales_replacement.php';      // srp_totals(): the same line maths as a sales replacement

/*
 * Return & Replacement › Purchase Replacement (PRP-0001): goods a supplier sends in place of goods sent back to it.
 * The purchase order or GRN the goods came in on (Ref ID), who made it and their contact, the supplier's invoice
 * number, the replacement reason, the stock point the replacement is received to and what happens to the returned
 * goods; the supplier, its contact and the currency. Each line: the returned item, the quantity received and replaced,
 * its condition, the replacement item (none: the same item), the old and the new unit price. Its difference =
 * quantity × (new − old), VAT % included in it or added. Price Difference = replacement value − returned value
 * (+ VAT on the difference when excluded) − discount + the handling / delivery charge: what is paid to the supplier
 * (below 0: what the supplier owes).
 */

const PRP_REASONS = ['', 'Damaged on Receipt', 'Defective / Faulty', 'Wrong Item Supplied', 'Size / Spec Mismatch', 'Quality Not as Expected',
    'Expired / Near Expiry', 'Warranty Claim', 'Upgrade Requested', 'Other'];
const PRP_RETURNED_GOODS = ['Sent to Supplier', 'To Be Collected by Supplier', 'Held at Stock Point', 'Disposed / Scrapped'];
const PRP_CONDITIONS = ['Damaged', 'Defective', 'Wrong Item', 'Expired', 'Unused', 'Other'];

function prp_format(array $row): array
{
    $lines = pb_line_totals('purchase_replacement_items', 'purchase_replacement_id', (int) $row['id']);
    $supplier = $row['supplier_id'] === null ? null : query('SELECT supplier_code, supplier_name FROM suppliers WHERE id = ?', [$row['supplier_id']])->fetch();
    $po = $row['purchase_order_id'] === null ? '' : (string) query('SELECT po_code FROM purchase_orders WHERE id = ?', [$row['purchase_order_id']])->fetchColumn();
    $grn = $row['grn_id'] === null ? '' : (string) query('SELECT grn_code FROM grns WHERE id = ?', [$row['grn_id']])->fetchColumn();
    $warehouse = $row['warehouse_id'] === null ? null
        : query('SELECT warehouse_code, warehouse_name FROM warehouses WHERE id = ?', [$row['warehouse_id']])->fetch();
    return pb_common($row) + rr_list_extras($row, (string) ($row['created_by'] ?? '')) + [
        'code' => $row['prp_code'], 'replacementDate' => $row['prp_date'], 'date' => $row['prp_date'],
        'itemCount' => $lines[0], 'totalQty' => $lines[1], 'name' => $supplier ? $supplier['supplier_name'] : 'No supplier',
        'supplierId' => $supplier ? (int) $row['supplier_id'] : null, 'supplierCode' => $supplier ? $supplier['supplier_code'] : '',
        'supplierName' => $supplier ? $supplier['supplier_name'] : '',
        'purchaseOrderId' => $row['purchase_order_id'] === null ? null : (int) $row['purchase_order_id'], 'purchaseOrderCode' => $po,
        'grnId' => $row['grn_id'] === null ? null : (int) $row['grn_id'], 'grnCode' => $grn,
        'referenceNo' => implode(' / ', array_filter([$po, $grn], static fn ($code) => $code !== '')),
        'createdBy' => $row['created_by'], 'createdByContact' => $row['created_by_contact'],
        'supplierInvoiceNo' => $row['supplier_invoice_no'], 'replacementReason' => $row['replacement_reason'],
        'warehouseId' => $warehouse ? (int) $row['warehouse_id'] : null, 'warehouseCode' => $warehouse ? $warehouse['warehouse_code'] : '',
        'warehouseName' => $warehouse ? $warehouse['warehouse_name'] : '', 'returnedGoods' => $row['returned_goods'],
        'contactName' => $row['contact_name'], 'contactNumber' => $row['contact_number'], 'currency' => $row['currency'],
        'vatMode' => $row['vat_mode'], 'returnedValue' => $row['returned_value'], 'replacementValue' => $row['replacement_value'],
        'subtotal' => pb_money((float) $row['replacement_value'] - (float) $row['returned_value']), 'vatAmount' => $row['vat_amount'],
        'discountAmount' => $row['discount_amount'], 'handlingCharge' => $row['handling_charge'], 'shipping' => $row['handling_charge'],
        'grandTotal' => $row['grand_total'],
    ];
}

function purchase_replacements_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM purchase_replacements';
    $params = [];
    if ($search !== '') {
        $sql .= ' WHERE prp_code LIKE ? OR supplier_invoice_no LIKE ? OR supplier_id IN (SELECT id FROM suppliers WHERE supplier_name LIKE ?)';
        $params = [like($search), like($search), like($search)];
    }
    return array_map('prp_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function purchase_replacement_find(int $id): array
{
    $row = query('SELECT * FROM purchase_replacements WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Purchase replacement not found.');
    }
    $lines = pb_find_lines('purchase_replacement_items', 'purchase_replacement_id', $id, 'po');
    // The replacement's own line columns, in the same order as pb_find_lines() reads them.
    $extras = query(
        'SELECT l.received_qty, l.item_condition, l.old_price, l.replacement_item_id, l.replacement_item_code, l.replacement_item_name,
                it.item_code AS master_code, it.item_name AS master_name
         FROM purchase_replacement_items l LEFT JOIN items it ON it.id = l.replacement_item_id
         WHERE l.purchase_replacement_id = ? ORDER BY l.sort_order, l.id',
        [$id]
    )->fetchAll();
    foreach ($lines as $i => &$line) {
        $e = $extras[$i] ?? [];
        $line['receivedQty'] = $e['received_qty'] ?? '0';
        $line['condition'] = $e['item_condition'] ?? PRP_CONDITIONS[0];
        $line['oldPrice'] = $e['old_price'] ?? '0';
        $line['replacementItemId'] = ($e['replacement_item_id'] ?? null) === null ? null : (int) $e['replacement_item_id'];
        $line['replacementItemCode'] = (string) ($e['master_code'] ?? $e['replacement_item_code'] ?? '');
        $line['replacementItemName'] = (string) ($e['master_name'] ?? $e['replacement_item_name'] ?? '');
    }
    unset($line);
    return prp_format($row) + ['items' => $lines];
}

function purchase_replacement_next_code(): string
{
    return pb_next_code('purchase_replacements', 'prp_code', 'PRP-', 4);
}

function purchase_replacement_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(pb_as_input(purchase_replacement_find($id), ['replacementDate', 'purchaseOrderId', 'grnId', 'createdBy',
            'createdByContact', 'supplierInvoiceNo', 'replacementReason', 'warehouseId', 'returnedGoods', 'supplierId', 'contactName',
            'contactNumber', 'currency', 'vatMode', 'discountAmount', 'handlingCharge']), $data);
    }
    $in = new Input($data);
    $supplierId = $in->id('supplierId', 'supplier', 'suppliers');
    $v = [
        'prp_date' => $in->date('replacementDate', 'Replacement date') ?? date('Y-m-d'),
        'purchase_order_id' => $in->id('purchaseOrderId', 'purchase order', 'purchase_orders'),
        'grn_id' => $in->id('grnId', 'GRN', 'grns'),
        'created_by' => $in->text('createdBy', 'Created by', 100),
        'created_by_contact' => $in->text('createdByContact', 'Created by contact', 40),
        'supplier_invoice_no' => $in->text('supplierInvoiceNo', 'Supplier invoice number', 60),
        'replacement_reason' => $in->choice('replacementReason', 'Replacement reason', PRP_REASONS, ''),
        'warehouse_id' => $in->id('warehouseId', 'stock point', 'warehouses'),
        'returned_goods' => $in->choice('returnedGoods', 'Returned goods', PRP_RETURNED_GOODS, PRP_RETURNED_GOODS[0]),
        'supplier_id' => $supplierId,
        'contact_name' => $in->text('contactName', 'Contact person name', 100),
        'contact_number' => $in->text('contactNumber', 'Contact person number', 40),
        'currency' => po_currency($in, $supplierId),
        'vat_mode' => $in->choice('vatMode', 'VAT', PB_VAT_MODES, 'exclude'),
        'remarks' => pb_clean_html($in->text('remarks', 'Remarks', 20000)),
        'include_signatory' => pb_flag($data, 'includeSignatory'), 'attach_seal' => pb_flag($data, 'attachSeal'),
        'extra_signatories' => pb_signatories($in, $data),
    ];
    if ($v['created_by'] === '') {
        $in->fail('createdBy', 'Enter who created the replacement.');
    }
    if ($v['replacement_reason'] === '') {
        $in->fail('replacementReason', 'Select the replacement reason.');
    }
    if ($supplierId === null) {
        $in->fail('supplierId', 'Select the supplier.');
    }
    $discount = (float) ($in->decimal('discountAmount', 'Discount', 14, 3) ?? '0');
    $handling = (float) ($in->decimal('handlingCharge', 'Handling / delivery charge', 14, 3) ?? '0');

    // The replacement's own line values, read from the same rows pb_read_lines() keeps (blank rows are skipped by both).
    $raws = array_values(array_filter($in->rows('items'), static fn ($raw) => is_array($raw)
        && (trim((string) ($raw['itemId'] ?? '')) !== '' || trim((string) ($raw['itemName'] ?? '')) !== '' || trim((string) ($raw['itemCode'] ?? '')) !== '')));
    $lines = pb_read_lines($in, 'po');
    foreach ($lines as $i => &$line) {
        $r = new Input($raws[$i] ?? []);
        $line['receivedQty'] = $r->decimal('receivedQty', 'Received quantity', 14, 3) ?? '0';
        $line['condition'] = $r->choice('condition', 'Condition', PRP_CONDITIONS, PRP_CONDITIONS[0]);
        $line['oldPrice'] = $r->decimal('oldPrice', 'Old price', 14, 3) ?? '0';
        $line['replacementItemId'] = $r->id('replacementItemId', 'replacement item', 'items');
        $line['replacementItemCode'] = '';
        $line['replacementItemName'] = '';
        if ($line['replacementItemId'] !== null) {
            $item = query('SELECT item_code, item_name FROM items WHERE id = ?', [$line['replacementItemId']])->fetch();
            $line['replacementItemCode'] = $item['item_code'];
            $line['replacementItemName'] = $item['item_name'];
        }
        $line['discountPct'] = '0';                     // no line discount on a replacement
        $line['discountAmount'] = '0';
        $line['foc'] = false;
        try {
            $r->done();
        } catch (ValidationError $e) {
            $in->fail('items', 'Item row ' . ($i + 1) . ': ' . reset($e->fields));
        }
        if ((float) $line['receivedQty'] > 0 && (float) $line['quantity'] > (float) $line['receivedQty'] + 0.0005) {
            $in->fail('items', 'Item row ' . ($i + 1) . ': the replace quantity cannot be more than the quantity received (' . pb_qty($line['receivedQty']) . ').');
        }
    }
    unset($line);
    $in->done();
    [$lines, $returned, $replacement, $vat] = srp_totals($lines, $v['vat_mode']);
    $difference = $replacement - $returned + ($v['vat_mode'] === 'exclude' ? $vat : 0.0);
    $discount = min($discount, max(0.0, $difference + $handling));       // the discount never turns a payment into a credit
    $v += ['returned_value' => pb_money($returned), 'replacement_value' => pb_money($replacement), 'vat_amount' => pb_money($vat),
        'discount_amount' => pb_money($discount), 'handling_charge' => pb_money($handling),
        'grand_total' => pb_money($difference - $discount + $handling)];
    $id = stock_safe_transaction(static function () use ($id, $v, $lines): int {
        $new = $id === null;
        $id = pb_write_header('purchase_replacements', 'prp_code', $id, $v, 'purchase_replacement_next_code');
        if ($new) {
            rr_record_creator('purchase_replacements', $id);   // who made it (Filter › Employee)
        }
        pb_save_lines('purchase_replacement_items', 'purchase_replacement_id', $id, 'po', $lines);
        foreach ($lines as $order => $line) {
            query('UPDATE purchase_replacement_items SET received_qty = ?, item_condition = ?, old_price = ?, replacement_item_id = ?,
                   replacement_item_code = ?, replacement_item_name = ? WHERE purchase_replacement_id = ? AND sort_order = ?',
                [$line['receivedQty'], $line['condition'], $line['oldPrice'], $line['replacementItemId'], $line['replacementItemCode'],
                    $line['replacementItemName'], $id, $order + 1]);
        }
        return $id;
    });
    return purchase_replacement_find($id);
}

function purchase_replacement_delete(int $id): void
{
    // Deleting it may take stock below zero (goods already delivered): refused then.
    stock_safe_transaction(static fn () => delete_row('purchase_replacements', $id, 'Purchase replacement not found.'));
}
