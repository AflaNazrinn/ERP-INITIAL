<?php
declare(strict_types=1);

require_once __DIR__ . '/master_validation.php';

/* Brands, and the items sold under each brand (item_brands). */

const BRAND_STATUSES = ['active', 'inactive'];

function brand_format(array $row): array
{
    return [
        'id'     => (int) $row['id'],
        'code'   => $row['brand_code'],
        'name'   => $row['brand_name'],
        'status' => $row['status'],
    ];
}

function brands_list(string $search = ''): array
{
    $sql = "SELECT * FROM brands WHERE status = 'active'";
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (brand_code LIKE ? OR brand_name LIKE ?)';
        $params = [like($search), like($search)];
    }
    return array_map('brand_format', query($sql . ' ORDER BY brand_name', $params)->fetchAll());
}

function brand_find(int $id): array
{
    $row = query('SELECT * FROM brands WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Brand not found.');
    }
    $items = query(
        'SELECT i.id, i.item_code AS code, i.item_name AS name FROM item_brands ib JOIN items i ON i.id = ib.item_id
         WHERE ib.brand_id = ? GROUP BY i.id, i.item_code, i.item_name ORDER BY i.item_name',
        [$id]
    )->fetchAll();
    return brand_format($row) + ['items' => array_map(static fn ($i) => ['id' => (int) $i['id'], 'code' => $i['code'], 'name' => $i['name']], $items)];
}

function brand_next_code(): string
{
    return next_code('brands', 'brand_code', 'BRD');
}

/* Payload: brandName, status, itemIds: [id, …] (at least one). */
function brand_create(array $data): array
{
    $in = new Input($data);
    $name = $in->text('brandName', 'Brand name', 150, true);
    $status = $in->choice('status', 'Record status', BRAND_STATUSES, 'active');
    $itemIds = $in->ids('itemIds', 'item', 'items');
    if (!$itemIds) {
        $in->fail('itemIds', 'Add at least one item.');
    }
    if ($name !== '' && query('SELECT 1 FROM brands WHERE brand_name = ?', [$name])->fetchColumn()) {
        $in->fail('brandName', 'A brand with this name already exists.');
    }
    $in->done();

    $id = transaction(static function () use ($name, $status, $itemIds): int {
        query('INSERT INTO brands (brand_code, brand_name, status) VALUES (?, ?, ?)', [brand_next_code(), $name, $status]);
        $id = (int) db()->lastInsertId();
        foreach ($itemIds as $itemId) {
            $order = (int) query('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM item_brands WHERE item_id = ?', [$itemId])->fetchColumn();
            query('INSERT INTO item_brands (item_id, brand_id, brand_name, sort_order) VALUES (?, ?, ?, ?)', [$itemId, $id, $name, $order]);
        }
        return $id;
    });
    return brand_find($id);
}
