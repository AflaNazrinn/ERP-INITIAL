<?php
declare(strict_types=1);

require_once __DIR__ . '/master_validation.php';

/* Units of measure (uoms). conversion_base_id points at the unit this one converts to. */

const UOM_STATUSES = ['active', 'inactive'];
const UOM_MAX_DECIMALS = 6;

function uom_format(array $row): array
{
    return [
        'id'               => (int) $row['id'],
        'code'             => $row['uom_code'],
        'name'             => $row['uom_name'],
        'description'      => $row['description'],
        'decimalAllowed'   => (int) $row['decimal_allowed'],
        'conversionBaseId' => $row['conversion_base_id'] === null ? null : (int) $row['conversion_base_id'],
        'baseCode'         => $row['base_code'] ?? null,
        'conversionFactor' => $row['conversion_factor'],
        'status'           => $row['status'],
    ];
}

const UOM_SELECT = 'SELECT u.*, b.uom_code AS base_code FROM uoms u LEFT JOIN uoms b ON b.id = u.conversion_base_id';

function uoms_list(string $search = ''): array
{
    $sql = UOM_SELECT . " WHERE u.status = 'active'";
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (u.uom_code LIKE ? OR u.uom_name LIKE ?)';
        $params = [like($search), like($search)];
    }
    return array_map('uom_format', query($sql . ' ORDER BY u.uom_name', $params)->fetchAll());
}

function uom_find(int $id): array
{
    $row = query(UOM_SELECT . ' WHERE u.id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Unit of measure not found.');
    }
    return uom_format($row);
}

function uom_next_code(): string
{
    return next_code('uoms', 'uom_code', 'UOM', false);
}

/* Payload: unitName, decimalAllowed, status, conversionBaseId, conversionFactor, description. */
function uom_create(array $data): array
{
    $in = new Input($data);
    $name = $in->text('unitName', 'Unit of measure', 80, true);
    $decimals = $in->whole('decimalAllowed', 'Decimal allowed', true, UOM_MAX_DECIMALS);
    $status = $in->choice('status', 'Record status', UOM_STATUSES, 'active');
    $baseId = $in->id('conversionBaseId', 'base unit', 'uoms');
    $factor = $in->decimal('conversionFactor', 'Conversion factor', 14, 4, true);
    if ($factor !== null && (float) $factor <= 0) {
        $in->fail('conversionFactor', 'Conversion factor must be above 0.');
    }
    $description = $in->text('description', 'Description', 255);
    if ($name !== '' && query('SELECT 1 FROM uoms WHERE uom_name = ?', [$name])->fetchColumn()) {
        $in->fail('unitName', 'A unit with this name already exists.');
    }
    $in->done();

    $id = transaction(static function () use ($name, $decimals, $status, $baseId, $factor, $description): int {
        query(
            'INSERT INTO uoms (uom_code, uom_name, description, decimal_allowed, conversion_base_id, conversion_factor, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uom_next_code(), $name, $description, $decimals, $baseId, $factor, $status]
        );
        return (int) db()->lastInsertId();
    });
    return uom_find($id);
}
