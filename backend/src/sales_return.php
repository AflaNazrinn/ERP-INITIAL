<?php
declare(strict_types=1);

require_once __DIR__ . '/sales_book.php';
require_once __DIR__ . '/returns_common.php';     // the lists' Filter: who made it (Employee)

/*
 * Return & Replacement › Sales Return (SR-0001): goods a customer sends back.
 * The delivery note the goods went out on (Ref ID) and / or the sales entry they were sold on, the buyer,
 * their PO number and contact, the currency, the return reason, the stock point the goods go back to and the refund
 * mode. Lines are priced as a purchase order's ('po' lines: quantity × price, VAT % included or added on top) with the
 * quantity sold and the condition the goods came back in. Total Refund = the lines' total less the discount and the
 * restocking fee (pb_totals() with the fee as a negative charge).
 */

const SR_REASONS = ['', 'Damaged in Transit', 'Defective / Faulty', 'Wrong Item Supplied', 'Excess Quantity', 'Quality Not as Expected',
    'Customer Changed Mind', 'Expired / Near Expiry', 'Other'];
const SR_REFUND_MODES = ['Credit Note', 'Cash Refund', 'Bank Transfer', 'Adjust Against Invoice', 'Replacement'];
const SR_CONDITIONS = ['Good – Restock', 'Opened – Inspect', 'Damaged – Scrap', 'Defective – Return to Supplier'];

function sr_format(array $row): array
{
    $lines = pb_line_totals('sales_return_items', 'sales_return_id', (int) $row['id']);
    $customer = $row['customer_id'] === null ? null : query('SELECT customer_code, customer_name FROM customers WHERE id = ?', [$row['customer_id']])->fetch();
    $dn = $row['delivery_note_id'] === null ? '' : (string) query('SELECT dn_code FROM delivery_notes WHERE id = ?', [$row['delivery_note_id']])->fetchColumn();
    $se = $row['sales_entry_id'] === null ? '' : (string) query('SELECT se_code FROM sales_entries WHERE id = ?', [$row['sales_entry_id']])->fetchColumn();
    $warehouse = $row['warehouse_id'] === null ? null
        : query('SELECT warehouse_code, warehouse_name FROM warehouses WHERE id = ?', [$row['warehouse_id']])->fetch();
    return pb_common($row) + rr_list_extras($row, '') + [
        'code' => $row['sr_code'], 'returnDate' => $row['sr_date'], 'date' => $row['sr_date'],
        'itemCount' => $lines[0], 'totalQty' => $lines[1], 'name' => $customer ? $customer['customer_name'] : 'No customer',
        'customerId' => $customer ? (int) $row['customer_id'] : null, 'customerCode' => $customer ? $customer['customer_code'] : '',
        'customerName' => $customer ? $customer['customer_name'] : '',
        'deliveryNoteId' => $row['delivery_note_id'] === null ? null : (int) $row['delivery_note_id'], 'deliveryNoteCode' => $dn,
        'salesEntryId' => $row['sales_entry_id'] === null ? null : (int) $row['sales_entry_id'], 'salesEntryCode' => $se,
        'referenceNo' => implode(' / ', array_filter([$dn, $se], static fn ($code) => $code !== '')),
        'customerPo' => $row['customer_po'], 'currency' => $row['currency'], 'returnReason' => $row['return_reason'],
        'warehouseId' => $warehouse ? (int) $row['warehouse_id'] : null, 'warehouseCode' => $warehouse ? $warehouse['warehouse_code'] : '',
        'warehouseName' => $warehouse ? $warehouse['warehouse_name'] : '', 'refundMode' => $row['refund_mode'],
        'contactName' => $row['contact_name'], 'contactNumber' => $row['contact_number'],
        'vatMode' => $row['vat_mode'], 'subtotal' => $row['subtotal'], 'vatAmount' => $row['vat_amount'],
        'discountAmount' => $row['discount_amount'], 'restockingFee' => $row['restocking_fee'], 'shipping' => '0.000',
        'grandTotal' => $row['grand_total'],
    ];
}

function sales_returns_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM sales_returns';
    $params = [];
    if ($search !== '') {
        $sql .= ' WHERE sr_code LIKE ? OR customer_po LIKE ? OR customer_id IN (SELECT id FROM customers WHERE customer_name LIKE ?)';
        $params = [like($search), like($search), like($search)];
    }
    return array_map('sr_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function sales_return_find(int $id): array
{
    $row = query('SELECT * FROM sales_returns WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Sales return not found.');
    }
    $lines = pb_find_lines('sales_return_items', 'sales_return_id', $id, 'po');
    // The return's own line columns, in the same order as pb_find_lines() reads them.
    $extras = query('SELECT sold_qty, item_condition FROM sales_return_items WHERE sales_return_id = ? ORDER BY sort_order, id', [$id])->fetchAll();
    foreach ($lines as $i => &$line) {
        $line['soldQty'] = $extras[$i]['sold_qty'] ?? '0';
        $line['condition'] = $extras[$i]['item_condition'] ?? SR_CONDITIONS[0];
    }
    unset($line);
    return sr_format($row) + ['items' => $lines];
}

function sales_return_next_code(): string
{
    return pb_next_code('sales_returns', 'sr_code', 'SR-', 4);
}

function sales_return_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(pb_as_input(sales_return_find($id), ['returnDate', 'deliveryNoteId', 'salesEntryId',
            'customerId', 'customerPo', 'currency', 'returnReason', 'warehouseId', 'refundMode', 'contactName', 'contactNumber',
            'vatMode', 'discountAmount', 'restockingFee']), $data);
    }
    $in = new Input($data);
    $customerId = $in->id('customerId', 'buyer', 'customers');
    $v = [
        'sr_date' => $in->date('returnDate', 'Return date') ?? date('Y-m-d'),
        'delivery_note_id' => $in->id('deliveryNoteId', 'delivery note', 'delivery_notes'),
        'sales_entry_id' => $in->id('salesEntryId', 'sales entry', 'sales_entries'),
        'customer_id' => $customerId,
        'customer_po' => $in->text('customerPo', 'Customer PO number', 60),
        'currency' => sb_currency($in, $customerId),
        'return_reason' => $in->choice('returnReason', 'Return reason', SR_REASONS, ''),
        'warehouse_id' => $in->id('warehouseId', 'stock point', 'warehouses'),
        'refund_mode' => $in->choice('refundMode', 'Refund mode', SR_REFUND_MODES, SR_REFUND_MODES[0]),
        'contact_name' => $in->text('contactName', 'Buyer contact person', 100),
        'contact_number' => $in->text('contactNumber', 'Buyer contact number', 40),
        'vat_mode' => $in->choice('vatMode', 'VAT', ['include', 'exclude'], 'include'),
        'remarks' => pb_clean_html($in->text('remarks', 'Remarks', 20000)),
        'include_signatory' => pb_flag($data, 'includeSignatory'), 'attach_seal' => pb_flag($data, 'attachSeal'),
        'extra_signatories' => pb_signatories($in, $data),
    ];
    if ($customerId === null) {
        $in->fail('customerId', 'Select the buyer.');
    }
    $discount = (float) ($in->decimal('discountAmount', 'Discount', 14, 3) ?? '0');
    $fee = (float) ($in->decimal('restockingFee', 'Restocking fee', 14, 3) ?? '0');

    // The return's own line values, read from the same rows pb_read_lines() keeps (blank rows are skipped by both).
    $raws = array_values(array_filter($in->rows('items'), static fn ($raw) => is_array($raw)
        && (trim((string) ($raw['itemId'] ?? '')) !== '' || trim((string) ($raw['itemName'] ?? '')) !== '' || trim((string) ($raw['itemCode'] ?? '')) !== '')));
    $lines = pb_read_lines($in, 'po');
    foreach ($lines as $i => &$line) {
        $r = new Input($raws[$i] ?? []);
        $line['soldQty'] = $r->decimal('soldQty', 'Sold quantity', 14, 3) ?? '0';
        $line['condition'] = $r->choice('condition', 'Condition', SR_CONDITIONS, SR_CONDITIONS[0]);
        $line['discountPct'] = '0';                     // no line discount on a return
        $line['discountAmount'] = '0';
        $line['foc'] = false;
        try {
            $r->done();
        } catch (ValidationError $e) {
            $in->fail('items', 'Item row ' . ($i + 1) . ': ' . reset($e->fields));
        }
        if ((float) $line['soldQty'] > 0 && (float) $line['quantity'] > (float) $line['soldQty'] + 0.0005) {
            $in->fail('items', 'Item row ' . ($i + 1) . ': the return quantity cannot be more than the quantity sold (' . pb_qty($line['soldQty']) . ').');
        }
    }
    unset($line);
    $in->done();
    [$lines, $totals] = pb_totals($lines, 'po', $v['vat_mode'], $discount, 0.0);
    $fee = min($fee, max(0.0, (float) $totals['grandTotal']));      // the fee never makes the refund negative
    $v += ['subtotal' => $totals['subtotal'], 'vat_amount' => $totals['vatAmount'], 'discount_amount' => $totals['discountAmount'],
        'restocking_fee' => pb_money($fee), 'grand_total' => pb_money((float) $totals['grandTotal'] - $fee)];
    $id = transaction(static function () use ($id, $v, $lines): int {
        $new = $id === null;
        $id = pb_write_header('sales_returns', 'sr_code', $id, $v, 'sales_return_next_code');
        if ($new) {
            rr_record_creator('sales_returns', $id);   // who made it (Filter › Employee)
        }
        pb_save_lines('sales_return_items', 'sales_return_id', $id, 'po', $lines);
        foreach ($lines as $order => $line) {
            query('UPDATE sales_return_items SET sold_qty = ?, item_condition = ? WHERE sales_return_id = ? AND sort_order = ?',
                [$line['soldQty'], $line['condition'], $id, $order + 1]);
        }
        return $id;
    });
    return sales_return_find($id);
}

function sales_return_delete(int $id): void
{
    delete_row('sales_returns', $id, 'Sales return not found.');
}
