<?php
declare(strict_types=1);

require_once __DIR__ . '/sales_book.php';

/*
 * Transaction Entry › Sales Entry (SAL-0001): a sale to a customer recorded in the books, the Purchase Entry's twin.
 * The customer and their PO / reference number, the tax invoice and / or delivery note it is for (either fills the
 * lines on the screen), the currency, priced item lines (quantity × rate, no VAT or line discount), a discount on the
 * total, remarks, signatory slots and the seal. Totals are worked out here with pb_totals().
 */

function se_format(array $row): array
{
    $lines = pb_line_totals('sales_entry_items', 'sales_entry_id', (int) $row['id']);
    $customer = $row['customer_id'] === null ? null : query('SELECT customer_code, customer_name FROM customers WHERE id = ?', [$row['customer_id']])->fetch();
    $ti = $row['tax_invoice_id'] === null ? '' : (string) query('SELECT ti_code FROM tax_invoices WHERE id = ?', [$row['tax_invoice_id']])->fetchColumn();
    $dn = $row['delivery_note_id'] === null ? '' : (string) query('SELECT dn_code FROM delivery_notes WHERE id = ?', [$row['delivery_note_id']])->fetchColumn();
    // The list Filter's Employee: a sales entry has no person of its own, so the Created By of its tax invoice, else of
    // its delivery note (sb_creator()).
    $tiCreator = sb_creator('ti', $row['tax_invoice_id'] === null ? null : (int) $row['tax_invoice_id']);
    $createdBy = $tiCreator !== '' ? $tiCreator : sb_creator('dn', $row['delivery_note_id'] === null ? null : (int) $row['delivery_note_id']);
    return pb_common($row) + [
        'code' => $row['se_code'], 'salesDate' => $row['se_date'], 'date' => $row['se_date'],
        'itemCount' => $lines[0], 'totalQty' => $lines[1], 'name' => $customer ? $customer['customer_name'] : 'No customer',
        'customerId' => $customer ? (int) $row['customer_id'] : null, 'customerCode' => $customer ? $customer['customer_code'] : '',
        'customerName' => $customer ? $customer['customer_name'] : '', 'customerRefNo' => $row['customer_ref_no'],
        'taxInvoiceId' => $row['tax_invoice_id'] === null ? null : (int) $row['tax_invoice_id'], 'taxInvoiceCode' => $ti,
        'deliveryNoteId' => $row['delivery_note_id'] === null ? null : (int) $row['delivery_note_id'], 'deliveryNoteCode' => $dn,
        'currency' => $row['currency'], 'vatMode' => $row['vat_mode'], 'subtotal' => $row['subtotal'], 'vatAmount' => $row['vat_amount'],
        'discountAmount' => $row['discount_amount'], 'shipping' => $row['shipping'], 'grandTotal' => $row['grand_total'],
        'createdBy' => $createdBy,
    ];
}

function sales_entries_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM sales_entries';
    $params = [];
    if ($search !== '') {
        $sql .= ' WHERE se_code LIKE ? OR customer_ref_no LIKE ? OR customer_id IN (SELECT id FROM customers WHERE customer_name LIKE ?)';
        $params = [like($search), like($search), like($search)];
    }
    return array_map('se_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function sales_entry_find(int $id): array
{
    $row = query('SELECT * FROM sales_entries WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Sales entry not found.');
    }
    return se_format($row) + ['items' => pb_find_lines('sales_entry_items', 'sales_entry_id', $id, 'po')];
}

function sales_entry_next_code(): string
{
    return pb_next_code('sales_entries', 'se_code', 'SAL-', 4);
}

function sales_entry_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(pb_as_input(sales_entry_find($id), ['salesDate', 'customerId', 'customerRefNo', 'taxInvoiceId',
            'deliveryNoteId', 'currency', 'vatMode', 'discountAmount']), $data);
    }
    $in = new Input($data);
    $customerId = $in->id('customerId', 'customer', 'customers');
    $v = [
        'se_date' => $in->date('salesDate', 'Date') ?? date('Y-m-d'),
        'customer_id' => $customerId,
        'customer_ref_no' => $in->text('customerRefNo', 'Customer PO / reference number', 60),
        'tax_invoice_id' => $in->id('taxInvoiceId', 'tax invoice', 'tax_invoices'),
        'delivery_note_id' => $in->id('deliveryNoteId', 'delivery note', 'delivery_notes'),
        'currency' => sb_currency($in, $customerId),
        'vat_mode' => 'exclude',
        'remarks' => pb_clean_html($in->text('remarks', 'Remarks', 20000)),
        'include_signatory' => pb_flag($data, 'includeSignatory'), 'attach_seal' => pb_flag($data, 'attachSeal'),
        'extra_signatories' => pb_signatories($in, $data),
    ];
    if ($customerId === null) {
        $in->fail('customerId', 'Select the customer.');
    }
    $discount = (float) ($in->decimal('discountAmount', 'Discount amount', 14, 3) ?? '0');
    $lines = pb_read_lines($in, 'po');
    $in->done();
    foreach ($lines as &$line) {                       // quantity × rate: no VAT or line discount on a sales entry
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
        $id = pb_write_header('sales_entries', 'se_code', $id, $v, 'sales_entry_next_code');
        pb_save_lines('sales_entry_items', 'sales_entry_id', $id, 'po', $lines);
        return $id;
    });
    return sales_entry_find($id);
}

function sales_entry_delete(int $id): void
{
    delete_row('sales_entries', $id, 'Sales entry not found.');
}
