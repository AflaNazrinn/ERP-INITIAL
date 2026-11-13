<?php
declare(strict_types=1);

require_once __DIR__ . '/master_validation.php';

/*
 * Stock points (offices, warehouses and shops that hold stock) and their rack / bin locations.
 * The table keeps its original name, warehouses; the screens call them stock points.
 */

const WAREHOUSE_STATUSES = ['active', 'inactive'];
const WAREHOUSE_TYPES = ['Office', 'Warehouse', 'Shop'];

function warehouse_format(array $row): array
{
    return [
        'id'            => (int) $row['id'],
        'code'          => $row['warehouse_code'],
        'name'          => $row['warehouse_name'],
        'type'          => $row['warehouse_type'],
        'address'       => $row['address'],
        'country'       => $row['country'],
        'city'          => $row['city'],
        'contactPerson' => $row['contact_person'],
        'phone'         => $row['phone'],
        'email'         => $row['email'],
        'manager'       => $row['manager'],
        'capacity'      => $row['capacity'] === null ? null : (int) $row['capacity'],
        'status'        => $row['status'],
        'remarks'       => $row['remarks'] ?? '',
        'createdAt'     => date_only($row['created_at']),
    ];
}

function rack_bin_format(array $row): array
{
    $name = $row['location_name'] !== '' ? $row['location_name'] : trim("Rack {$row['rack']} · Shelf {$row['shelf']}");
    return [
        'id'            => (int) $row['id'],
        'code'          => $row['location_code'],
        'name'          => $name,
        'rack'          => $row['rack'],
        'shelf'         => $row['shelf'],
        'warehouseId'   => (int) $row['warehouse_id'],
        'warehouseName' => $row['warehouse_name'],
    ];
}

/* Active stock points for the lookups; every one when $all (the Stock Point list page). */
function warehouses_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM warehouses' . ($all ? ' WHERE 1 = 1' : " WHERE status = 'active'");
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (warehouse_code LIKE ? OR warehouse_name LIKE ?)';
        $params = [like($search), like($search)];
    }
    return array_map('warehouse_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function warehouse_find(int $id): array
{
    $row = query('SELECT * FROM warehouses WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Stock point not found.');
    }
    $items = query('SELECT id, item_code, item_name FROM items WHERE warehouse_id = ? ORDER BY item_name', [$id])->fetchAll();
    return warehouse_format($row) + ['items' => array_map(static fn ($i) => ['id' => (int) $i['id'], 'code' => $i['item_code'], 'name' => $i['item_name']], $items)]
        + warehouse_stock($id);
}

/* The stock held at one stock point: the opening stock of every item sourcing line there, added up.
 * Items saved before opening stock was kept per line hold their total on the first line (its stock point,
 * else the item's own), as the Item page shows them. Returns availableStock ("44") and stockedItems. */
function warehouse_stock(int $id): array
{
    $lines = query(
        'SELECT item_id, opening_stock AS qty FROM item_brands WHERE warehouse_id = ? AND opening_stock IS NOT NULL',
        [$id]
    )->fetchAll();
    $older = query(
        "SELECT i.id AS item_id, NULLIF(i.available_stock, '') AS qty
         FROM items i
         LEFT JOIN item_brands f ON f.id = (SELECT id FROM item_brands WHERE item_id = i.id ORDER BY sort_order, id LIMIT 1)
         WHERE COALESCE(f.warehouse_id, i.warehouse_id) = ?
           AND NOT EXISTS (SELECT 1 FROM item_brands ib WHERE ib.item_id = i.id AND ib.opening_stock IS NOT NULL)",
        [$id]
    )->fetchAll();
    $total = 0.0;
    $stocked = [];
    foreach ([...$lines, ...$older] as $line) {
        if ($line['qty'] === null || !is_numeric($line['qty'])) {
            continue;
        }
        $total += (float) $line['qty'];
        if ((float) $line['qty'] != 0.0) {
            $stocked[(int) $line['item_id']] = true;
        }
    }
    return ['availableStock' => rtrim(rtrim(number_format($total, 3, '.', ''), '0'), '.'), 'stockedItems' => count($stocked)];
}

/* Active rack / bin locations; only one stock point's when $warehouseId is given. */
function rack_bins_list(?int $warehouseId = null, string $search = ''): array
{
    $sql = "SELECT r.*, w.warehouse_name FROM rack_bins r JOIN warehouses w ON w.id = r.warehouse_id WHERE r.status = 'active'";
    $params = [];
    if ($warehouseId !== null) {
        $sql .= ' AND r.warehouse_id = ?';
        $params[] = $warehouseId;
    }
    if ($search !== '') {
        $sql .= ' AND (r.location_code LIKE ? OR r.location_name LIKE ?)';
        array_push($params, like($search), like($search));
    }
    return array_map('rack_bin_format', query($sql . ' ORDER BY r.id DESC', $params)->fetchAll());
}

function warehouse_next_code(): string
{
    return next_code('warehouses', 'warehouse_code', 'WH');
}

function warehouse_input(array $w): array
{
    return [
        'warehouseName' => $w['name'], 'type' => $w['type'], 'address' => $w['address'], 'country' => $w['country'], 'city' => $w['city'],
        'contactPerson' => $w['contactPerson'], 'phone' => $w['phone'], 'email' => $w['email'], 'manager' => $w['manager'],
        'capacity' => $w['capacity'], 'status' => $w['status'], 'remarks' => $w['remarks'], 'itemIds' => array_column($w['items'], 'id'),
    ];
}

/*
 * Payload: warehouseName, type, address, country, city, contactPerson, phone, email, manager,
 * capacity, status, remarks, itemIds. Only the name is required (the code is generated); type defaults to Warehouse.
 * The listed items get this stock point (items.warehouse_id); their old rack is cleared because it
 * belongs to another stock point. On an update, items taken off the list lose this stock point.
 */
function warehouse_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(warehouse_input(warehouse_find($id)), $data);
    }
    $in = new Input($data);
    $row = [
        'warehouse_name' => $in->name('warehouseName', 'Stock point name', 150),
        'warehouse_type' => $in->choice('type', 'Stock point type', WAREHOUSE_TYPES, 'Warehouse'),
        'address'        => $in->text('address', 'Address', 255),
        'country'        => $in->text('country', 'Country', 80),
        'city'           => $in->text('city', 'City / municipality', 80),
        'contact_person' => $in->text('contactPerson', 'Contact person', 120),
        'phone'          => $in->phone('phone', 'Phone / extension', 40, true),
        'email'          => $in->email('email', 'Email address', 150),
        'manager'        => $in->text('manager', 'Assigned manager', 120),
        'capacity'       => $in->whole('capacity', 'Total storage capacity'),
        'status'         => $in->choice('status', 'Operational status', WAREHOUSE_STATUSES, 'active'),
        'remarks'        => $in->text('remarks', 'Remarks', 65535),
    ];
    $itemIds = $in->ids('itemIds', 'item', 'items');
    $in->done();

    $id = transaction(static function () use ($id, $row, $itemIds): int {
        if ($id === null) {
            $row['warehouse_code'] = warehouse_next_code();
            query(
                'INSERT INTO warehouses (' . implode(', ', array_keys($row)) . ') VALUES (' . implode(', ', array_fill(0, count($row), '?')) . ')',
                array_values($row)
            );
            $id = (int) db()->lastInsertId();
            $current = [];
        } else {
            query('UPDATE warehouses SET ' . implode(' = ?, ', array_keys($row)) . ' = ? WHERE id = ?', [...array_values($row), $id]);
            $current = array_map('intval', query('SELECT id FROM items WHERE warehouse_id = ?', [$id])->fetchAll(PDO::FETCH_COLUMN));
            foreach (array_diff($current, $itemIds) as $removed) {
                query('UPDATE items SET warehouse_id = NULL, rack_id = NULL WHERE id = ?', [$removed]);
            }
        }
        foreach (array_diff($itemIds, $current) as $itemId) {
            query('UPDATE items SET warehouse_id = ?, rack_id = NULL WHERE id = ?', [$id, $itemId]);
        }
        return $id;
    });
    return warehouse_find($id);
}

function warehouse_create(array $data): array
{
    return warehouse_save($data);
}

/* 409 while items or rack / bin locations are still in it. */
function warehouse_delete(int $id): void
{
    delete_row('warehouses', $id, 'Stock point not found.');
}
