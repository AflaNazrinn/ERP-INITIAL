<?php
declare(strict_types=1);

require_once __DIR__ . '/sales_book.php';

/*
 * Return & Replacement › Sales Replacement (SRP-0001): goods sent to a customer in place of goods they return.
 * The delivery note the goods went out on (Ref ID) and the sales entry they were sold on, the buyer, their PO number and contact, the
 * currency, the replacement reason, the stock point the replacement is issued from and what happens to the returned
 * goods. Each line: the returned item, the quantity sold and replaced, its condition, the replacement item (none: the
 * same item), the old and the new unit price. Its difference = quantity × (new − old), VAT % included in it or added.
 * Price Difference = replacement value − returned value (+ VAT on the difference when excluded) − discount + the
 * handling / delivery charge: what the buyer pays (below 0: what is owed to the buyer).
 */

const SRP_REASONS = ['', 'Damaged in Transit', 'Defective / Faulty', 'Wrong Item Supplied', 'Size / Spec Mismatch', 'Quality Not as Expected',
    'Expired / Near Expiry', 'Warranty Claim', 'Upgrade Requested', 'Other'];
const SRP_RETURNED_GOODS = ['Collected from Buyer', 'To Be Collected', 'Retained by Buyer', 'Disposed at Site'];
const SRP_CONDITIONS = ['Damaged', 'Defective', 'Wrong Item', 'Expired', 'Unused', 'Other'];

function srp_format(array $row): array
{
    $lines = pb_line_totals('sales_replacement_items', 'sales_replacement_id', (int) $row['id']);
    $customer = $row['customer_id'] === null ? null : query('SELECT customer_code, customer_name FROM customers WHERE id = ?', [$row['customer_id']])->fetch();
    $dn = $row['delivery_note_id'] === null ? '' : (string) query('SELECT dn_code FROM delivery_notes WHERE id = ?', [$row['delivery_note_id']])->fetchColumn();
    $se = $row['sales_entry_id'] === null ? '' : (string) query('SELECT se_code FROM sales_entries WHERE id = ?', [$row['sales_entry_id']])->fetchColumn();
    $warehouse = $row['warehouse_id'] === null ? null
        : query('SELECT warehouse_code, warehouse_name FROM warehouses WHERE id = ?', [$row['warehouse_id']])->fetch();
    return pb_common($row) + [
        'code' => $row['srp_code'], 'replacementDate' => $row['srp_date'], 'date' => $row['srp_date'],
        'itemCount' => $lines[0], 'totalQty' => $lines[1], 'name' => $customer ? $customer['customer_name'] : 'No customer',
        'customerId' => $customer ? (int) $row['customer_id'] : null, 'customerCode' => $customer ? $customer['customer_code'] : '',
        'customerName' => $customer ? $customer['customer_name'] : '',
        'deliveryNoteId' => $row['delivery_note_id'] === null ? null : (int) $row['delivery_note_id'], 'deliveryNoteCode' => $dn,
        'salesEntryId' => $row['sales_entry_id'] === null ? null : (int) $row['sales_entry_id'], 'salesEntryCode' => $se,
        'referenceNo' => implode(' / ', array_filter([$dn, $se], static fn ($code) => $code !== '')),
        'customerPo' => $row['customer_po'], 'currency' => $row['currency'], 'replacementReason' => $row['replacement_reason'],
        'warehouseId' => $warehouse ? (int) $row['warehouse_id'] : null, 'warehouseCode' => $warehouse ? $warehouse['warehouse_code'] : '',
        'warehouseName' => $warehouse ? $warehouse['warehouse_name'] : '', 'returnedGoods' => $row['returned_goods'],
        'contactName' => $row['contact_name'], 'contactNumber' => $row['contact_number'],
        'vatMode' => $row['vat_mode'], 'returnedValue' => $row['returned_value'], 'replacementValue' => $row['replacement_value'],
        'subtotal' => pb_money((float) $row['replacement_value'] - (float) $row['returned_value']), 'vatAmount' => $row['vat_amount'],
        'discountAmount' => $row['discount_amount'], 'handlingCharge' => $row['handling_charge'], 'shipping' => $row['handling_charge'],
        'grandTotal' => $row['grand_total'],
    ];
}

function sales_replacements_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM sales_replacements';
    $params = [];
    if ($search !== '') {
        $sql .= ' WHERE srp_code LIKE ? OR customer_po LIKE ? OR customer_id IN (SELECT id FROM customers WHERE customer_name LIKE ?)';
        $params = [like($search), like($search), like($search)];
    }
    return array_map('srp_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function sales_replacement_find(int $id): array
{
    $row = query('SELECT * FROM sales_replacements WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Sales replacement not found.');
    }
    $lines = pb_find_lines('sales_replacement_items', 'sales_replacement_id', $id, 'po');
    // The replacement's own line columns, in the same order as pb_find_lines() reads them.
    $extras = query(
        'SELECT l.sold_qty, l.item_condition, l.old_price, l.replacement_item_id, l.replacement_item_code, l.replacement_item_name,
                it.item_code AS master_code, it.item_name AS master_name
         FROM sales_replacement_items l LEFT JOIN items it ON it.id = l.replacement_item_id
         WHERE l.sales_replacement_id = ? ORDER BY l.sort_order, l.id',
        [$id]
    )->fetchAll();
    foreach ($lines as $i => &$line) {
        $e = $extras[$i] ?? [];
        $line['soldQty'] = $e['sold_qty'] ?? '0';
        $line['condition'] = $e['item_condition'] ?? SRP_CONDITIONS[0];
        $line['oldPrice'] = $e['old_price'] ?? '0';
        $line['replacementItemId'] = ($e['replacement_item_id'] ?? null) === null ? null : (int) $e['replacement_item_id'];
        $line['replacementItemCode'] = (string) ($e['master_code'] ?? $e['replacement_item_code'] ?? '');
        $line['replacementItemName'] = (string) ($e['master_name'] ?? $e['replacement_item_name'] ?? '');
    }
    unset($line);
    return srp_format($row) + ['items' => $lines];
}

function sales_replacement_next_code(): string
{
    return pb_next_code('sales_replacements', 'srp_code', 'SRP-', 4);
}

/* The totals of the lines: each line's difference, the returned and replacement values, the VAT on the difference. */
function srp_totals(array $lines, string $vatMode): array
{
    $returned = 0.0;
    $replacement = 0.0;
    $vat = 0.0;
    foreach ($lines as &$line) {
        $qty = (float) $line['quantity'];
        $old = $qty * (float) $line['oldPrice'];
        $new = $qty * (float) $line['price'];
        $diff = $new - $old;
        $rate = (float) $line['vatRate'];
        $returned += $old;
        $replacement += $new;
        $vat += $vatMode === 'include' ? $diff * $rate / (100 + $rate) : $diff * $rate / 100;
        $line['lineTotal'] = pb_money($vatMode === 'include' ? $diff : $diff * (1 + $rate / 100));
    }
    unset($line);
    return [$lines, $returned, $replacement, $vat];
}

function sales_replacement_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(pb_as_input(sales_replacement_find($id), ['replacementDate', 'deliveryNoteId', 'salesEntryId',
            'customerId', 'customerPo', 'currency', 'replacementReason', 'warehouseId', 'returnedGoods', 'contactName', 'contactNumber',
            'vatMode', 'discountAmount', 'handlingCharge']), $data);
    }
    $in = new Input($data);
    $customerId = $in->id('customerId', 'buyer', 'customers');
    $v = [
        'srp_date' => $in->date('replacementDate', 'Replacement date') ?? date('Y-m-d'),
        'delivery_note_id' => $in->id('deliveryNoteId', 'delivery note', 'delivery_notes'),
        'sales_entry_id' => $in->id('salesEntryId', 'sales entry', 'sales_entries'),
        'customer_id' => $customerId,
        'customer_po' => $in->text('customerPo', 'Customer PO number', 60),
        'currency' => sb_currency($in, $customerId),
        'replacement_reason' => $in->choice('replacementReason', 'Replacement reason', SRP_REASONS, ''),
        'warehouse_id' => $in->id('warehouseId', 'stock point', 'warehouses'),
        'returned_goods' => $in->choice('returnedGoods', 'Returned goods', SRP_RETURNED_GOODS, SRP_RETURNED_GOODS[0]),
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
    if ($v['replacement_reason'] === '') {
        $in->fail('replacementReason', 'Select the replacement reason.');
    }
    $discount = (float) ($in->decimal('discountAmount', 'Discount', 14, 3) ?? '0');
    $handling = (float) ($in->decimal('handlingCharge', 'Handling / delivery charge', 14, 3) ?? '0');

    // The replacement's own line values, read from the same rows pb_read_lines() keeps (blank rows are skipped by both).
    $raws = array_values(array_filter($in->rows('items'), static fn ($raw) => is_array($raw)
        && (trim((string) ($raw['itemId'] ?? '')) !== '' || trim((string) ($raw['itemName'] ?? '')) !== '' || trim((string) ($raw['itemCode'] ?? '')) !== '')));
    $lines = pb_read_lines($in, 'po');
    foreach ($lines as $i => &$line) {
        $r = new Input($raws[$i] ?? []);
        $line['soldQty'] = $r->decimal('soldQty', 'Sold quantity', 14, 3) ?? '0';
        $line['condition'] = $r->choice('condition', 'Condition', SRP_CONDITIONS, SRP_CONDITIONS[0]);
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
        if ((float) $line['soldQty'] > 0 && (float) $line['quantity'] > (float) $line['soldQty'] + 0.0005) {
            $in->fail('items', 'Item row ' . ($i + 1) . ': the replace quantity cannot be more than the quantity sold (' . pb_qty($line['soldQty']) . ').');
        }
    }
    unset($line);
    $in->done();
    [$lines, $returned, $replacement, $vat] = srp_totals($lines, $v['vat_mode']);
    $difference = $replacement - $returned + ($v['vat_mode'] === 'exclude' ? $vat : 0.0);
    $discount = min($discount, max(0.0, $difference + $handling));       // the discount never turns a charge into a refund
    $v += ['returned_value' => pb_money($returned), 'replacement_value' => pb_money($replacement), 'vat_amount' => pb_money($vat),
        'discount_amount' => pb_money($discount), 'handling_charge' => pb_money($handling),
        'grand_total' => pb_money($difference - $discount + $handling)];
    $id = transaction(static function () use ($id, $v, $lines): int {
        $id = pb_write_header('sales_replacements', 'srp_code', $id, $v, 'sales_replacement_next_code');
        pb_save_lines('sales_replacement_items', 'sales_replacement_id', $id, 'po', $lines);
        foreach ($lines as $order => $line) {
            query('UPDATE sales_replacement_items SET sold_qty = ?, item_condition = ?, old_price = ?, replacement_item_id = ?,
                   replacement_item_code = ?, replacement_item_name = ? WHERE sales_replacement_id = ? AND sort_order = ?',
                [$line['soldQty'], $line['condition'], $line['oldPrice'], $line['replacementItemId'], $line['replacementItemCode'],
                    $line['replacementItemName'], $id, $order + 1]);
        }
        return $id;
    });
    return sales_replacement_find($id);
}

function sales_replacement_delete(int $id): void
{
    delete_row('sales_replacements', $id, 'Sales replacement not found.');
}
