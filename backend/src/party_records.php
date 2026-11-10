<?php
declare(strict_types=1);

require_once __DIR__ . '/party_documents.php';

/*
 * The rows a party (supplier or customer) carries besides its own columns: contacts, quotation lines,
 * previous purchase / sales orders and the details of its uploaded documents. Suppliers and customers
 * have the same tables (supplier_* / customer_*), so one module serves both; $kind picks the tables.
 */

const PARTY_TABLES = [
    'supplier' => ['owner' => 'supplier_id', 'contacts' => 'supplier_contacts', 'quotations' => 'supplier_quotation_items', 'orders' => 'supplier_orders'],
    'customer' => ['owner' => 'customer_id', 'contacts' => 'customer_contacts', 'quotations' => 'customer_quotation_items', 'orders' => 'customer_orders'],
];
const PARTY_ORDER_STATUSES = ['Pending', 'Fulfilled'];
const PARTY_CURRENCIES = ['OMR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'USD', 'EUR', 'INR', 'GBP', 'PKR', 'EGP', 'JOD', 'TRY', 'CNY', 'JPY', 'KRW'];
const PARTY_STATUSES = ['active', 'inactive'];

/* Reads each row of $key with $read(Input $row) → clean array, or null for a blank row. Errors name the row. */
function party_read_rows(Input $in, string $key, string $label, callable $read): array
{
    $clean = [];
    foreach ($in->rows($key) as $index => $line) {
        $row = new Input($line);
        $value = $read($row);
        try {
            $row->done();
        } catch (ValidationError $e) {
            $in->fail($key, "$label row " . ($index + 1) . ': ' . $e->getMessage());
            continue;
        }
        if ($value !== null) {
            $clean[] = $value;
        }
    }
    return $clean;
}

/* contacts, quotations, orders and documents from a save payload; blank rows are dropped. */
function party_rows_input(Input $in): array
{
    $allBlank = static fn (array $values) => implode('', array_map(static fn ($v) => (string) $v, $values)) === '';
    return [
        'contacts' => party_read_rows($in, 'contacts', 'Contact', static function (Input $r) use ($allBlank) {
            $v = ['name' => $r->text('name', 'Name', 100), 'designation' => $r->text('designation', 'Designation', 100),
                  'number' => $r->phone('number', 'Mobile number'), 'email' => $r->email('email', 'Email', 150)];
            return $allBlank($v) ? null : $v;
        }),
        'quotations' => party_read_rows($in, 'quotations', 'Quotation', static function (Input $r) use ($allBlank) {
            $v = ['itemName' => $r->text('itemName', 'Item name', 200), 'description' => $r->text('description', 'Description', 255),
                  'unit' => $r->text('unit', 'Unit', 40), 'rate' => $r->decimal('rate', 'Rate', 15, 3),
                  'deliveryTime' => $r->text('deliveryTime', 'Delivery time', 60), 'warranty' => $r->text('warranty', 'Warranty', 60)];
            return $allBlank($v) ? null : $v;
        }),
        'orders' => party_read_rows($in, 'orders', 'Order', static function (Input $r) use ($allBlank) {
            $v = ['number' => $r->text('number', 'Order number', 40), 'value' => $r->decimal('value', 'Total value', 15, 3),
                  'items' => $r->whole('items', 'Total items')];
            if ($allBlank($v)) {
                return null;   // a row with only its default date and status is blank
            }
            return $v + ['date' => $r->date('date', 'Order date'), 'status' => $r->choice('status', 'Status', PARTY_ORDER_STATUSES, 'Pending')];
        }),
        // Stored documents kept on the form: [{ id, type, expiry }]. Only used on an update.
        'documents' => party_read_rows($in, 'documents', 'Document', static fn (Input $r) => [
            'id' => $r->whole('id', 'Document', true), 'type' => $r->text('type', 'Document type', 60), 'expiry' => $r->date('expiry', 'Expiry date'),
        ]),
    ];
}

/*
 * Writes the rows of one party inside the caller's transaction. Contacts, quotations and orders are
 * replaced. On an update, documents missing from the list are deleted; returns their stored paths so
 * the caller can remove the files once the transaction has committed.
 */
function party_rows_save(string $kind, int $ownerId, array $rows, bool $isUpdate): array
{
    $t = PARTY_TABLES[$kind];
    $owner = $t['owner'];
    foreach (['contacts', 'quotations', 'orders'] as $part) {
        query("DELETE FROM `{$t[$part]}` WHERE `$owner` = ?", [$ownerId]);
    }
    foreach ($rows['contacts'] as $order => $c) {
        query("INSERT INTO `{$t['contacts']}` (`$owner`, contact_name, designation, contact_number, email, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
            [$ownerId, $c['name'], $c['designation'], $c['number'], $c['email'], $order + 1]);
    }
    foreach ($rows['quotations'] as $order => $q) {
        query("INSERT INTO `{$t['quotations']}` (`$owner`, item_name, description, unit, rate, delivery_time, warranty, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [$ownerId, $q['itemName'], $q['description'], $q['unit'], $q['rate'], $q['deliveryTime'], $q['warranty'], $order + 1]);
    }
    foreach ($rows['orders'] as $order => $o) {
        query("INSERT INTO `{$t['orders']}` (`$owner`, order_number, order_date, total_value, total_items, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [$ownerId, $o['number'], $o['date'], $o['value'], $o['items'], $o['status'], $order + 1]);
    }
    if (!$isUpdate) {
        return [];
    }
    $docs = PARTY_DOCUMENTS[$kind];
    $kept = [];
    foreach ($rows['documents'] as $d) {
        $kept[$d['id']] = true;
        query("UPDATE `{$docs['table']}` SET doc_type = ?, expiry_date = ? WHERE id = ? AND `$owner` = ?", [$d['type'], $d['expiry'], $d['id'], $ownerId]);
    }
    $removed = [];
    foreach (query("SELECT id, file_path FROM `{$docs['table']}` WHERE `$owner` = ?", [$ownerId])->fetchAll() as $doc) {
        if (!isset($kept[(int) $doc['id']])) {
            query("DELETE FROM `{$docs['table']}` WHERE id = ?", [$doc['id']]);
            $removed[] = $doc['file_path'];
        }
    }
    return $removed;
}

/* contacts, quotations, orders and documents of one party, as the form and the View popup show them. */
function party_rows_find(string $kind, int $ownerId): array
{
    $t = PARTY_TABLES[$kind];
    $owner = $t['owner'];
    $contacts = query("SELECT * FROM `{$t['contacts']}` WHERE `$owner` = ? ORDER BY sort_order, id", [$ownerId])->fetchAll();
    $quotations = query("SELECT * FROM `{$t['quotations']}` WHERE `$owner` = ? ORDER BY sort_order, id", [$ownerId])->fetchAll();
    $orders = query("SELECT * FROM `{$t['orders']}` WHERE `$owner` = ? ORDER BY sort_order, id", [$ownerId])->fetchAll();
    return [
        'contacts' => array_map(static fn ($c) => [
            'name' => $c['contact_name'], 'designation' => $c['designation'], 'number' => $c['contact_number'], 'email' => $c['email'],
        ], $contacts),
        'quotations' => array_map(static fn ($q) => [
            'itemName' => $q['item_name'], 'description' => $q['description'], 'unit' => $q['unit'], 'rate' => $q['rate'],
            'deliveryTime' => $q['delivery_time'], 'warranty' => $q['warranty'],
        ], $quotations),
        'orders' => array_map(static fn ($o) => [
            'number' => $o['order_number'], 'date' => $o['order_date'], 'value' => $o['total_value'],
            'items' => $o['total_items'] === null ? null : (int) $o['total_items'], 'status' => $o['status'],
        ], $orders),
        'documents' => party_documents_list($kind, $ownerId),
    ];
}

/* The rows of a found party in save-payload form (for updates that send only some keys). */
function party_rows_as_input(array $party): array
{
    return [
        'contacts' => $party['contacts'], 'quotations' => $party['quotations'], 'orders' => $party['orders'],
        'documents' => array_map(static fn ($d) => ['id' => $d['id'], 'type' => $d['docType'], 'expiry' => $d['expiryDate']], $party['documents']),
    ];
}

/* Deletes a party and then its stored document files. 409 while items still name it as a supplier. */
function party_delete(string $kind, string $table, int $id, string $notFound): void
{
    $docs = PARTY_DOCUMENTS[$kind];
    $paths = query("SELECT file_path FROM `{$docs['table']}` WHERE `{$docs['owner']}` = ?", [$id])->fetchAll(PDO::FETCH_COLUMN);
    delete_row($table, $id, $notFound);   // contacts, documents, quotations and orders cascade
    foreach ($paths as $path) {
        delete_stored($path);
    }
}
