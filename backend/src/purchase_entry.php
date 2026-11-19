<?php
declare(strict_types=1);

require_once __DIR__ . '/purchase_book.php';

/*
 * Transaction Entry › Purchase Entry (PUR-0001): a supplier's bill recorded in the books. The supplier and the
 * supplier's own invoice number, the purchase order and / or GRN it is for (either fills the lines on the screen),
 * the currency, priced item lines (quantity × rate, as purchase order lines with no VAT or line discount), a
 * discount on the total, remarks, signatory slots and the seal. Totals are worked out here with pb_totals().
 */

function pe_format(array $row): array
{
    $lines = pb_line_totals('purchase_entry_items', 'purchase_entry_id', (int) $row['id']);
    $supplier = $row['supplier_id'] === null ? null : query('SELECT supplier_code, supplier_name FROM suppliers WHERE id = ?', [$row['supplier_id']])->fetch();
    $po = $row['purchase_order_id'] === null ? '' : (string) query('SELECT po_code FROM purchase_orders WHERE id = ?', [$row['purchase_order_id']])->fetchColumn();
    $grn = $row['grn_id'] === null ? '' : (string) query('SELECT grn_code FROM grns WHERE id = ?', [$row['grn_id']])->fetchColumn();
    return pb_common($row) + [
        'code' => $row['pe_code'], 'purchaseDate' => $row['pe_date'], 'date' => $row['pe_date'],
        'itemCount' => $lines[0], 'totalQty' => $lines[1], 'name' => $supplier ? $supplier['supplier_name'] : 'No supplier',
        'supplierId' => $supplier ? (int) $row['supplier_id'] : null, 'supplierCode' => $supplier ? $supplier['supplier_code'] : '',
        'supplierName' => $supplier ? $supplier['supplier_name'] : '', 'supplierInvoiceNo' => $row['supplier_invoice_no'],
        'purchaseOrderId' => $row['purchase_order_id'] === null ? null : (int) $row['purchase_order_id'], 'purchaseOrderCode' => $po,
        'grnId' => $row['grn_id'] === null ? null : (int) $row['grn_id'], 'grnCode' => $grn,
        'currency' => $row['currency'], 'vatMode' => $row['vat_mode'], 'subtotal' => $row['subtotal'], 'vatAmount' => $row['vat_amount'],
        'discountAmount' => $row['discount_amount'], 'shipping' => $row['shipping'], 'grandTotal' => $row['grand_total'],
    ];
}

function purchase_entries_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM purchase_entries';
    $params = [];
    if ($search !== '') {
        $sql .= ' WHERE pe_code LIKE ? OR supplier_invoice_no LIKE ? OR supplier_id IN (SELECT id FROM suppliers WHERE supplier_name LIKE ?)';
        $params = [like($search), like($search), like($search)];
    }
    return array_map('pe_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function purchase_entry_find(int $id): array
{
    $row = query('SELECT * FROM purchase_entries WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Purchase entry not found.');
    }
    return pe_format($row) + ['items' => pb_find_lines('purchase_entry_items', 'purchase_entry_id', $id, 'po')];
}

function purchase_entry_next_code(): string
{
    return pb_next_code('purchase_entries', 'pe_code', 'PUR-', 4);
}

function purchase_entry_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(pb_as_input(purchase_entry_find($id), ['purchaseDate', 'supplierId', 'supplierInvoiceNo', 'purchaseOrderId',
            'grnId', 'currency', 'vatMode', 'discountAmount']), $data);
    }
    $in = new Input($data);
    $supplierId = $in->id('supplierId', 'supplier', 'suppliers');
    $v = [
        'pe_date' => $in->date('purchaseDate', 'Date') ?? date('Y-m-d'),
        'supplier_id' => $supplierId,
        'supplier_invoice_no' => $in->text('supplierInvoiceNo', 'Supplier invoice number', 60),
        'purchase_order_id' => $in->id('purchaseOrderId', 'purchase order', 'purchase_orders'),
        'grn_id' => $in->id('grnId', 'GRN', 'grns'),
        'currency' => po_currency($in, $supplierId),
        'vat_mode' => 'exclude',
        'remarks' => pb_clean_html($in->text('remarks', 'Remarks', 20000)),
        'include_signatory' => pb_flag($data, 'includeSignatory'), 'attach_seal' => pb_flag($data, 'attachSeal'),
        'extra_signatories' => pb_signatories($in, $data),
    ];
    if ($supplierId === null) {
        $in->fail('supplierId', 'Select the supplier.');
    }
    $discount = (float) ($in->decimal('discountAmount', 'Discount amount', 14, 3) ?? '0');
    $lines = pb_read_lines($in, 'po');
    $in->done();
    foreach ($lines as &$line) {                       // quantity × rate: no VAT or line discount on a purchase entry
        $line['vatRate'] = '0';
        $line['discountPct'] = '0';
        $line['discountAmount'] = '0';
        $line['foc'] = false;
    }
    unset($line);
    [$lines, $totals] = pb_totals($lines, 'po', 'exclude', $discount, 0.0);
    $v += ['subtotal' => $totals['subtotal'], 'vat_amount' => $totals['vatAmount'], 'discount_amount' => $totals['discountAmount'],
        'shipping' => $totals['shipping'], 'grand_total' => $totals['grandTotal']];
    $id = transaction(static function () use ($id, $v, $lines): int {
        $id = pb_write_header('purchase_entries', 'pe_code', $id, $v, 'purchase_entry_next_code');
        pb_save_lines('purchase_entry_items', 'purchase_entry_id', $id, 'po', $lines);
        return $id;
    });
    return purchase_entry_find($id);
}

function purchase_entry_delete(int $id): void
{
    delete_row('purchase_entries', $id, 'Purchase entry not found.');
}
