<?php
declare(strict_types=1);

require_once __DIR__ . '/purchase_book.php';

/*
 * Trade Management (sales) documents: quotations (QUO-0001), sales orders (SO-0001) and delivery notes (DN-0001),
 * all to a customer. They share one shape: a customer with a contact, currency, delivery location, payment mode,
 * salesman, priced item lines (as purchase order lines, plus a delivery term per line), the totals worked out here
 * with pb_totals(), remarks (formatted, as the PO's), signatory slots and the seal. Each kind adds a few fields:
 *   quotation      reference no, offer validity, certification required
 *   sales order    document title (Sales Order / Proforma Invoice), supplier mode (single / multi), the supplier and its
 *                  currency, the quotation it came from, customer PO no, purchase category, a buying cost per line
 *                  (and a supplier per line in multi mode), custom duty, business promotion, advance payment,
 *                  Send For Approval; the buying total and profit are worked out here (sb_order_costs).
 *                  A Sales Order has no VAT (its lines are saved at 0%); a Proforma Invoice has.
 *   delivery note  the sales order it came from, customer PO no, stock point, carrier, vehicle no
 */

const SB_DOCS = [
    'qt' => ['table' => 'quotations', 'items' => 'quotation_items', 'owner' => 'quotation_id', 'code' => 'qt_code', 'date' => 'qt_date',
        'stem' => 'QUO-', 'noun' => 'Quotation', 'dateKey' => 'quotationDate', 'dateLabel' => 'Quotation date'],
    'so' => ['table' => 'sales_orders', 'items' => 'sales_order_items', 'owner' => 'sales_order_id', 'code' => 'so_code', 'date' => 'so_date',
        'stem' => 'SO-', 'noun' => 'Sales order', 'dateKey' => 'orderDate', 'dateLabel' => 'Order date'],
    'dn' => ['table' => 'delivery_notes', 'items' => 'delivery_note_items', 'owner' => 'delivery_note_id', 'code' => 'dn_code', 'date' => 'dn_date',
        'stem' => 'DN-', 'noun' => 'Delivery note', 'dateKey' => 'deliveryNoteDate', 'dateLabel' => 'Delivery note date'],
];

/* The header keys a saved document sends back as a save payload (a PUT that changes only some keys). */
const SB_KEYS = ['customerId', 'contactName', 'contactNumber', 'currency', 'deliveryLocation', 'paymentMode', 'creditPeriod', 'salesman',
    'salesmanContact', 'vatMode', 'discountAmount', 'shipping'];
const SB_EXTRA_KEYS = [
    'qt' => ['quotationDate', 'referenceNo', 'loyaltyMemberId', 'offerValidity', 'certifications', 'roundOff'],
    'so' => ['orderDate', 'documentTitle', 'supplierMode', 'supplierId', 'supplierCurrency', 'quotationId', 'customerPo', 'purchaseCategory',
        'customDuty', 'businessPromotion', 'advancePayment', 'sendForApproval'],
    'dn' => ['deliveryNoteDate', 'referenceNo', 'salesOrderId', 'quotationId', 'customerPo', 'carrier', 'vehicleNo'],
];

function sb_format(string $kind, array $row): array
{
    $d = SB_DOCS[$kind];
    $lines = pb_line_totals($d['items'], $d['owner'], (int) $row['id']);
    $customer = $row['customer_id'] === null ? null
        : query('SELECT customer_code, customer_name FROM customers WHERE id = ?', [$row['customer_id']])->fetch();
    $doc = pb_common($row) + [
        'code' => $row[$d['code']], $d['dateKey'] => $row[$d['date']], 'date' => $row[$d['date']],
        'itemCount' => $lines[0], 'totalQty' => $lines[1], 'name' => $customer ? $customer['customer_name'] : 'No customer',
        'customerId' => $row['customer_id'] === null ? null : (int) $row['customer_id'],
        'customerCode' => $customer ? $customer['customer_code'] : '', 'customerName' => $customer ? $customer['customer_name'] : '',
        'contactName' => $row['contact_name'], 'contactNumber' => $row['contact_number'], 'currency' => $row['currency'],
        'deliveryLocation' => $row['delivery_location'], 'paymentMode' => $row['payment_mode'], 'creditPeriod' => $row['credit_period'],
        'salesman' => $row['salesman'], 'salesmanContact' => $row['salesman_contact'],
        'vatMode' => $row['vat_mode'], 'subtotal' => $row['subtotal'], 'vatAmount' => $row['vat_amount'],
        'discountAmount' => $row['discount_amount'], 'shipping' => $row['shipping'], 'grandTotal' => $row['grand_total'],
    ];
    if ($kind === 'qt') {
        $doc += ['referenceNo' => $row['reference_no'], 'offerValidity' => $row['offer_validity'],
            'loyaltyMemberId' => $row['loyalty_member_id'], 'roundOff' => $row['round_off'],
            'certifications' => $row['certifications'] === '' ? [] : explode(', ', $row['certifications'])];
    } elseif ($kind === 'so') {
        $qt = $row['quotation_id'] === null ? '' : (string) query('SELECT qt_code FROM quotations WHERE id = ?', [$row['quotation_id']])->fetchColumn();
        $supplier = $row['supplier_id'] === null ? null : query('SELECT supplier_name FROM suppliers WHERE id = ?', [$row['supplier_id']])->fetch();
        $doc += ['quotationId' => $row['quotation_id'] === null ? null : (int) $row['quotation_id'], 'quotationCode' => $qt,
            'customerPo' => $row['customer_po'], 'advancePayment' => $row['advance_payment'],
            'documentTitle' => $row['document_title'], 'supplierMode' => $row['supplier_mode'],
            'supplierId' => $supplier ? (int) $row['supplier_id'] : null, 'supplierName' => $supplier ? $supplier['supplier_name'] : '',
            'supplierCurrency' => $row['supplier_currency'], 'purchaseCategory' => $row['purchase_category'],
            'customDuty' => $row['custom_duty'], 'businessPromotion' => $row['business_promotion'], 'itemsBuying' => $row['items_buying'],
            'totalBuying' => $row['total_buying'], 'totalProfit' => $row['total_profit'],
            'profitPercent' => (float) $row['subtotal'] > 0 ? number_format((float) $row['total_profit'] / (float) $row['subtotal'] * 100, 2, '.', '') : '0.00',
            'sendForApproval' => (bool) $row['send_for_approval'], 'status' => $row['status']];
    } else {
        $so = $row['sales_order_id'] === null ? '' : (string) query('SELECT so_code FROM sales_orders WHERE id = ?', [$row['sales_order_id']])->fetchColumn();
        $warehouse = $row['warehouse_id'] === null ? null
            : query('SELECT warehouse_code, warehouse_name FROM warehouses WHERE id = ?', [$row['warehouse_id']])->fetch();
        $qt = $row['quotation_id'] === null ? '' : (string) query('SELECT qt_code FROM quotations WHERE id = ?', [$row['quotation_id']])->fetchColumn();
        $doc += ['referenceNo' => $row['reference_no'] !== '' ? $row['reference_no'] : ($so !== '' ? $so : $qt),
            'quotationId' => $row['quotation_id'] === null ? null : (int) $row['quotation_id'], 'quotationCode' => $qt,
            'salesOrderId' => $row['sales_order_id'] === null ? null : (int) $row['sales_order_id'], 'salesOrderCode' => $so,
            'customerPo' => $row['customer_po'], 'carrier' => $row['carrier'], 'vehicleNo' => $row['vehicle_no'],
            'warehouseId' => $warehouse ? (int) $row['warehouse_id'] : null, 'warehouseCode' => $warehouse ? $warehouse['warehouse_code'] : '',
            'warehouseName' => $warehouse ? $warehouse['warehouse_name'] : ''];
    }
    return $doc;
}

function sb_list(string $kind, string $search = ''): array
{
    $d = SB_DOCS[$kind];
    $sql = "SELECT * FROM `{$d['table']}`";
    $params = [];
    if ($search !== '') {
        $sql .= " WHERE `{$d['code']}` LIKE ? OR customer_id IN (SELECT id FROM customers WHERE customer_name LIKE ?)";
        $params = [like($search), like($search)];
    }
    return array_map(static fn ($row) => sb_format($kind, $row), query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function sb_find(string $kind, int $id): array
{
    $d = SB_DOCS[$kind];
    $row = query("SELECT * FROM `{$d['table']}` WHERE id = ?", [$id])->fetch();
    if (!$row) {
        throw new NotFound($d['noun'] . ' not found.');
    }
    return sb_format($kind, $row) + ['items' => pb_find_lines($d['items'], $d['owner'], $id, SB_LINE_KINDS[$kind])];
}

function sb_next_code(string $kind): string
{
    $d = SB_DOCS[$kind];
    return pb_next_code($d['table'], $d['code'], $d['stem'], 4);
}

function sb_save(string $kind, array $data, ?int $id = null): array
{
    $d = SB_DOCS[$kind];
    if ($id !== null) {
        $data = array_replace(pb_as_input(sb_find($kind, $id), [...SB_KEYS, ...SB_EXTRA_KEYS[$kind]]), $data);
    }
    $in = new Input($data);
    $customerId = $in->id('customerId', 'customer', 'customers');
    $vatMode = $in->choice('vatMode', 'VAT mode', PB_VAT_MODES, 'exclude');
    $v = [
        $d['date'] => $in->date($d['dateKey'], $d['dateLabel']) ?? date('Y-m-d'),
        'customer_id' => $customerId,
        'contact_name' => $in->text('contactName', 'Contact person', 100),
        'contact_number' => $in->text('contactNumber', 'Contact number', 40),
        'currency' => sb_currency($in, $customerId),
        'delivery_location' => $in->text('deliveryLocation', 'Delivery location', 200),
        'payment_mode' => $in->text('paymentMode', $kind === 'so' ? 'Payment terms' : 'Payment mode', $kind === 'so' ? 100 : 40),
        'credit_period' => $in->text('creditPeriod', 'Credit period', 40),
        'salesman' => $in->text('salesman', 'Salesman / created by', 100),
        'salesman_contact' => $in->text('salesmanContact', 'Salesman contact', 40),
        'vat_mode' => $vatMode,
        'remarks' => pb_clean_html($in->text('remarks', 'Remarks', 20000)),
        'include_signatory' => pb_flag($data, 'includeSignatory'), 'attach_seal' => pb_flag($data, 'attachSeal'),
        'extra_signatories' => pb_signatories($in, $data),
    ];
    if ($kind === 'qt') {
        $v += [
            'reference_no' => $in->text('referenceNo', 'Reference number', 60),
            'loyalty_member_id' => $in->text('loyaltyMemberId', 'Loyalty member ID', 40),
            'offer_validity' => $in->text('offerValidity', 'Offer validity', 40),
            'certifications' => po_certifications($in, $data['certifications'] ?? []),
        ];
    } elseif ($kind === 'so') {
        $v += [
            'document_title' => $in->choice('documentTitle', 'Document title', SB_ORDER_TITLES, 'Sales Order'),
            'supplier_mode' => $in->choice('supplierMode', 'Supplier mode', ['single', 'multi'], 'single'),
            'supplier_id' => $in->id('supplierId', 'supplier', 'suppliers'),
            'supplier_currency' => strtoupper($in->text('supplierCurrency', 'Supplier currency', 10)) ?: 'OMR',
            'quotation_id' => $in->id('quotationId', 'quotation', 'quotations'),
            'customer_po' => $in->text('customerPo', 'Customer PO number', 60),
            'purchase_category' => $in->text('purchaseCategory', 'Purchase category', 100),
            'custom_duty' => $in->decimal('customDuty', 'Custom duty', 14, 3) ?? '0',
            'business_promotion' => $in->decimal('businessPromotion', 'Business promotion', 14, 3) ?? '0',
            'advance_payment' => $in->decimal('advancePayment', 'Advance payment', 14, 3) ?? '0',
            'send_for_approval' => pb_flag($data, 'sendForApproval'),
        ];
        $v['status'] = $v['send_for_approval'] ? 'Approved' : 'Draft';
        if (!isset(SB_RATES_TO_OMR[$v['supplier_currency']])) {
            $in->fail('supplierCurrency', 'Supplier currency must be one of: ' . implode(', ', array_keys(SB_RATES_TO_OMR)) . '.');
        }
        // A Proforma Invoice and a multi-supplier order have no order supplier.
        if ($v['document_title'] !== 'Sales Order' || $v['supplier_mode'] === 'multi') {
            $v['supplier_id'] = null;
        }
    } else {
        $v += [
            'reference_no' => $in->text('referenceNo', 'Ref num', 60),
            'sales_order_id' => $in->id('salesOrderId', 'sales order', 'sales_orders'),
            'quotation_id' => $in->id('quotationId', 'quotation', 'quotations'),
            'customer_po' => $in->text('customerPo', 'Customer PO number', 60),
            'carrier' => $in->text('carrier', 'Carrier', 100),
            'vehicle_no' => $in->text('vehicleNo', 'Vehicle number', 40),
        ];
    }
    if ($customerId === null) {
        $in->fail('customerId', 'Select the customer.');
    }
    // Credit Period goes with the Credit payment mode only; any other mode drops it. A sales order's payment terms are free text.
    if ($v['payment_mode'] !== 'Credit') {
        $v['credit_period'] = '';
    }
    if ($kind !== 'so' && $v['payment_mode'] !== '' && !in_array($v['payment_mode'], PB_PAYMENT_MODES, true)) {
        $in->fail('paymentMode', 'Payment mode must be one of: ' . implode(', ', PB_PAYMENT_MODES) . '.');
    }
    foreach (['salesman_contact' => 'salesmanContact', 'contact_number' => 'contactNumber'] as $column => $key) {
        if ($v[$column] !== '' && !preg_match('~^[0-9+\-\s()]{3,40}$~', $v[$column])) {
            $in->fail($key, 'Enter a phone number (digits, spaces, + - ( ) only).');
        }
    }
    $discount = (float) ($in->decimal('discountAmount', 'Discount amount', 14, 3) ?? '0');
    $shipping = (float) ($in->decimal('shipping', 'Delivery charge', 14, 3) ?? '0');
    $lineKind = SB_LINE_KINDS[$kind];
    $lines = pb_read_lines($in, $lineKind);
    $in->done();
    if ($kind === 'so' && $v['document_title'] === 'Sales Order') {
        foreach ($lines as &$line) {
            $line['vatRate'] = '0';                     // a sales order carries no VAT (a proforma invoice does)
        }
        unset($line);
    }
    if ($kind === 'so' && $v['supplier_mode'] !== 'multi') {
        foreach ($lines as &$line) {
            $line['supplierId'] = null;                 // one supplier for the whole order
            $line['supplierCurrency'] = '';
        }
        unset($line);
    }
    [$lines, $totals] = pb_totals($lines, $lineKind, $vatMode, $discount, $shipping);
    $v += ['subtotal' => $totals['subtotal'], 'vat_amount' => $totals['vatAmount'], 'discount_amount' => $totals['discountAmount'],
        'shipping' => $totals['shipping'], 'grand_total' => $totals['grandTotal']];
    if ($kind === 'so') {
        $v += sb_order_costs($v, $lines);
    }
    if ($kind === 'qt') {
        // Round Off: an amount (may be negative) added to the grand total.
        $round = trim((string) ($data['roundOff'] ?? '0')) ?: '0';
        if (!preg_match('/^-?\d{1,11}(\.\d{1,3})?$/', $round)) {
            $in->fail('roundOff', 'Round off must be an amount with up to 3 decimals.');
            $in->done();
        }
        $v['round_off'] = pb_money((float) $round);
        $v['grand_total'] = pb_money((float) $v['grand_total'] + (float) $round);
    }
    $id = transaction(static function () use ($kind, $d, $id, $v, $lines, $lineKind): int {
        $id = pb_write_header($d['table'], $d['code'], $id, $v, static fn () => sb_next_code($kind));
        pb_save_lines($d['items'], $d['owner'], $id, $lineKind, $lines);
        return $id;
    });
    return sb_find($kind, $id);
}

const SB_ORDER_TITLES = ['Sales Order', 'Proforma Invoice'];
const SB_LINE_KINDS = ['qt' => 'sales', 'so' => 'salesorder', 'dn' => 'deliverynote'];

/* Fixed rates to OMR for a sales order's buying costs (the order screen uses the same table). */
const SB_RATES_TO_OMR = ['OMR' => 1.0, 'AED' => 0.1055, 'USD' => 0.385, 'SAR' => 0.1026, 'INR' => 0.0046, 'EUR' => 0.42,
    'GBP' => 0.49, 'QAR' => 0.1057, 'KWD' => 1.25, 'BHD' => 1.02];

/* One unit of $from in $to (1 when either is not in the table). */
function sb_rate(string $from, string $to): float
{
    $a = SB_RATES_TO_OMR[$from] ?? null;
    $b = SB_RATES_TO_OMR[$to] ?? null;
    return $a === null || $b === null || $from === $to ? 1.0 : $a / $b;
}

/*
 * A sales order's buying side, in the order's (base) currency:
 *   item landing cost = Σ quantity × buying cost × landing (1.10 for an AED supplier: freight and clearing) × rate
 *   total buying      = item landing cost + custom duty + transportation + business promotion
 *   total profit      = total selling (subtotal) − item landing cost − custom duty − transportation − business promotion − discount
 * Each line's supplier currency is its supplier's in multi-supplier mode, else the order's supplier currency.
 */
function sb_order_costs(array $v, array $lines): array
{
    $base = $v['currency'];
    $items = 0.0;
    foreach ($lines as $line) {
        $supplierCurrency = $v['supplier_mode'] === 'multi' ? ($line['supplierCurrency'] ?: $base) : $v['supplier_currency'];
        $landing = $supplierCurrency === 'AED' ? 1.10 : 1.0;
        $items += (float) $line['quantity'] * (float) $line['buyingCost'] * $landing * sb_rate($supplierCurrency, $base);
    }
    $costs = (float) $v['custom_duty'] + (float) $v['shipping'] + (float) $v['business_promotion'];
    return [
        'items_buying' => pb_money($items),
        'total_buying' => pb_money($items + $costs),
        'total_profit' => pb_money((float) $v['subtotal'] - $items - $costs - (float) $v['discount_amount']),
    ];
}

/* The document's currency: the one picked on the form, else the customer's, else OMR. */
function sb_currency(Input $in, ?int $customerId): string
{
    $currency = strtoupper($in->text('currency', 'Currency', 10));
    if ($currency !== '' && !in_array($currency, PB_CURRENCIES, true)) {
        $in->fail('currency', 'Currency must be one of: ' . implode(', ', PB_CURRENCIES) . '.');
    }
    if ($currency === '' && $customerId !== null) {
        $currency = strtoupper((string) query('SELECT currency FROM customers WHERE id = ?', [$customerId])->fetchColumn());
        if (!in_array($currency, PB_CURRENCIES, true)) {
            $currency = '';
        }
    }
    return $currency !== '' ? $currency : 'OMR';
}

function sb_delete(string $kind, int $id): void
{
    $d = SB_DOCS[$kind];
    delete_row($d['table'], $id, $d['noun'] . ' not found.');
}

/* The serve_master() callbacks for one kind. */
function sb_serve(string $kind): void
{
    // GET ?deliveryTerms=1: every Delivery Term the item lines of quotations, sales orders and delivery notes have
    // used, newest first, once each (the lines' Delivery Term suggests them as it is typed).
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && isset($_GET['deliveryTerms'])) {
        $terms = [];
        foreach (['quotation_items', 'sales_order_items', 'delivery_note_items'] as $table) {
            try {
                foreach (query("SELECT delivery_term AS term, MAX(id) AS last FROM $table WHERE delivery_term <> '' GROUP BY delivery_term")->fetchAll() as $row) {
                    $key = mb_strtoupper(trim((string) $row['term']));
                    $terms[$key] = max($terms[$key] ?? 0, (int) $row['last']);
                }
            } catch (PDOException) {
                // a table this company's database does not have yet
            }
        }
        arsort($terms);
        json_out(array_slice(array_keys($terms), 0, 200));
    }
    // GET ?creditDays=1: the Credit Days quotations have used (whole numbers), newest first, once each.
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && isset($_GET['creditDays'])) {
        $days = [];
        try {
            foreach (query("SELECT credit_period AS days, MAX(id) AS last FROM quotations WHERE credit_period <> '' GROUP BY credit_period")->fetchAll() as $row) {
                if (preg_match('/^\s*(\d{1,4})/', (string) $row['days'], $m)) {
                    $days[$m[1]] = max($days[$m[1]] ?? 0, (int) $row['last']);
                }
            }
        } catch (PDOException) {
            // no quotations table yet
        }
        arsort($days);
        json_out(array_map('strval', array_keys($days)));
    }
    serve_master(
        static fn (string $search = '', bool $all = false) => sb_list($kind, $search),
        static fn (int $id) => sb_find($kind, $id),
        static fn () => sb_next_code($kind),
        static fn (array $data, ?int $id = null) => sb_save($kind, $data, $id),
        static fn (int $id) => sb_delete($kind, $id),
    );
}
