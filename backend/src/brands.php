<?php
declare(strict_types=1);

require_once __DIR__ . '/master_validation.php';

/* Brands, and the items sold under each brand (item_brands). */

const BRAND_STATUSES = ['active', 'inactive'];

function brand_format(array $row): array
{
    return [
        'id'        => (int) $row['id'],
        'code'      => $row['brand_code'],
        'name'      => $row['brand_name'],
        'status'    => $row['status'],
        'createdAt' => date_only($row['created_at']),
    ];
}

/* Active brands for the lookups; every brand when $all (the Brand list page). */
function brands_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM brands' . ($all ? ' WHERE 1 = 1' : " WHERE status = 'active'");
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (brand_code LIKE ? OR brand_name LIKE ?)';
        $params = [like($search), like($search)];
    }
    return array_map('brand_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function brand_find(int $id): array
{
    $row = query('SELECT * FROM brands WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Brand not found.');
    }
    // The items sold under the brand (its item_brands lines), with what the brand's View shows of them:
    // category, unit, status and the suppliers on those lines.
    $items = query(
        'SELECT i.id, i.item_code AS code, i.item_name AS name, i.category, u.uom_name AS unit, i.status,
                GROUP_CONCAT(DISTINCT s.supplier_name ORDER BY s.supplier_name SEPARATOR \', \') AS suppliers
         FROM item_brands ib JOIN items i ON i.id = ib.item_id
         LEFT JOIN uoms u ON u.id = i.uom_id LEFT JOIN suppliers s ON s.id = ib.supplier_id
         WHERE ib.brand_id = ? GROUP BY i.id, i.item_code, i.item_name, i.category, u.uom_name, i.status ORDER BY i.item_name',
        [$id]
    )->fetchAll();
    return brand_format($row) + ['items' => array_map(static fn ($i) => ['id' => (int) $i['id'], 'code' => $i['code'], 'name' => $i['name'],
        'category' => $i['category'] ?? '', 'unit' => $i['unit'] ?? '', 'status' => $i['status'] ?? '', 'suppliers' => $i['suppliers'] ?? ''], $items),
        'soldItems' => brand_sold_items($id, (string) $row['brand_name'])];
}

/*
 * The items sold under the brand: every Sales Order, Delivery Note, Tax Invoice and Sales Entry line with this brand
 * (its brand_id, or the brand's name on a line saved without one), one row per item with the documents, the
 * customers and the last date it was sold. Shown on the brand's View only; never saved back as the brand's items.
 */
function brand_sold_items(int $id, string $name): array
{
    $sources = [
        ['sales_order_items', 'sales_order_id', 'sales_orders', 'so_code', 'so_date'],
        ['delivery_note_items', 'delivery_note_id', 'delivery_notes', 'dn_code', 'dn_date'],
        ['tax_invoice_items', 'tax_invoice_id', 'tax_invoices', 'ti_code', 'ti_date'],
        ['sales_entry_items', 'sales_entry_id', 'sales_entries', 'se_code', 'se_date'],
    ];
    $byItem = [];
    foreach ($sources as [$lines, $fk, $docs, $code, $date]) {
        try {
            $rows = query(
                "SELECT l.item_id, COALESCE(i.item_code, l.item_code) AS item_code, COALESCE(i.item_name, l.item_name) AS item_name,
                        l.unit, l.quantity, d.$code AS doc_code, d.$date AS doc_date, c.customer_name
                 FROM $lines l JOIN $docs d ON d.id = l.$fk
                 LEFT JOIN items i ON i.id = l.item_id LEFT JOIN customers c ON c.id = d.customer_id
                 WHERE l.brand_id = ? OR (l.brand_id IS NULL AND UPPER(TRIM(l.brand_name)) = UPPER(TRIM(?)) AND TRIM(?) <> '')",
                [$id, $name, $name]
            )->fetchAll();
        } catch (PDOException) {
            continue;                                   // a company database without that table yet
        }
        foreach ($rows as $r) {
            $key = $r['item_id'] !== null ? 'id:' . $r['item_id'] : 'name:' . mb_strtoupper(trim((string) $r['item_name']));
            $item = $byItem[$key] ?? ['id' => $r['item_id'] !== null ? (int) $r['item_id'] : null, 'code' => (string) ($r['item_code'] ?? ''),
                'name' => (string) ($r['item_name'] ?? ''), 'unit' => (string) ($r['unit'] ?? ''), 'documents' => [], 'customers' => [], 'lastSold' => ''];
            $item['documents'][(string) $r['doc_code']] = true;
            if (trim((string) $r['customer_name']) !== '') {
                $item['customers'][(string) $r['customer_name']] = true;
            }
            $item['lastSold'] = max($item['lastSold'], (string) $r['doc_date']);
            $byItem[$key] = $item;
        }
    }
    $out = array_map(static fn ($i) => ['id' => $i['id'], 'code' => $i['code'], 'name' => $i['name'], 'unit' => $i['unit'],
        'documents' => implode(', ', array_keys($i['documents'])), 'customers' => implode(', ', array_keys($i['customers'])),
        'lastSold' => substr($i['lastSold'], 0, 10)], array_values($byItem));
    usort($out, static fn ($a, $b) => strcmp($b['lastSold'], $a['lastSold']) ?: strcmp($a['name'], $b['name']));
    return $out;
}

function brand_next_code(): string
{
    return next_code('brands', 'brand_code', 'BRD');
}

function brand_input(array $brand): array
{
    return ['brandName' => $brand['name'], 'status' => $brand['status'], 'itemIds' => array_column($brand['items'], 'id')];
}

/*
 * Payload: brandName, status, itemIds: [id, …] (may be empty).
 * On an update the item list replaces the brand's items: removed items lose their item_brands rows.
 */
function brand_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(brand_input(brand_find($id)), $data);
    }
    $in = new Input($data);
    $name = $in->name('brandName', 'Brand name', 150);
    $status = $in->choice('status', 'Record status', BRAND_STATUSES, 'active');
    $itemIds = $in->ids('itemIds', 'item', 'items');
    if ($name !== '' && query('SELECT 1 FROM brands WHERE brand_name = ? AND id <> ?', [$name, $id ?? 0])->fetchColumn()) {
        $in->fail('brandName', 'A brand with this name already exists.');
    }
    $in->done();

    $id = transaction(static function () use ($id, $name, $status, $itemIds): int {
        if ($id === null) {
            query('INSERT INTO brands (brand_code, brand_name, status) VALUES (?, ?, ?)', [brand_next_code(), $name, $status]);
            $id = (int) db()->lastInsertId();
            $current = [];
        } else {
            query('UPDATE brands SET brand_name = ?, status = ? WHERE id = ?', [$name, $status, $id]);
            // The brand name is also kept as text on items and item_brands.
            query('UPDATE item_brands SET brand_name = ? WHERE brand_id = ?', [$name, $id]);
            query('UPDATE items SET brand_name = ? WHERE brand_id = ?', [$name, $id]);
            $current = array_map('intval', query('SELECT DISTINCT item_id FROM item_brands WHERE brand_id = ?', [$id])->fetchAll(PDO::FETCH_COLUMN));
            foreach (array_diff($current, $itemIds) as $removed) {
                query('DELETE FROM item_brands WHERE brand_id = ? AND item_id = ?', [$id, $removed]);
            }
        }
        foreach (array_diff($itemIds, $current) as $itemId) {
            $order = (int) query('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM item_brands WHERE item_id = ?', [$itemId])->fetchColumn();
            query('INSERT INTO item_brands (item_id, brand_id, brand_name, sort_order) VALUES (?, ?, ?, ?)', [$itemId, $id, $name, $order]);
        }
        return $id;
    });
    return brand_find($id);
}

function brand_create(array $data): array
{
    return brand_save($data);
}

/* 409 while items or suppliers still use it. */
function brand_delete(int $id): void
{
    delete_row('brands', $id, 'Brand not found.');
}
