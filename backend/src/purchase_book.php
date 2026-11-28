<?php
declare(strict_types=1);

require_once __DIR__ . '/master_validation.php';
require_once __DIR__ . '/company_currency.php';

/*
 * Purchase Book documents: purchase requests (PR), quotation requests (RFQ), purchase orders (PO) and
 * goods receipt notes (GRN). Each has a header and item lines (items: [...] in the payload).
 *
 * Money (OMR) has 3 decimals. Purchase orders and GRNs are priced; their totals are worked out here
 * from the lines, the same way the form shows them (pb_totals), and stored with the document:
 *   line value   = quantity × price − the line's discount (0 for a free-of-charge line)
 *   the Discount Amount on the document is shared across the lines by value, before tax
 *   VAT          = each line's VAT % on its value after both discounts; with vat_mode 'include' the
 *                  prices already contain it (VAT is the part included), with 'exclude' it is added
 *   Grand Total  = Subtotal − Discount Amount (+ VAT when excluded) + Shipping
 */

const PB_PURCHASE_TYPES = ['Against Order', 'Against Stock'];
const PB_PO_STATUSES = ['Draft', 'Sent', 'Confirmed', 'Partially Received', 'Received', 'Cancelled'];
const PB_PAYMENT_MODES = ['As usual', 'Cash', 'Bank Transfer', 'Cheque', 'Credit', 'Card'];
const PB_CERTIFICATIONS = ['N/A', 'Pressure Test', 'COC Certificate', 'MTC Certificate', 'TPI Certificate'];
const PB_CURRENCIES = ['OMR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'USD', 'EUR', 'INR', 'GBP', 'PKR', 'EGP', 'JOD', 'TRY', 'CNY', 'JPY', 'KRW'];
const PB_VAT_MODES = ['include', 'exclude'];

/* The next document number: PR000001, RFQ000001, PO-0001, GRN000001. Call inside the insert's transaction. */
function pb_next_code(string $table, string $column, string $stem, int $digits): string
{
    $last = query(
        "SELECT `$column` FROM `$table` WHERE `$column` LIKE ? ORDER BY LENGTH(`$column`) DESC, `$column` DESC LIMIT 1 FOR UPDATE",
        [addcslashes($stem, '%_\\') . '%']
    )->fetchColumn();
    $number = $last === false ? 1 : ((int) substr((string) $last, strlen($stem))) + 1;
    return $stem . str_pad((string) $number, $digits, '0', STR_PAD_LEFT);
}

function pb_money(float $value): string
{
    return number_format(round($value, 3), 3, '.', '');
}

function pb_flag(array $data, string $key): int
{
    return !empty($data[$key]) && $data[$key] !== 'false' ? 1 : 0;
}

/* The signatory slots printed on the PDF: each a name ("Prepared By") and a position / title ("Procurement
   Officer"), kept as a JSON list in extra_signatories. A slot with neither is dropped; at most PB_MAX_SIGNATORIES,
   each part up to 60 characters. A document saved before slots were editable has null there and prints
   Prepared / Checked / Approved By (pb_signatory_list). */
const PB_MAX_SIGNATORIES = 6;
function pb_signatories(Input $in, array $data): string
{
    $clean = static fn ($value) => trim(preg_replace('/\s+/u', ' ', is_scalar($value) ? (string) $value : ''));
    $slots = [];
    foreach (array_values(is_array($data['signatories'] ?? null) ? $data['signatories'] : []) as $slot) {
        $name = $clean(is_array($slot) ? ($slot['name'] ?? '') : $slot);
        $title = $clean(is_array($slot) ? ($slot['title'] ?? '') : '');
        if ($name === '' && $title === '') {
            continue;
        }
        if (mb_strlen($name) > 60 || mb_strlen($title) > 60) {
            $in->fail('signatories', 'A signatory name or title can be at most 60 characters.');
            return '[]';
        }
        $slots[] = ['name' => $name, 'title' => $title];
    }
    if (count($slots) > PB_MAX_SIGNATORIES) {
        $in->fail('signatories', 'Add at most ' . PB_MAX_SIGNATORIES . ' signatories.');
        return '[]';
    }
    return json_encode($slots, JSON_UNESCAPED_UNICODE);
}

/* A document's signatory slots as [{ name, title }]. */
function pb_signatory_list(?string $json): array
{
    if ($json === null) {
        return array_map(static fn ($name) => ['name' => $name, 'title' => ''], ['Prepared By', 'Checked By', 'Approved By']);
    }
    $list = json_decode($json, true);
    $slots = [];
    foreach (is_array($list) ? $list : [] as $slot) {
        if (is_string($slot)) {
            $slots[] = ['name' => $slot, 'title' => ''];           // saved while slots were only names
        } elseif (is_array($slot)) {
            $slots[] = ['name' => (string) ($slot['name'] ?? ''), 'title' => (string) ($slot['title'] ?? '')];
        }
    }
    return $slots;
}

/* ---------- Formatted remarks (purchase requests and purchase orders) ----------
 * The remarks editor sends HTML. Only these tags are kept, each without attributes except a text colour
 * (style="color: #rrggbb"); scripts, styles and embeds are dropped with their content and any other tag
 * is unwrapped to its text. Remarks without tags (older orders, imports) stay plain text.
 */
const PB_REMARK_TAGS = ['b', 'strong', 'i', 'em', 'u', 'span', 'font', 'br', 'div', 'p', 'ul', 'ol', 'li'];
const PB_REMARK_DROP = ['script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math', 'head', 'title', 'meta', 'link',
    'form', 'input', 'button', 'textarea', 'select'];

/* Formatted remarks contain one of the kept tags; anything else is plain text (shown escaped). The page uses the same test. */
function pb_is_html(string $text): bool
{
    return (bool) preg_match('~</?(b|strong|i|em|u|span|font|br|div|p|ul|ol|li)\b~i', $text);
}

function pb_clean_html(string $html): string
{
    $html = trim($html);
    if ($html === '' || !pb_is_html($html)) {
        return $html;
    }
    if (!class_exists(DOMDocument::class)) {      // no DOM extension: keep the text and its line breaks
        $text = (string) preg_replace('~<(br|/p|/div|/li)\b[^>]*>~i', "\n", $html);
        return trim(html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }
    $doc = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    $doc->loadHTML('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' . $html . '</body></html>', LIBXML_NONET);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    $body = $doc->getElementsByTagName('body')->item(0);
    if (!$body) {
        return '';
    }
    pb_clean_children($body);
    $out = '';
    foreach (iterator_to_array($body->childNodes) as $child) {
        $out .= $doc->saveHTML($child);
    }
    return trim($out);
}

function pb_clean_children(DOMNode $node): void
{
    foreach (iterator_to_array($node->childNodes) as $child) {
        if ($child instanceof DOMText) {
            continue;
        }
        if (!$child instanceof DOMElement) {
            $node->removeChild($child);       // comments, processing instructions
            continue;
        }
        $tag = strtolower($child->tagName);
        if (in_array($tag, PB_REMARK_DROP, true)) {
            $node->removeChild($child);
            continue;
        }
        pb_clean_children($child);
        if (!in_array($tag, PB_REMARK_TAGS, true)) {
            while ($child->firstChild) {
                $node->insertBefore($child->firstChild, $child);
            }
            $node->removeChild($child);
            continue;
        }
        $colour = $tag === 'font' ? $child->getAttribute('color') : '';
        if (preg_match('~(?:^|;)\s*color\s*:\s*([^;]+)~i', $child->getAttribute('style'), $m)) {
            $colour = $m[1];
        }
        foreach (iterator_to_array($child->attributes) as $attribute) {
            $child->removeAttribute($attribute->name);
        }
        $colour = pb_clean_colour($colour);
        if ($colour !== '') {
            $child->setAttribute('style', "color: $colour");
        }
    }
}

function pb_clean_colour(string $colour): string
{
    $colour = strtolower(trim($colour));
    if (preg_match('~^#([0-9a-f]{3}|[0-9a-f]{6})$~', $colour)) {
        return $colour;
    }
    if (preg_match('~^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$~', $colour, $m)) {
        return sprintf('#%02x%02x%02x', min(255, (int) $m[1]), min(255, (int) $m[2]), min(255, (int) $m[3]));
    }
    return '';
}

/* ---------- Lines ---------- */

/*
 * The item lines of a payload. 'po' adds the price columns, 'sales' (quotations, sales orders, delivery notes)
 * the same plus a delivery term per line, 'grn' the GRN quantities and costs.
 * A row with no item name and no item picked is blank and dropped; at least one line is required.
 * A picked item, brand or unit fills its code / name from the master, so the text always matches.
 * Purchase request lines must be Item master items; the other documents also take typed item names.
 */
/* Sales line kinds: 'sales' (quotation), 'salesorder' (+ buying side), 'deliverynote' (+ branch). */
function pb_is_sales(string $kind): bool
{
    return in_array($kind, ['sales', 'salesorder', 'deliverynote'], true);
}

function pb_read_lines(Input $in, string $kind): array
{
    $lines = [];
    foreach ($in->rows('items') as $index => $raw) {
        $r = new Input($raw);
        $itemId = $r->id('itemId', 'item', 'items');
        $name = $r->text('itemName', 'Item name', 200);
        if ($itemId === null && $name === '' && trim((string) ($raw['itemCode'] ?? '')) === '') {
            continue;   // blank row
        }
        $line = [
            'itemId' => $itemId, 'itemCode' => $r->text('itemCode', 'Item code', 30), 'itemName' => $name,
            'brandId' => $r->id('brandId', 'brand', 'brands'), 'brandName' => $r->text('brandName', 'Brand', 150),
            'uomId' => $r->id('uomId', 'unit', 'uoms'), 'unit' => $r->text('unit', 'Unit', 80),
            'itemNameHtml' => $r->text('itemNameHtml', 'Formatted item name', 4000),
        ];
        if ($kind === 'grn') {
            $line += [
                'receivedQty' => $r->decimal('receivedQty', 'Received quantity', 14, 3) ?? '0',
                'acceptedQty' => $r->decimal('acceptedQty', 'Accepted quantity', 14, 3) ?? '0',
                'rejectedQty' => $r->decimal('rejectedQty', 'Rejected quantity', 14, 3) ?? '0',
                'rejectReason' => $r->text('rejectReason', 'Rejection reason', 300),
                'expiryDate' => $r->date('expiryDate', 'Expiry date'),
                'rackId' => null,
                'unitCost' => $r->decimal('unitCost', 'Unit cost', 14, 3) ?? '0',
                'vatRate' => $r->decimal('vatRate', 'VAT %', 5, 2, false, '100') ?? '0',
                'discountPct' => $r->decimal('discountPct', 'Disc %', 5, 2, false, '100') ?? '0',
            ];
            if ((float) $line['receivedQty'] <= 0) {
                $r->fail('receivedQty', 'enter the received quantity.');
            } elseif ((float) $line['acceptedQty'] + (float) $line['rejectedQty'] > (float) $line['receivedQty'] + 0.0005) {
                $r->fail('acceptedQty', 'accepted and rejected together cannot be more than received.');
            }
            if ((float) $line['rejectedQty'] <= 0) {
                $line['rejectReason'] = '';            // a reason only while something is rejected
            }
            $line['transfers'] = grn_read_transfers($r, $raw['transfers'] ?? null, (float) $line['acceptedQty']);
        } else {
            $line['quantity'] = $r->decimal('quantity', 'Quantity', 14, 3, true);
            if ($line['quantity'] !== null && (float) $line['quantity'] <= 0) {
                $r->fail('quantity', 'Quantity must be more than 0.');
            }
        }
        $sales = pb_is_sales($kind);
        if ($kind === 'po' || $sales) {
            $line += [
                'price' => $r->decimal('price', 'Price', 14, 3) ?? '0',
                'vatRate' => $r->decimal('vatRate', 'VAT %', 5, 2, false, '100') ?? '0',
                'discountPct' => $r->decimal('discountPct', 'Disc %', 5, 2, false, '100') ?? '0',
                'discountAmount' => $r->decimal('discountAmount', 'Disc. amount', 14, 3),
                'foc' => !empty($raw['foc']) && $raw['foc'] !== 'No' && $raw['foc'] !== 'false',
            ];
        }
        if ($sales) {
            $line['deliveryTerm'] = $r->text('deliveryTerm', 'Delivery term', 200);   // sales documents: printed under the item
        }
        if ($kind === 'deliverynote') {               // a delivery note line's Branch (none: Auto, the most stock)
            $line['warehouseId'] = $r->id('warehouseId', 'branch', 'warehouses');
        }
        if ($kind === 'salesorder') {                 // a sales order's buying side: the cost and (multi-supplier) the line's supplier
            $line['buyingCost'] = $r->decimal('buyingCost', 'Buying cost', 14, 3) ?? '0';
            $line['supplierId'] = $r->id('supplierId', 'supplier', 'suppliers');
            $line['supplierCurrency'] = $line['supplierId'] === null ? ''
                : strtoupper((string) query('SELECT currency FROM suppliers WHERE id = ?', [$line['supplierId']])->fetchColumn());
        }
        if ($itemId !== null) {
            $item = query('SELECT item_code, item_name FROM items WHERE id = ?', [$itemId])->fetch();
            $line['itemCode'] = $item['item_code'];
            $line['itemName'] = $item['item_name'];
        } elseif ($kind === 'pr') {
            // A purchase request lists Item master items only (the screen creates a new item first).
            $r->fail('itemName', 'pick an item from the Item master.');
        } elseif ($line['itemName'] === '') {
            $r->fail('itemName', 'enter the item name or pick an item.');
        }
        if ($line['brandId'] !== null) {
            $line['brandName'] = (string) query('SELECT brand_name FROM brands WHERE id = ?', [$line['brandId']])->fetchColumn();
        }
        if ($line['uomId'] !== null) {
            $line['unit'] = (string) query('SELECT uom_name FROM uoms WHERE id = ?', [$line['uomId']])->fetchColumn();
        }
        // The line's formatting (Full Item Description), kept only while its text is the line's item name.
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

/*
 * Totals of priced lines (see the top of this file). Returns the lines with lineTotal set, and the summary.
 * $kind 'po' uses quantity, price and the line's discount amount; 'grn' uses the accepted quantity,
 * the unit cost and Disc %.
 */
function pb_totals(array $lines, string $kind, string $vatMode, float $discount, float $shipping): array
{
    $nets = [];
    foreach ($lines as $i => $line) {
        if ($kind === 'grn') {
            $gross = (float) $line['acceptedQty'] * (float) $line['unitCost'];
            $nets[$i] = $gross - $gross * (float) $line['discountPct'] / 100;
        } else {
            $gross = $line['foc'] ? 0.0 : (float) $line['quantity'] * (float) $line['price'];
            $lineDiscount = $line['discountAmount'] !== null ? (float) $line['discountAmount'] : $gross * (float) $line['discountPct'] / 100;
            $nets[$i] = max(0.0, $gross - $lineDiscount);
        }
    }
    $subtotal = array_sum($nets);
    $discount = min($discount, $subtotal);
    $vat = 0.0;
    foreach ($lines as $i => &$line) {
        $rate = (float) $line['vatRate'];
        $share = $subtotal > 0 ? $discount * $nets[$i] / $subtotal : 0.0;
        $taxable = $nets[$i] - $share;
        $vat += $vatMode === 'include' ? $taxable * $rate / (100 + $rate) : $taxable * $rate / 100;
        $line['lineTotal'] = pb_money($vatMode === 'include' ? $nets[$i] : $nets[$i] * (1 + $rate / 100));
        if (($kind === 'po' || pb_is_sales($kind)) && $line['discountAmount'] === null) {
            $gross = $line['foc'] ? 0.0 : (float) $line['quantity'] * (float) $line['price'];
            $line['discountAmount'] = pb_money($gross * (float) $line['discountPct'] / 100);
        }
    }
    unset($line);
    $grand = $subtotal - $discount + ($vatMode === 'exclude' ? $vat : 0.0) + $shipping;
    return [$lines, [
        'subtotal' => pb_money($subtotal), 'vatAmount' => pb_money($vat), 'discountAmount' => pb_money($discount),
        'shipping' => pb_money($shipping), 'grandTotal' => pb_money($grand),
    ]];
}

/* Replaces a document's lines inside the caller's transaction. */
/*
 * A document line's formatted item name (the Full Item Description's editing mode; every Purchase Book document): cleaned as the remarks,
 * then only <b>, <strong> and coloured <span>s are kept (no lines or lists). Kept only when its text is the line's
 * item name (spaces and case aside); otherwise, or without any formatting, null.
 */
function pb_item_name_html(string $html, string $name): ?string
{
    $html = trim($html);
    if ($html === '' || !pb_is_html($html)) {
        return null;
    }
    $clean = pb_clean_html($html);
    $clean = (string) preg_replace('~<br\s*/?>~i', ' ', $clean);
    $clean = (string) preg_replace('~</?(?!(?:b|strong|span)\b)[a-z][a-z0-9]*\b[^>]*>~i', '', $clean);
    $clean = trim($clean);
    $text = static fn (string $value) => mb_strtoupper(trim((string) preg_replace('/\s+/u', ' ', $value)));
    $plain = html_entity_decode(strip_tags($clean), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if ($clean === '' || $text($plain) !== $text($name) || !preg_match('~<(b|strong|span)\b~i', $clean)) {
        return null;
    }
    return $clean;
}

function pb_save_lines(string $table, string $owner, int $docId, string $kind, array $lines): void
{
    query("DELETE FROM `$table` WHERE `$owner` = ?", [$docId]);
    foreach ($lines as $order => $l) {
        $columns = ['sort_order' => $order + 1, 'item_id' => $l['itemId'], 'item_code' => $l['itemCode'], 'item_name' => $l['itemName'],
            'brand_id' => $l['brandId'], 'brand_name' => $l['brandName'], 'uom_id' => $l['uomId'], 'unit' => $l['unit'],
            'item_name_html' => $l['itemNameHtml'] ?? null];
        if ($kind === 'grn') {
            $columns += ['received_qty' => $l['receivedQty'], 'accepted_qty' => $l['acceptedQty'], 'rejected_qty' => $l['rejectedQty'],
                'reject_reason' => $l['rejectReason'] ?? '', 'expiry_date' => $l['expiryDate'], 'rack_id' => $l['rackId'],
                'unit_cost' => $l['unitCost'], 'vat_rate' => $l['vatRate'], 'discount_pct' => $l['discountPct'], 'line_total' => $l['lineTotal'],
                'transfers' => ($l['transfers'] ?? []) ? json_encode($l['transfers']) : null];
        } else {
            $columns['quantity'] = $l['quantity'];
        }
        if (pb_is_sales($kind)) {
            $columns['delivery_term'] = $l['deliveryTerm'] ?? '';
        }
        if ($kind === 'deliverynote') {
            $columns['warehouse_id'] = $l['warehouseId'] ?? null;
        }
        if ($kind === 'salesorder') {
            $columns += ['supplier_id' => $l['supplierId'], 'supplier_currency' => $l['supplierCurrency'], 'buying_cost' => $l['buyingCost']];
        }
        if ($kind === 'po' || pb_is_sales($kind)) {
            $columns += ['price' => $l['price'], 'vat_rate' => $l['vatRate'], 'discount_pct' => $l['discountPct'],
                'discount_amount' => $l['discountAmount'], 'foc' => $l['foc'] ? 1 : 0, 'line_total' => $l['lineTotal']];
        }
        $names = implode(', ', array_map(static fn ($c) => "`$c`", array_keys($columns)));
        $marks = implode(', ', array_fill(0, count($columns), '?'));
        query("INSERT INTO `$table` (`$owner`, $names) VALUES (?, $marks)", [$docId, ...array_values($columns)]);
    }
}

function pb_find_lines(string $table, string $owner, int $docId, string $kind): array
{
    // The item's code and name come from the Item master as it is now, so a renamed item shows its new name on
    // every document; a line whose item is gone keeps the name it was saved with.
    $rack = ['grn' => ', rb.location_code AS rack_code', 'salesorder' => ', sp.supplier_name AS line_supplier',
        'deliverynote' => ', wh.warehouse_name AS line_warehouse'][$kind] ?? '';
    $rackJoin = ['grn' => ' LEFT JOIN rack_bins rb ON rb.id = l.rack_id', 'salesorder' => ' LEFT JOIN suppliers sp ON sp.id = l.supplier_id',
        'deliverynote' => ' LEFT JOIN warehouses wh ON wh.id = l.warehouse_id'][$kind] ?? '';
    $sql = "SELECT l.*, it.item_code AS master_code, it.item_name AS master_name$rack FROM `$table` l"
        . " LEFT JOIN items it ON it.id = l.item_id$rackJoin WHERE l.`$owner` = ? ORDER BY l.sort_order, l.id";
    return array_map(static function (array $l) use ($kind): array {
        $name = (string) ($l['master_name'] ?? $l['item_name']);
        $line = [
            'itemId' => $l['item_id'] === null ? null : (int) $l['item_id'], 'itemCode' => $l['master_code'] ?? $l['item_code'], 'itemName' => $name,
            // The line's formatting only while its text is still the item's name (a renamed item drops it).
            'itemNameHtml' => pb_item_name_html((string) ($l['item_name_html'] ?? ''), $name) ?? '',
            'brandId' => $l['brand_id'] === null ? null : (int) $l['brand_id'], 'brandName' => $l['brand_name'],
            'uomId' => $l['uom_id'] === null ? null : (int) $l['uom_id'], 'unit' => $l['unit'],
        ];
        if ($kind === 'grn') {
            return $line + ['receivedQty' => $l['received_qty'], 'acceptedQty' => $l['accepted_qty'], 'rejectedQty' => $l['rejected_qty'],
                'rejectReason' => (string) ($l['reject_reason'] ?? ''), 'transfers' => grn_find_transfers($l['transfers'] ?? null),
                'expiryDate' => $l['expiry_date'] ?? '', 'rackId' => $l['rack_id'] === null ? null : (int) $l['rack_id'], 'rackCode' => $l['rack_code'] ?? '',
                'unitCost' => $l['unit_cost'], 'vatRate' => $l['vat_rate'], 'discountPct' => $l['discount_pct'], 'lineTotal' => $l['line_total']];
        }
        $line['quantity'] = $l['quantity'];
        if (pb_is_sales($kind)) {
            $line['deliveryTerm'] = (string) ($l['delivery_term'] ?? '');
        }
        if ($kind === 'deliverynote') {
            $line += ['warehouseId' => $l['warehouse_id'] === null ? null : (int) $l['warehouse_id'], 'warehouseName' => $l['line_warehouse'] ?? ''];
        }
        if ($kind === 'salesorder') {
            $line += ['buyingCost' => $l['buying_cost'], 'supplierId' => $l['supplier_id'] === null ? null : (int) $l['supplier_id'],
                'supplierName' => $l['line_supplier'] ?? '', 'supplierCurrency' => $l['supplier_currency']];
        }
        if ($kind === 'po' || pb_is_sales($kind)) {
            $line += ['price' => $l['price'], 'vatRate' => $l['vat_rate'], 'discountPct' => $l['discount_pct'],
                'discountAmount' => $l['discount_amount'], 'foc' => (bool) $l['foc'], 'lineTotal' => $l['line_total']];
        }
        return $line;
    }, query($sql, [$docId])->fetchAll());
}

/* What a found document sends back as a save payload (for a PUT that changes only some keys). */
function pb_as_input(array $doc, array $keys): array
{
    return array_intersect_key($doc, array_flip([...$keys, 'items', 'remarks', 'includeSignatory', 'signatories', 'attachSeal']));
}

function pb_common(array $row): array
{
    return ['id' => (int) $row['id'], 'remarks' => (string) ($row['remarks'] ?? ''), 'includeSignatory' => (bool) $row['include_signatory'],
        'signatories' => pb_signatory_list($row['extra_signatories'] ?? null),
        'attachSeal' => (bool) $row['attach_seal'], 'createdAt' => date_only($row['created_at'])];
}

/* How many lines a document has and its quantity totals, for the list pages: [itemCount, totalQty(, acceptedQty)]. */
function pb_line_totals(string $table, string $owner, int $docId, string $kind = 'qty'): array
{
    $sums = $kind === 'grn' ? 'COALESCE(SUM(received_qty), 0), COALESCE(SUM(accepted_qty), 0)' : 'COALESCE(SUM(quantity), 0)';
    $row = query("SELECT COUNT(*), $sums FROM `$table` WHERE `$owner` = ?", [$docId])->fetch(PDO::FETCH_NUM);
    return [(int) $row[0], pb_qty((string) $row[1]), ...($kind === 'grn' ? [pb_qty((string) $row[2])] : [])];
}

/* The document's whole discount (its lines' and the header's) as a % of its gross value (quantity × price before any
   discount), for the list Filter's Disc %. $gross is the SQL for one line's gross value; $row is the header row. */
function pb_discount_pct(string $table, string $owner, int $docId, string $gross, array $row): string
{
    $grossValue = (float) query("SELECT COALESCE(SUM($gross), 0) FROM `$table` WHERE `$owner` = ?", [$docId])->fetchColumn();
    if ($grossValue <= 0) {
        return '0';
    }
    $discount = max(0.0, $grossValue - (float) $row['subtotal'] + (float) $row['discount_amount']);
    return pb_qty(number_format(min(100.0, $discount / $grossValue * 100), 2, '.', ''));
}

/* Whether the document charges VAT: a line with a VAT % above 0, as the form's VAT Enabled / VAT Disabled switch shows
   (the switch sets every line's VAT % to 5 or to 0). The list Filter's VAT In / VAT Out. */
function pb_vat_enabled(string $table, string $owner, int $docId): bool
{
    return (bool) query("SELECT EXISTS (SELECT 1 FROM `$table` WHERE `$owner` = ? AND vat_rate > 0)", [$docId])->fetchColumn();
}

/* A quantity without trailing zeros: "12.500" → "12.5", "40.000" → "40". */
function pb_qty(string $value): string
{
    return str_contains($value, '.') ? rtrim(rtrim($value, '0'), '.') : $value;
}

/* Every employee for the Purchase Book lists' Filter (Employee): code, name, status and the login's username, which
   a Purchase Request's Requested By holds. Only these, so any signed-in user may read them (the employee records
   themselves are for managers). */
function pb_people(): array
{
    $rows = query(
        "SELECT e.emp_code, TRIM(CONCAT(e.first_name, ' ', e.last_name)) AS name, e.status, u.username
         FROM employees e LEFT JOIN users u ON u.employee_id = e.id
         ORDER BY e.status = 'Resigned', e.first_name, e.last_name, e.id"
    )->fetchAll();
    return array_map(static fn (array $r): array => ['code' => $r['emp_code'], 'name' => $r['name'], 'status' => (string) $r['status'],
        'username' => (string) ($r['username'] ?? '')], $rows);
}

/* ---------- Purchase requests ---------- */

function pr_format(array $row): array
{
    [$count, $qty] = pb_line_totals('purchase_request_items', 'purchase_request_id', (int) $row['id']);
    // The Stock Point: a warehouse (its name also kept in delivery_location); older requests have typed text only.
    $warehouseId = isset($row['warehouse_id']) ? (int) $row['warehouse_id'] : null;
    $warehouse = $warehouseId === null ? null : query('SELECT warehouse_code, warehouse_name FROM warehouses WHERE id = ?', [$warehouseId])->fetch();
    return pb_common($row) + [
        'warehouseId' => $warehouse ? $warehouseId : null, 'warehouseCode' => $warehouse ? $warehouse['warehouse_code'] : '',
        'code' => $row['pr_code'], 'name' => $row['purchase_type'] . ' · ' . "$count item" . ($count === 1 ? '' : 's'), 'referenceNo' => $row['reference_no'],
        'purchaseType' => $row['purchase_type'], 'requestedDate' => $row['requested_date'], 'requiredDate' => $row['required_date'] ?? '',
        'requestedBy' => $row['requested_by'], 'deliveryLocation' => $warehouse ? $warehouse['warehouse_name'] : (string) ($row['delivery_location'] ?? ''),
        'itemCount' => $count, 'totalQty' => $qty,
    ];
}

function purchase_requests_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM purchase_requests';
    $params = [];
    if ($search !== '') {
        $sql .= ' WHERE pr_code LIKE ? OR reference_no LIKE ?';
        $params = [like($search), like($search)];
    }
    return array_map('pr_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function purchase_request_find(int $id): array
{
    $row = query('SELECT * FROM purchase_requests WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Purchase request not found.');
    }
    return pr_format($row) + ['items' => pb_find_lines('purchase_request_items', 'purchase_request_id', $id, 'pr')];
}

function purchase_request_next_code(): string
{
    return pb_next_code('purchase_requests', 'pr_code', 'PR', 6);
}

function purchase_request_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(pb_as_input(purchase_request_find($id),
            ['referenceNo', 'purchaseType', 'requestedDate', 'requiredDate', 'requestedBy', 'warehouseId', 'deliveryLocation']), $data);
    }
    $in = new Input($data);
    $v = [
        'reference_no' => $in->text('referenceNo', 'Reference ID', 60),
        'purchase_type' => $in->choice('purchaseType', 'Purchase type', PB_PURCHASE_TYPES, 'Against Order'),
        'requested_date' => $in->date('requestedDate', 'Requested date') ?? date('Y-m-d'),
        'required_date' => $in->date('requiredDate', 'Required delivery date'),
        // Left blank (an import, the API): the signed-in user's name.
        'requested_by' => $in->text('requestedBy', 'Requested by', 100)
            ?: (string) ($_SESSION['user']['fullName'] ?? '') ?: (string) ($_SESSION['user']['username'] ?? 'admin'),
        // Stock Point: a warehouse picked in the popup; its name is kept too. Without one (an import), typed text.
        'warehouse_id' => $in->id('warehouseId', 'stock point', 'warehouses'),
        'delivery_location' => $in->text('deliveryLocation', 'Stock point', 200),
        'remarks' => pb_clean_html($in->text('remarks', 'Remarks', 20000)),   // formatted, as the PO's
        'include_signatory' => pb_flag($data, 'includeSignatory'), 'attach_seal' => pb_flag($data, 'attachSeal'),
        'extra_signatories' => pb_signatories($in, $data),
    ];
    if ($v['required_date'] !== null && $v['required_date'] < $v['requested_date']) {
        $in->fail('requiredDate', 'The required delivery date cannot be before the requested date.');
    }
    if ($v['warehouse_id'] !== null) {
        $v['delivery_location'] = (string) query('SELECT warehouse_name FROM warehouses WHERE id = ?', [$v['warehouse_id']])->fetchColumn();
    }
    $lines = pb_read_lines($in, 'pr');
    $in->done();
    $id = transaction(static function () use ($id, $v, $lines): int {
        $id = pb_write_header('purchase_requests', 'pr_code', $id, $v, 'purchase_request_next_code');
        pb_save_lines('purchase_request_items', 'purchase_request_id', $id, 'pr', $lines);
        return $id;
    });
    return purchase_request_find($id);
}

function purchase_request_delete(int $id): void
{
    delete_row('purchase_requests', $id, 'Purchase request not found.');
}

/* Inserts (with the next code) or updates a header row; returns its id. */
function pb_write_header(string $table, string $codeColumn, ?int $id, array $values, callable $nextCode): int
{
    if ($id === null) {
        $values = [$codeColumn => $nextCode()] + $values;
        $names = implode(', ', array_map(static fn ($c) => "`$c`", array_keys($values)));
        query("INSERT INTO `$table` ($names) VALUES (" . implode(', ', array_fill(0, count($values), '?')) . ')', array_values($values));
        return (int) db()->lastInsertId();
    }
    $sets = implode(', ', array_map(static fn ($c) => "`$c` = ?", array_keys($values)));
    query("UPDATE `$table` SET $sets WHERE id = ?", [...array_values($values), $id]);
    return $id;
}

/* ---------- Quotation requests ---------- */

function rfq_format(array $row): array
{
    $lines = pb_line_totals('quotation_request_items', 'quotation_request_id', (int) $row['id']);
    $suppliers = query(
        'SELECT s.id, s.supplier_code, s.supplier_name FROM quotation_request_suppliers qs JOIN suppliers s ON s.id = qs.supplier_id
         WHERE qs.quotation_request_id = ? ORDER BY qs.sort_order, qs.id',
        [$row['id']]
    )->fetchAll();
    $prRow = $row['purchase_request_id'] === null ? null
        : query('SELECT pr_code, requested_by FROM purchase_requests WHERE id = ?', [$row['purchase_request_id']])->fetch();
    $pr = $prRow ? (string) $prRow['pr_code'] : '';
    $names = array_column($suppliers, 'supplier_name');
    return pb_common($row) + [
        'code' => $row['rfq_code'], 'itemCount' => $lines[0], 'totalQty' => $lines[1], 'name' => $names ? implode(', ', $names) : 'No suppliers',
        'purchaseRequestId' => $row['purchase_request_id'] === null ? null : (int) $row['purchase_request_id'], 'purchaseRequestCode' => $pr,
        'requestDate' => $row['request_date'], 'submissionDeadline' => $row['submission_deadline'] ?? '',
        'createdBy' => (string) ($row['created_by'] ?? ''),
        // Who asked for it, as on the Purchase Request it came from (the Filter's Employee); without one, its creator.
        'requestedBy' => $prRow && (string) $prRow['requested_by'] !== '' ? (string) $prRow['requested_by'] : (string) ($row['created_by'] ?? ''),
        'suppliers' => array_map(static fn ($s) => ['id' => (int) $s['id'], 'code' => $s['supplier_code'], 'name' => $s['supplier_name']], $suppliers),
    ];
}

function quotation_requests_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM quotation_requests';
    $params = [];
    if ($search !== '') {
        $sql .= ' WHERE rfq_code LIKE ?';
        $params = [like($search)];
    }
    return array_map('rfq_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function quotation_request_find(int $id): array
{
    $row = query('SELECT * FROM quotation_requests WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Quotation request not found.');
    }
    return rfq_format($row) + ['items' => pb_find_lines('quotation_request_items', 'quotation_request_id', $id, 'rfq')];
}

function quotation_request_next_code(): string
{
    return pb_next_code('quotation_requests', 'rfq_code', 'RFQ', 6);
}

function quotation_request_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $doc = quotation_request_find($id);
        $data = array_replace(pb_as_input($doc, ['purchaseRequestId', 'requestDate', 'submissionDeadline'])
            + ['supplierIds' => array_column($doc['suppliers'], 'id')], $data);
    }
    $in = new Input($data);
    $v = [
        'purchase_request_id' => $in->id('purchaseRequestId', 'purchase request', 'purchase_requests'),
        'request_date' => $in->date('requestDate', 'Quotation request date') ?? date('Y-m-d'),
        'submission_deadline' => $in->date('submissionDeadline', 'Submission deadline'),
        'remarks' => $in->text('remarks', 'Remarks', 2000),
        'include_signatory' => pb_flag($data, 'includeSignatory'), 'attach_seal' => pb_flag($data, 'attachSeal'),
        'extra_signatories' => pb_signatories($in, $data),
    ];
    if ($v['submission_deadline'] !== null && $v['submission_deadline'] < $v['request_date']) {
        $in->fail('submissionDeadline', 'The submission deadline cannot be before the request date.');
    }
    if ($id === null) {
        $v['created_by'] = (string) ($_SESSION['user']['username'] ?? '');   // who made it; an edit keeps it
    }
    $supplierIds = $in->ids('supplierIds', 'supplier', 'suppliers');
    if (!$supplierIds) {
        $in->fail('supplierIds', 'Select at least one supplier.');
    }
    $lines = pb_read_lines($in, 'rfq');
    $in->done();
    $id = transaction(static function () use ($id, $v, $lines, $supplierIds): int {
        $id = pb_write_header('quotation_requests', 'rfq_code', $id, $v, 'quotation_request_next_code');
        query('DELETE FROM quotation_request_suppliers WHERE quotation_request_id = ?', [$id]);
        foreach ($supplierIds as $order => $supplierId) {
            query('INSERT INTO quotation_request_suppliers (quotation_request_id, supplier_id, sort_order) VALUES (?, ?, ?)', [$id, $supplierId, $order + 1]);
        }
        pb_save_lines('quotation_request_items', 'quotation_request_id', $id, 'rfq', $lines);
        return $id;
    });
    return quotation_request_find($id);
}

function quotation_request_delete(int $id): void
{
    delete_row('quotation_requests', $id, 'Quotation request not found.');
}

/* ---------- Purchase orders ---------- */

function po_format(array $row): array
{
    $lines = pb_line_totals('purchase_order_items', 'purchase_order_id', (int) $row['id']);
    $supplier = $row['supplier_id'] === null ? null : query('SELECT supplier_code, supplier_name FROM suppliers WHERE id = ?', [$row['supplier_id']])->fetch();
    $pr = $row['purchase_request_id'] === null ? '' : (string) query('SELECT pr_code FROM purchase_requests WHERE id = ?', [$row['purchase_request_id']])->fetchColumn();
    $rfq = $row['quotation_request_id'] === null ? '' : (string) query('SELECT rfq_code FROM quotation_requests WHERE id = ?', [$row['quotation_request_id']])->fetchColumn();
    return pb_common($row) + [
        'code' => $row['po_code'], 'itemCount' => $lines[0], 'totalQty' => $lines[1], 'name' => $supplier ? $supplier['supplier_name'] : 'No supplier', 'poDate' => $row['po_date'],
        'purchaseRequestId' => $row['purchase_request_id'] === null ? null : (int) $row['purchase_request_id'], 'purchaseRequestCode' => $pr,
        'quotationRequestId' => $row['quotation_request_id'] === null ? null : (int) $row['quotation_request_id'], 'quotationRequestCode' => $rfq,
        'quotationNumber' => $row['quotation_number'], 'status' => $row['status'], 'deliveryDate' => $row['delivery_date'] ?? '',
        'deliveryLocation' => $row['delivery_location'], 'deliveryTerms' => $row['delivery_terms'], 'paymentMode' => $row['payment_mode'],
        'creditPeriod' => $row['credit_period'] ?? '',
        'supplierId' => $row['supplier_id'] === null ? null : (int) $row['supplier_id'], 'supplierCode' => $supplier ? $supplier['supplier_code'] : '',
        'supplierName' => $supplier ? $supplier['supplier_name'] : '', 'contactName' => $row['contact_name'], 'email' => $row['email'],
        'contactNumber' => $row['contact_number'], 'salesman' => $row['salesman'], 'salesmanContact' => $row['salesman_contact'],
        'certifications' => $row['certifications'] === '' ? [] : explode(', ', $row['certifications']),
        'currency' => $row['currency'], 'vatMode' => $row['vat_mode'], 'subtotal' => $row['subtotal'], 'vatAmount' => $row['vat_amount'],
        'discountAmount' => $row['discount_amount'], 'shipping' => $row['shipping'], 'grandTotal' => $row['grand_total'],
        'discountPct' => pb_discount_pct('purchase_order_items', 'purchase_order_id', (int) $row['id'], 'CASE WHEN foc = 1 THEN 0 ELSE quantity * price END', $row),
        'vatEnabled' => pb_vat_enabled('purchase_order_items', 'purchase_order_id', (int) $row['id']),
    ];
}

function purchase_orders_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM purchase_orders';
    $params = [];
    if ($search !== '') {
        $sql .= ' WHERE po_code LIKE ? OR quotation_number LIKE ?';
        $params = [like($search), like($search)];
    }
    return array_map('po_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function purchase_order_find(int $id): array
{
    $row = query('SELECT * FROM purchase_orders WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Purchase order not found.');
    }
    return po_format($row) + ['items' => pb_find_lines('purchase_order_items', 'purchase_order_id', $id, 'po')];
}

function purchase_order_next_code(): string
{
    return pb_next_code('purchase_orders', 'po_code', 'PO-', 4);
}

function purchase_order_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(pb_as_input(purchase_order_find($id), ['poDate', 'purchaseRequestId', 'quotationRequestId', 'quotationNumber',
            'status', 'deliveryDate', 'deliveryLocation', 'deliveryTerms', 'paymentMode', 'creditPeriod', 'salesman', 'salesmanContact',
            'certifications', 'supplierId', 'contactName', 'contactNumber', 'email', 'currency', 'vatMode', 'discountAmount', 'shipping']), $data);
    }
    $in = new Input($data);
    $supplierId = $in->id('supplierId', 'supplier', 'suppliers');
    $vatMode = $in->choice('vatMode', 'VAT mode', PB_VAT_MODES, 'include');
    $v = [
        'po_date' => $in->date('poDate', 'PO date') ?? date('Y-m-d'),
        'purchase_request_id' => $in->id('purchaseRequestId', 'purchase request', 'purchase_requests'),
        'quotation_request_id' => $in->id('quotationRequestId', 'quotation request', 'quotation_requests'),
        'quotation_number' => $in->text('quotationNumber', 'Quotation number', 60),
        'status' => $in->choice('status', 'Status', PB_PO_STATUSES, 'Draft'),
        'delivery_date' => $in->date('deliveryDate', 'Delivery date'),
        'delivery_location' => $in->text('deliveryLocation', 'Delivery location', 200),
        'delivery_terms' => $in->text('deliveryTerms', 'Delivery terms', 200),
        'payment_mode' => $in->text('paymentMode', 'Payment mode', 40),
        'credit_period' => $in->text('creditPeriod', 'Credit period', 40),
        'salesman' => $in->text('salesman', 'Salesman / created by', 100),
        'salesman_contact' => $in->text('salesmanContact', 'Salesman contact', 40),
        'certifications' => po_certifications($in, $data['certifications'] ?? []),
        'supplier_id' => $supplierId,
        'contact_name' => $in->text('contactName', 'Contact person', 100),
        'contact_number' => $in->text('contactNumber', 'Contact person number', 40),
        'email' => $in->email('email', 'Email ID'),
        'currency' => po_currency($in, $supplierId),
        'vat_mode' => $vatMode,
        'remarks' => pb_clean_html($in->text('remarks', 'Remarks', 20000)),
        'include_signatory' => pb_flag($data, 'includeSignatory'), 'attach_seal' => pb_flag($data, 'attachSeal'),
        'extra_signatories' => pb_signatories($in, $data),
    ];
    if ($supplierId === null) {
        $in->fail('supplierId', 'Select the supplier.');
    }
    // Credit Period goes with the Credit payment mode only (the page requires it there); any other mode drops it.
    if ($v['payment_mode'] !== 'Credit') {
        $v['credit_period'] = '';
    }
    if ($v['payment_mode'] !== '' && !in_array($v['payment_mode'], PB_PAYMENT_MODES, true)) {
        $in->fail('paymentMode', 'Payment mode must be one of: ' . implode(', ', PB_PAYMENT_MODES) . '.');
    }
    foreach (['salesman_contact' => 'salesmanContact', 'contact_number' => 'contactNumber'] as $column => $key) {
        if ($v[$column] !== '' && !preg_match('~^[0-9+\-\s()]{3,40}$~', $v[$column])) {
            $in->fail($key, 'Enter a phone number (digits, spaces, + - ( ) only).');
        }
    }
    if ($v['delivery_date'] !== null && $v['delivery_date'] < $v['po_date']) {
        $in->fail('deliveryDate', 'The delivery date cannot be before the PO date.');
    }
    $discount = (float) ($in->decimal('discountAmount', 'Discount amount', 14, 3) ?? '0');
    $shipping = (float) ($in->decimal('shipping', 'Shipping price', 14, 3) ?? '0');
    $lines = pb_read_lines($in, 'po');
    $in->done();
    [$lines, $totals] = pb_totals($lines, 'po', $vatMode, $discount, $shipping);
    $v += ['subtotal' => $totals['subtotal'], 'vat_amount' => $totals['vatAmount'], 'discount_amount' => $totals['discountAmount'],
        'shipping' => $totals['shipping'], 'grand_total' => $totals['grandTotal']];
    $id = transaction(static function () use ($id, $v, $lines): int {
        $id = pb_write_header('purchase_orders', 'po_code', $id, $v, 'purchase_order_next_code');
        pb_save_lines('purchase_order_items', 'purchase_order_id', $id, 'po', $lines);
        return $id;
    });
    return purchase_order_find($id);
}

/* Certification Required: a list (or comma text) of PB_CERTIFICATIONS, stored as "A, B". N/A goes with nothing else. */
function po_certifications(Input $in, mixed $raw): string
{
    $picked = is_array($raw) ? $raw : (is_string($raw) ? explode(',', $raw) : []);
    $picked = array_values(array_unique(array_filter(array_map(static fn ($v) => trim((string) $v), $picked), 'strlen')));
    if (array_diff($picked, PB_CERTIFICATIONS)) {
        $in->fail('certifications', 'Certification must be one of: ' . implode(', ', PB_CERTIFICATIONS) . '.');
        return '';
    }
    if (count($picked) > 1) {
        $picked = array_values(array_diff($picked, ['N/A']));
    }
    usort($picked, static fn ($a, $b) => array_search($a, PB_CERTIFICATIONS, true) <=> array_search($b, PB_CERTIFICATIONS, true));
    return implode(', ', $picked);
}

/* The order's currency: the one picked on the form, else the supplier's, else the company's base currency. */
function po_currency(Input $in, ?int $supplierId): string
{
    $currency = strtoupper($in->text('currency', 'Currency', 10));
    if ($currency !== '' && !in_array($currency, PB_CURRENCIES, true)) {
        $in->fail('currency', 'Currency must be one of: ' . implode(', ', PB_CURRENCIES) . '.');
    }
    if ($currency === '' && $supplierId !== null) {
        $currency = (string) query('SELECT currency FROM suppliers WHERE id = ?', [$supplierId])->fetchColumn();
    }
    return $currency !== '' ? $currency : company_base_currency();
}

function purchase_order_delete(int $id): void
{
    delete_row('purchase_orders', $id, 'Purchase order not found.');
}

/* ---------- Goods receipt notes ---------- */

function grn_format(array $row): array
{
    $lines = pb_line_totals('grn_items', 'grn_id', (int) $row['id'], 'grn');
    $supplier = $row['supplier_id'] === null ? null : query('SELECT supplier_code, supplier_name FROM suppliers WHERE id = ?', [$row['supplier_id']])->fetch();
    $warehouse = $row['warehouse_id'] === null ? null : query('SELECT warehouse_code, warehouse_name FROM warehouses WHERE id = ?', [$row['warehouse_id']])->fetch();
    return pb_common($row) + [
        'code' => $row['grn_code'], 'itemCount' => $lines[0], 'totalQty' => $lines[1], 'acceptedQty' => $lines[2], 'name' => $supplier ? $supplier['supplier_name'] : 'No supplier', 'grnDate' => $row['grn_date'],
        'supplierId' => $row['supplier_id'] === null ? null : (int) $row['supplier_id'], 'supplierName' => $supplier ? $supplier['supplier_name'] : '',
        'supplierCode' => $supplier ? $supplier['supplier_code'] : '',
        'warehouseId' => $row['warehouse_id'] === null ? null : (int) $row['warehouse_id'], 'warehouseName' => $warehouse ? $warehouse['warehouse_name'] : '', 'warehouseCode' => $warehouse ? $warehouse['warehouse_code'] : '',
        'purchaseOrderId' => $row['purchase_order_id'] === null ? null : (int) $row['purchase_order_id'], 'poNumber' => $row['po_number'],
        'vatMode' => $row['vat_mode'], 'subtotal' => $row['subtotal'], 'vatAmount' => $row['vat_amount'],
        'discountAmount' => $row['discount_amount'], 'shipping' => $row['shipping'], 'grandTotal' => $row['grand_total'],
        'discountPct' => pb_discount_pct('grn_items', 'grn_id', (int) $row['id'], 'accepted_qty * unit_cost', $row),
        'vatEnabled' => pb_vat_enabled('grn_items', 'grn_id', (int) $row['id']),
    ];
}

function grns_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM grns';
    $params = [];
    if ($search !== '') {
        $sql .= ' WHERE grn_code LIKE ? OR po_number LIKE ?';
        $params = [like($search), like($search)];
    }
    return array_map('grn_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function grn_find(int $id): array
{
    $row = query('SELECT * FROM grns WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('GRN not found.');
    }
    return grn_format($row) + ['items' => pb_find_lines('grn_items', 'grn_id', $id, 'grn')];
}

function grn_next_code(): string
{
    return pb_next_code('grns', 'grn_code', 'GRN', 6);
}

/*
 * A GRN line's stock transfers: [{ warehouseId, quantity }], each to a different stock point, more than 0 each and
 * at most the accepted quantity in all. Blank rows are dropped. Sent as a list or as its JSON text.
 */
function grn_read_transfers(Input $r, mixed $raw, float $accepted): array
{
    if (is_string($raw)) {
        $raw = trim($raw) === '' ? [] : json_decode($raw, true);
    }
    if ($raw === null) {
        return [];
    }
    if (!is_array($raw)) {
        $r->fail('transfers', 'the stock transfers are not valid.');
        return [];
    }
    $transfers = [];
    $total = 0.0;
    foreach (array_values($raw) as $row) {
        if (!is_array($row)) {
            continue;
        }
        $t = new Input($row);
        $warehouseId = $t->id('warehouseId', 'stock point', 'warehouses');
        $quantity = $t->decimal('quantity', 'Transfer quantity', 14, 3);
        if ($warehouseId === null && $quantity === null) {
            continue;                                  // blank row
        }
        try {
            $t->done();
        } catch (ValidationError $e) {
            $r->fail('transfers', 'stock transfer: ' . (array_values($e->fields)[0] ?? 'is not valid.'));
            continue;
        }
        if ($warehouseId === null) {
            $r->fail('transfers', 'select the stock point for every stock transfer.');
        } elseif ($quantity === null || (float) $quantity <= 0) {
            $r->fail('transfers', 'a stock transfer quantity must be more than 0.');
        } elseif (isset($transfers[$warehouseId])) {
            $r->fail('transfers', 'a stock point is chosen twice in the stock transfers; put its quantity on one row.');
        } else {
            $transfers[$warehouseId] = ['warehouseId' => $warehouseId, 'quantity' => $quantity];
            $total += (float) $quantity;
        }
    }
    if ($total > $accepted + 0.0005) {
        $r->fail('transfers', 'the stock transferred (' . pb_qty((string) $total) . ') is more than the accepted quantity (' . pb_qty((string) $accepted) . ').');
    }
    return array_values($transfers);
}

/* A saved line's stock transfers with each stock point's code and name. */
function grn_find_transfers(?string $json): array
{
    $rows = $json ? json_decode($json, true) : [];
    if (!is_array($rows) || !$rows) {
        return [];
    }
    $out = [];
    foreach ($rows as $row) {
        $id = (int) ($row['warehouseId'] ?? 0);
        $w = $id ? query('SELECT warehouse_code, warehouse_name FROM warehouses WHERE id = ?', [$id])->fetch() : false;
        $out[] = ['warehouseId' => $id, 'warehouseCode' => $w ? $w['warehouse_code'] : '', 'warehouseName' => $w ? $w['warehouse_name'] : '',
            'quantity' => (string) ($row['quantity'] ?? '0')];
    }
    return $out;
}

function grn_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(pb_as_input(grn_find($id), ['grnDate', 'supplierId', 'warehouseId', 'purchaseOrderId', 'poNumber', 'vatMode',
            'discountAmount', 'shipping']), $data);
    }
    $in = new Input($data);
    $vatMode = $in->choice('vatMode', 'VAT mode', PB_VAT_MODES, 'include');
    $v = [
        'grn_date' => $in->date('grnDate', 'GRN date') ?? date('Y-m-d'),
        'supplier_id' => $in->id('supplierId', 'supplier', 'suppliers'),
        'warehouse_id' => $in->id('warehouseId', 'stock point', 'warehouses'),
        'purchase_order_id' => $in->id('purchaseOrderId', 'purchase order', 'purchase_orders'),
        'po_number' => $in->text('poNumber', 'PO number', 60),
        'vat_mode' => $vatMode,
        'remarks' => pb_clean_html($in->text('remarks', 'Remarks', 20000)),   // formatted, as the PO's
        'include_signatory' => pb_flag($data, 'includeSignatory'), 'attach_seal' => pb_flag($data, 'attachSeal'),
        'extra_signatories' => pb_signatories($in, $data),
    ];
    if ($v['supplier_id'] === null) {
        $in->fail('supplierId', 'Select the supplier.');
    }
    if ($v['warehouse_id'] === null) {
        $in->fail('warehouseId', 'Select the stock point the goods are received into.');
    }
    $discount = (float) ($in->decimal('discountAmount', 'Discount amount', 14, 3) ?? '0');
    $shipping = (float) ($in->decimal('shipping', 'Shipping price', 14, 3) ?? '0');
    $lines = pb_read_lines($in, 'grn');
    foreach ($lines as $index => $line) {
        foreach ($line['transfers'] as $transfer) {
            if ($v['warehouse_id'] !== null && $transfer['warehouseId'] === $v['warehouse_id']) {
                $in->fail('items', 'Item row ' . ($index + 1) . ': a stock transfer cannot go to the stock point the goods are received into.');
            }
        }
    }
    $in->done();
    [$lines, $totals] = pb_totals($lines, 'grn', $vatMode, $discount, $shipping);
    $v += ['subtotal' => $totals['subtotal'], 'vat_amount' => $totals['vatAmount'], 'discount_amount' => $totals['discountAmount'],
        'shipping' => $totals['shipping'], 'grand_total' => $totals['grandTotal']];
    $id = transaction(static function () use ($id, $v, $lines): int {
        $id = pb_write_header('grns', 'grn_code', $id, $v, 'grn_next_code');
        pb_save_lines('grn_items', 'grn_id', $id, 'grn', $lines);
        return $id;
    });
    return grn_find($id);
}

function grn_delete(int $id): void
{
    delete_row('grns', $id, 'GRN not found.');
}
