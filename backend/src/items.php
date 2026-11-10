<?php
declare(strict_types=1);

require_once __DIR__ . '/master_validation.php';

/*
 * Item master. Every lookup on the item form is a foreign key: uom_id, category_id,
 * sub_category_id, brand_id, warehouse_id (stock point), rack_id. The model also keeps the category,
 * sub-category and brand names as text on the item; they are filled from the chosen rows.
 * Sourcing rows become item_brands (brand + supplier + cost), item_brand_suppliers and
 * item_suppliers (one price per supplier).
 */

const ITEM_STATUSES = ['ACTIVE / RELEASED', 'QUALITY HOLD', 'OBSOLETE', 'DRAFT'];

const ITEM_SELECT = 'SELECT i.*, u.uom_name, w.warehouse_code, w.warehouse_name, r.location_code
    FROM items i
    LEFT JOIN uoms u ON u.id = i.uom_id
    LEFT JOIN warehouses w ON w.id = i.warehouse_id
    LEFT JOIN rack_bins r ON r.id = i.rack_id';

function item_format(array $row): array
{
    $id = static fn ($value) => $value === null ? null : (int) $value;
    return [
        'id'            => (int) $row['id'],
        'code'          => $row['item_code'],
        'name'          => $row['item_name'],
        'unit'          => $row['uom_name'] ?? '',
        'uomId'         => $id($row['uom_id']),
        'categoryId'    => $id($row['category_id']),
        'category'      => $row['category'],
        'subCategoryId' => $id($row['sub_category_id']),
        'subCategory'   => $row['sub_category'],
        'brandId'       => $id($row['brand_id']),
        'brandName'     => $row['brand_name'],
        'warehouseId'   => $id($row['warehouse_id']),
        'warehouseCode' => $row['warehouse_code'] ?? null,
        'warehouseName' => $row['warehouse_name'] ?? '',
        'rackId'        => $id($row['rack_id']),
        'rackCode'      => $row['location_code'] ?? null,
        'buyingRate'    => $row['buying_rate'],
        'sellingPrice'  => $row['selling_price'],
        'availableStock'=> $row['available_stock'],
        'description'   => $row['description'] ?? '',
        'webLink'       => $row['web_link'],
        'imagePath'     => $row['image_path'],
        'status'        => $row['status'],
        'createdAt'     => date_only($row['created_at']),
    ];
}

/* Items for the lookups (not obsolete); every item when $all (the Item list page). */
function items_list(string $search = '', bool $all = false): array
{
    $sql = ITEM_SELECT . ($all ? ' WHERE 1 = 1' : " WHERE i.status <> 'OBSOLETE'");
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (i.item_code LIKE ? OR i.item_name LIKE ?)';
        $params = [like($search), like($search)];
    }
    return array_map('item_format', query($sql . ' ORDER BY i.id DESC', $params)->fetchAll());
}

function item_find(int $id): array
{
    $row = query(ITEM_SELECT . ' WHERE i.id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Item not found.');
    }
    $sourcing = query(
        'SELECT ib.brand_id, ib.brand_name, ib.supplier_id, s.supplier_name, ib.price_per_unit
         FROM item_brands ib LEFT JOIN suppliers s ON s.id = ib.supplier_id
         WHERE ib.item_id = ? ORDER BY ib.sort_order, ib.id',
        [$id]
    )->fetchAll();
    return item_format($row) + ['sourcing' => array_map(static fn ($s) => [
        'brandId'      => $s['brand_id'] === null ? null : (int) $s['brand_id'],
        'brandName'    => $s['brand_name'],
        'supplierId'   => $s['supplier_id'] === null ? null : (int) $s['supplier_id'],
        'supplierName' => $s['supplier_name'],
        'cost'         => $s['price_per_unit'],
    ], $sourcing)];
}

function item_next_code(): string
{
    return next_code('items', 'item_code', 'ITM');
}

function name_of(string $table, string $column, ?int $id): string
{
    return $id === null ? '' : (string) query("SELECT `$column` FROM `$table` WHERE id = ?", [$id])->fetchColumn();
}

/* A saved item as a save payload. Selling price and opening stock are kept per item, so they go on the first row. */
function item_input(array $item): array
{
    $sourcing = array_map(static fn ($s) => ['brandId' => $s['brandId'], 'supplierId' => $s['supplierId'], 'cost' => $s['cost']], $item['sourcing']);
    if ($sourcing) {
        $sourcing[0]['sellingPrice'] = $item['sellingPrice'];
        $sourcing[0]['openingStock'] = $item['availableStock'];
    }
    return [
        'itemName' => $item['name'], 'uomId' => $item['uomId'], 'categoryId' => $item['categoryId'], 'subCategoryId' => $item['subCategoryId'],
        'brandId' => $item['brandId'], 'comments' => $item['description'], 'warehouseId' => $item['warehouseId'], 'rackId' => $item['rackId'],
        'status' => $item['status'], 'imageLink' => $item['imagePath'], 'supplierUrl' => $item['webLink'], 'sourcing' => $sourcing,
    ];
}

/*
 * Payload: itemName, uomId, categoryId, subCategoryId, brandId, comments, warehouseId, rackId,
 * status, imageLink, supplierUrl,
 * sourcing: [{ brandId, supplierId, cost, openingStock, sellingPrice, batchExpiry }, …].
 * The first sourcing row's cost and selling price become the item's buying rate and selling price,
 * and the opening stock of all rows its available stock. On an update the rows replace the old ones.
 */
function item_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(item_input(item_find($id)), $data);
    }
    $in = new Input($data);
    $name = $in->name('itemName', 'Item designation', 200);
    $uomId = $in->id('uomId', 'unit of measure', 'uoms');
    $categoryId = $in->id('categoryId', 'category', 'categories');
    $subCategoryId = $in->id('subCategoryId', 'subcategory', 'sub_categories');
    $brandId = $in->id('brandId', 'brand', 'brands');
    $warehouseId = $in->id('warehouseId', 'stock point', 'warehouses');
    $rackId = $in->id('rackId', 'rack / bin', 'rack_bins');
    $status = $in->choice('status', 'Inventory status', ITEM_STATUSES, 'ACTIVE / RELEASED');
    $description = $in->text('comments', 'Comments', 65535);
    $imagePath = $in->url('imageLink', 'CAD / image URL');
    $webLink = $in->url('supplierUrl', 'Supplier URL');

    if ($subCategoryId !== null) {
        $parent = (int) query('SELECT category_id FROM sub_categories WHERE id = ?', [$subCategoryId])->fetchColumn();
        if ($categoryId === null) {
            $categoryId = $parent;
        } elseif ($parent !== $categoryId) {
            $in->fail('subCategoryId', 'The subcategory does not belong to the selected category.');
        }
    }
    if ($rackId !== null) {
        $rackWarehouse = (int) query('SELECT warehouse_id FROM rack_bins WHERE id = ?', [$rackId])->fetchColumn();
        if ($warehouseId === null) {
            $warehouseId = $rackWarehouse;
        } elseif ($rackWarehouse !== $warehouseId) {
            $in->fail('rackId', 'The rack / bin is not in the selected stock point.');
        }
    }

    $sourcing = [];
    $openingStock = 0.0;
    foreach ($in->rows('sourcing') as $index => $line) {
        $row = new Input($line);
        $source = [
            'brandId'      => $row->id('brandId', 'brand', 'brands'),
            'supplierId'   => $row->id('supplierId', 'supplier', 'suppliers'),
            'cost'         => $row->decimal('cost', 'Cost', 14, 4),
            'sellingPrice' => $row->decimal('sellingPrice', 'Selling price', 12, 3),
            'openingStock' => $row->decimal('openingStock', 'Opening stock', 12, 3),
        ];
        try {
            $row->done();
        } catch (ValidationError $e) {
            $in->fail('sourcing', 'Sourcing row ' . ($index + 1) . ': ' . $e->getMessage());
            continue;
        }
        if ($source['brandId'] === null && $source['supplierId'] === null && $source['cost'] === null
            && $source['sellingPrice'] === null && $source['openingStock'] === null) {
            continue;   // blank row
        }
        $openingStock += (float) ($source['openingStock'] ?? 0);
        $sourcing[] = $source;
    }
    $in->done();

    $first = $sourcing[0] ?? null;
    $row = [
        'item_name'       => $name,
        'uom_id'          => $uomId,
        'category_id'     => $categoryId,
        'category'        => mb_substr(name_of('categories', 'category_name', $categoryId), 0, 100),
        'sub_category_id' => $subCategoryId,
        'sub_category'    => mb_substr(name_of('sub_categories', 'sub_category_name', $subCategoryId), 0, 100),
        'brand_id'        => $brandId,
        'brand_name'      => name_of('brands', 'brand_name', $brandId),
        'warehouse_id'    => $warehouseId,
        'rack_id'         => $rackId,
        'status'          => $status,
        'description'     => $description,
        'image_path'      => $imagePath,
        'web_link'        => $webLink,
        'buying_rate'     => $first['cost'] ?? null,
        'selling_price'   => $first['sellingPrice'] ?? null,
        'available_stock' => $sourcing ? rtrim(rtrim(number_format($openingStock, 3, '.', ''), '0'), '.') : '',
    ];

    $id = transaction(static function () use ($id, $row, $sourcing): int {
        if ($id === null) {
            $row['item_code'] = item_next_code();
            query(
                'INSERT INTO items (' . implode(', ', array_keys($row)) . ') VALUES (' . implode(', ', array_fill(0, count($row), '?')) . ')',
                array_values($row)
            );
            $id = (int) db()->lastInsertId();
        } else {
            query('UPDATE items SET ' . implode(' = ?, ', array_keys($row)) . ' = ? WHERE id = ?', [...array_values($row), $id]);
            query('DELETE FROM item_brands WHERE item_id = ?', [$id]);      // item_brand_suppliers go with them
            query('DELETE FROM item_suppliers WHERE item_id = ?', [$id]);
        }
        $priced = [];
        foreach ($sourcing as $order => $source) {
            query(
                'INSERT INTO item_brands (item_id, brand_id, brand_name, supplier_id, price_per_unit, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
                [$id, $source['brandId'], name_of('brands', 'brand_name', $source['brandId']), $source['supplierId'], $source['cost'], $order + 1]
            );
            $itemBrandId = (int) db()->lastInsertId();
            if ($source['supplierId'] === null) {
                continue;
            }
            query('INSERT INTO item_brand_suppliers (item_brand_id, supplier_id) VALUES (?, ?)', [$itemBrandId, $source['supplierId']]);
            if (!isset($priced[$source['supplierId']])) {   // item_suppliers holds one price per supplier: the first row's
                $priced[$source['supplierId']] = true;
                query('INSERT INTO item_suppliers (item_id, supplier_id, price) VALUES (?, ?, ?)', [$id, $source['supplierId'], $source['cost']]);
            }
        }
        return $id;
    });
    return item_find($id);
}

function item_create(array $data): array
{
    return item_save($data);
}

/* Its sourcing rows and documents go with it. */
function item_delete(int $id): void
{
    delete_row('items', $id, 'Item not found.');
}
