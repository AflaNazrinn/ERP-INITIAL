<?php
declare(strict_types=1);

require_once __DIR__ . '/purchase_book.php';
require_once __DIR__ . '/returns_common.php';     // the lists' Filter: who made it (Employee)

/*
 * Return & Replacement › Purchase Return (PRT-0001): goods sent back to a supplier.
 * The purchase order or GRN the goods came in on (Ref ID), who made the return and their contact, the supplier's
 * invoice number, the return reason, the stock point the goods leave from and the settlement mode; the supplier, its
 * contact and the currency. Lines are priced as a purchase order's ('po' lines: quantity × price, VAT % included or
 * added on top) with the quantity received and the condition of the goods. Total Return Amount = the lines' total less
 * the discount and the supplier deduction (never below 0).
 *
 * Return Reason "Sales Return": goods a customer returned (a sales return, Sales Return ID) go back to the supplier.
 * The lines come from that sales return, not from a PO or GRN, so the return has no PO / GRN Ref. Those goods were
 * never put back into stock, so such a return must take nothing out of stock. (Stock on hand, sm_stock_on_hand() in
 * supply.php, does not count purchase returns at all yet; when it does, it must leave these out.)
 */

const PRT_REASONS = ['Damaged on Receipt', 'Defective / Faulty', 'Wrong Item Supplied', 'Excess Quantity', 'Quality Not as Expected',
    'Expired / Near Expiry', 'Short Shelf Life', 'Price Discrepancy', 'Sales Return', 'Other'];
const PRT_SALES_RETURN = 'Sales Return';
const PRT_SETTLEMENT_MODES = ['Debit Note', 'Cash Refund', 'Bank Transfer', 'Adjust Against Invoice', 'Replacement'];
const PRT_CONDITIONS = ['Damaged', 'Defective', 'Wrong Item', 'Excess', 'Expired', 'Good'];

function prt_format(array $row): array
{
    $lines = pb_line_totals('purchase_return_items', 'purchase_return_id', (int) $row['id']);
    $supplier = $row['supplier_id'] === null ? null : query('SELECT supplier_code, supplier_name FROM suppliers WHERE id = ?', [$row['supplier_id']])->fetch();
    $po = $row['purchase_order_id'] === null ? '' : (string) query('SELECT po_code FROM purchase_orders WHERE id = ?', [$row['purchase_order_id']])->fetchColumn();
    $grn = $row['grn_id'] === null ? '' : (string) query('SELECT grn_code FROM grns WHERE id = ?', [$row['grn_id']])->fetchColumn();
    $sr = $row['sales_return_id'] === null ? '' : (string) query('SELECT sr_code FROM sales_returns WHERE id = ?', [$row['sales_return_id']])->fetchColumn();
    $warehouse = $row['warehouse_id'] === null ? null
        : query('SELECT warehouse_code, warehouse_name FROM warehouses WHERE id = ?', [$row['warehouse_id']])->fetch();
    return pb_common($row) + rr_list_extras($row, (string) ($row['created_by'] ?? '')) + [
        'code' => $row['prt_code'], 'returnDate' => $row['prt_date'], 'date' => $row['prt_date'],
        'itemCount' => $lines[0], 'totalQty' => $lines[1], 'name' => $supplier ? $supplier['supplier_name'] : 'No supplier',
        'supplierId' => $supplier ? (int) $row['supplier_id'] : null, 'supplierCode' => $supplier ? $supplier['supplier_code'] : '',
        'supplierName' => $supplier ? $supplier['supplier_name'] : '',
        'purchaseOrderId' => $row['purchase_order_id'] === null ? null : (int) $row['purchase_order_id'], 'purchaseOrderCode' => $po,
        'grnId' => $row['grn_id'] === null ? null : (int) $row['grn_id'], 'grnCode' => $grn,
        'salesReturnId' => $row['sales_return_id'] === null ? null : (int) $row['sales_return_id'], 'salesReturnCode' => $sr,
        'referenceNo' => implode(' / ', array_filter([$po, $grn, $sr], static fn ($code) => $code !== '')),
        'createdBy' => $row['created_by'], 'createdByContact' => $row['created_by_contact'],
        'supplierInvoiceNo' => $row['supplier_invoice_no'], 'returnReason' => $row['return_reason'],
        'warehouseId' => $warehouse ? (int) $row['warehouse_id'] : null, 'warehouseCode' => $warehouse ? $warehouse['warehouse_code'] : '',
        'warehouseName' => $warehouse ? $warehouse['warehouse_name'] : '', 'settlementMode' => $row['settlement_mode'],
        'contactName' => $row['contact_name'], 'contactNumber' => $row['contact_number'], 'currency' => $row['currency'],
        'vatMode' => $row['vat_mode'], 'subtotal' => $row['subtotal'], 'vatAmount' => $row['vat_amount'],
        'discountAmount' => $row['discount_amount'], 'supplierDeduction' => $row['supplier_deduction'], 'shipping' => '0.000',
        'grandTotal' => $row['grand_total'],
    ];
}

function purchase_returns_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM purchase_returns';
    $params = [];
    if ($search !== '') {
        $sql .= ' WHERE prt_code LIKE ? OR supplier_invoice_no LIKE ? OR supplier_id IN (SELECT id FROM suppliers WHERE supplier_name LIKE ?)';
        $params = [like($search), like($search), like($search)];
    }
    return array_map('prt_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function purchase_return_find(int $id): array
{
    $row = query('SELECT * FROM purchase_returns WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Purchase return not found.');
    }
    $lines = pb_find_lines('purchase_return_items', 'purchase_return_id', $id, 'po');
    // The return's own line columns, in the same order as pb_find_lines() reads them.
    $extras = query('SELECT received_qty, item_condition FROM purchase_return_items WHERE purchase_return_id = ? ORDER BY sort_order, id', [$id])->fetchAll();
    foreach ($lines as $i => &$line) {
        $line['receivedQty'] = $extras[$i]['received_qty'] ?? '0';
        $line['condition'] = $extras[$i]['item_condition'] ?? PRT_CONDITIONS[0];
    }
    unset($line);
    return prt_format($row) + ['items' => $lines];
}

function purchase_return_next_code(): string
{
    return pb_next_code('purchase_returns', 'prt_code', 'PRT-', 4);
}

function purchase_return_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(pb_as_input(purchase_return_find($id), ['returnDate', 'purchaseOrderId', 'grnId', 'salesReturnId', 'createdBy',
            'createdByContact', 'supplierInvoiceNo', 'returnReason', 'warehouseId', 'settlementMode', 'supplierId', 'contactName',
            'contactNumber', 'currency', 'vatMode', 'discountAmount', 'supplierDeduction']), $data);
    }
    $in = new Input($data);
    $supplierId = $in->id('supplierId', 'supplier', 'suppliers');
    $v = [
        'prt_date' => $in->date('returnDate', 'Return date') ?? date('Y-m-d'),
        'purchase_order_id' => $in->id('purchaseOrderId', 'purchase order', 'purchase_orders'),
        'grn_id' => $in->id('grnId', 'GRN', 'grns'),
        'sales_return_id' => $in->id('salesReturnId', 'sales return', 'sales_returns'),
        'created_by' => $in->text('createdBy', 'Created by', 100),
        'created_by_contact' => $in->text('createdByContact', 'Created by contact', 40),
        'supplier_invoice_no' => $in->text('supplierInvoiceNo', 'Supplier invoice number', 60),
        'return_reason' => $in->choice('returnReason', 'Return reason', ['', ...PRT_REASONS], ''),
        'warehouse_id' => $in->id('warehouseId', 'stock point', 'warehouses'),
        'settlement_mode' => $in->choice('settlementMode', 'Settlement mode', PRT_SETTLEMENT_MODES, PRT_SETTLEMENT_MODES[0]),
        'supplier_id' => $supplierId,
        'contact_name' => $in->text('contactName', 'Contact person name', 100),
        'contact_number' => $in->text('contactNumber', 'Contact person number', 40),
        'currency' => po_currency($in, $supplierId),
        'vat_mode' => $in->choice('vatMode', 'VAT', PB_VAT_MODES, 'include'),
        'remarks' => pb_clean_html($in->text('remarks', 'Remarks', 20000)),
        'include_signatory' => pb_flag($data, 'includeSignatory'), 'attach_seal' => pb_flag($data, 'attachSeal'),
        'extra_signatories' => pb_signatories($in, $data),
    ];
    if ($v['created_by'] === '') {
        $in->fail('createdBy', 'Enter who created the return.');
    }
    if ($v['return_reason'] === '') {
        $in->fail('returnReason', 'Select the return reason.');
    }
    // A customer's returned goods: the sales return they came back on, and no PO / GRN (the lines are the sales return's).
    if ($v['return_reason'] === PRT_SALES_RETURN) {
        if ($v['sales_return_id'] === null) {
            $in->fail('salesReturnId', 'Select the sales return.');
        }
        $v['purchase_order_id'] = null;
        $v['grn_id'] = null;
    } else {
        $v['sales_return_id'] = null;
    }
    if ($supplierId === null) {
        $in->fail('supplierId', 'Select the supplier.');
    }
    $discount = (float) ($in->decimal('discountAmount', 'Discount', 14, 3) ?? '0');
    $deduction = (float) ($in->decimal('supplierDeduction', 'Supplier deduction', 14, 3) ?? '0');

    // The return's own line values, read from the same rows pb_read_lines() keeps (blank rows are skipped by both).
    $raws = array_values(array_filter($in->rows('items'), static fn ($raw) => is_array($raw)
        && (trim((string) ($raw['itemId'] ?? '')) !== '' || trim((string) ($raw['itemName'] ?? '')) !== '' || trim((string) ($raw['itemCode'] ?? '')) !== '')));
    $lines = pb_read_lines($in, 'po');
    foreach ($lines as $i => &$line) {
        $r = new Input($raws[$i] ?? []);
        $line['receivedQty'] = $r->decimal('receivedQty', 'Received quantity', 14, 3) ?? '0';
        $line['condition'] = $r->choice('condition', 'Condition', PRT_CONDITIONS, PRT_CONDITIONS[0]);
        $line['discountPct'] = '0';                     // no line discount on a return
        $line['discountAmount'] = '0';
        $line['foc'] = false;
        try {
            $r->done();
        } catch (ValidationError $e) {
            $in->fail('items', 'Item row ' . ($i + 1) . ': ' . reset($e->fields));
        }
        if ((float) $line['receivedQty'] > 0 && (float) $line['quantity'] > (float) $line['receivedQty'] + 0.0005) {
            $in->fail('items', 'Item row ' . ($i + 1) . ': the return quantity cannot be more than the quantity received (' . pb_qty($line['receivedQty']) . ').');
        }
    }
    unset($line);
    $in->done();
    [$lines, $totals] = pb_totals($lines, 'po', $v['vat_mode'], $discount, 0.0);
    $deduction = min($deduction, max(0.0, (float) $totals['grandTotal']));      // the deduction never makes the amount negative
    $v += ['subtotal' => $totals['subtotal'], 'vat_amount' => $totals['vatAmount'], 'discount_amount' => $totals['discountAmount'],
        'supplier_deduction' => pb_money($deduction), 'grand_total' => pb_money((float) $totals['grandTotal'] - $deduction)];
    $id = transaction(static function () use ($id, $v, $lines): int {
        $new = $id === null;
        $id = pb_write_header('purchase_returns', 'prt_code', $id, $v, 'purchase_return_next_code');
        if ($new) {
            rr_record_creator('purchase_returns', $id);   // who made it (Filter › Employee)
        }
        pb_save_lines('purchase_return_items', 'purchase_return_id', $id, 'po', $lines);
        foreach ($lines as $order => $line) {
            query('UPDATE purchase_return_items SET received_qty = ?, item_condition = ? WHERE purchase_return_id = ? AND sort_order = ?',
                [$line['receivedQty'], $line['condition'], $id, $order + 1]);
        }
        return $id;
    });
    return purchase_return_find($id);
}

function purchase_return_delete(int $id): void
{
    delete_row('purchase_returns', $id, 'Purchase return not found.');
}
