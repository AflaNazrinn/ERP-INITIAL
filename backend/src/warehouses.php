<?php
declare(strict_types=1);

require_once __DIR__ . '/master_validation.php';

/* Warehouses (stock points) and their rack / bin locations. */

const WAREHOUSE_STATUSES = ['active', 'inactive'];
const WAREHOUSE_TYPES = ['Finished Goods', 'Raw Materials', 'Work in Progress', 'Spare Parts', 'Returns'];

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

function warehouses_list(string $search = ''): array
{
    $sql = "SELECT * FROM warehouses WHERE status = 'active'";
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (warehouse_code LIKE ? OR warehouse_name LIKE ?)';
        $params = [like($search), like($search)];
    }
    return array_map('warehouse_format', query($sql . ' ORDER BY warehouse_code', $params)->fetchAll());
}

function warehouse_find(int $id): array
{
    $row = query('SELECT * FROM warehouses WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Warehouse not found.');
    }
    return warehouse_format($row);
}

/* Active rack / bin locations; only one warehouse's when $warehouseId is given. */
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
    return array_map('rack_bin_format', query($sql . ' ORDER BY w.warehouse_code, r.location_code', $params)->fetchAll());
}

function warehouse_next_code(): string
{
    return next_code('warehouses', 'warehouse_code', 'WH');
}

/*
 * Payload: warehouseName, type, address, country, city, contactPerson, phone, email, manager,
 * capacity, status, remarks, itemIds. The listed items get this warehouse as their stock point
 * (items.warehouse_id); their old rack is cleared because it belongs to another warehouse.
 */
function warehouse_create(array $data): array
{
    $in = new Input($data);
    $row = [
        'warehouse_name' => $in->text('warehouseName', 'Warehouse name', 150, true),
        'warehouse_type' => $in->choice('type', 'Warehouse type', WAREHOUSE_TYPES, 'Finished Goods'),
        'address'        => $in->text('address', 'Address', 255, true),
        'country'        => $in->text('country', 'Country', 80, true),
        'city'           => $in->text('city', 'City / municipality', 80, true),
        'contact_person' => $in->text('contactPerson', 'Contact person', 120, true),
        'phone'          => $in->text('phone', 'Phone / extension', 40, true),
        'email'          => $in->email('email', 'Email address', 150, true),
        'manager'        => $in->text('manager', 'Assigned manager', 120, true),
        'capacity'       => $in->whole('capacity', 'Total storage capacity', true),
        'status'         => $in->choice('status', 'Operational status', WAREHOUSE_STATUSES, 'active'),
        'remarks'        => $in->text('remarks', 'Remarks', 65535),
    ];
    $itemIds = $in->ids('itemIds', 'item', 'items');
    if (!$itemIds) {
        $in->fail('itemIds', 'Add at least one item.');
    }
    $in->done();

    $id = transaction(static function () use ($row, $itemIds): int {
        $row['warehouse_code'] = warehouse_next_code();
        query(
            'INSERT INTO warehouses (' . implode(', ', array_keys($row)) . ') VALUES (' . implode(', ', array_fill(0, count($row), '?')) . ')',
            array_values($row)
        );
        $id = (int) db()->lastInsertId();
        foreach ($itemIds as $itemId) {
            query('UPDATE items SET warehouse_id = ?, rack_id = NULL WHERE id = ?', [$id, $itemId]);
        }
        return $id;
    });
    return warehouse_find($id);
}
