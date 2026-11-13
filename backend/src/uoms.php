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
        'baseName'         => $row['base_name'] ?? '',
        'conversionFactor' => $row['conversion_factor'],
        'status'           => $row['status'],
        'isSystem'         => (int) ($row['is_system'] ?? 0),
        'createdAt'        => date_only($row['created_at']),
    ];
}

const UOM_SELECT = 'SELECT u.*, b.uom_code AS base_code, b.uom_name AS base_name FROM uoms u LEFT JOIN uoms b ON b.id = u.conversion_base_id';

/* Active units for the lookups; every unit when $all (the UOM list page). */
function uoms_list(string $search = '', bool $all = false): array
{
    $sql = UOM_SELECT . ($all ? ' WHERE 1 = 1' : " WHERE u.status = 'active'");
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (u.uom_code LIKE ? OR u.uom_name LIKE ?)';
        $params = [like($search), like($search)];
    }
    return array_map('uom_format', query($sql . ' ORDER BY u.id DESC', $params)->fetchAll());
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

/* A saved unit as a save payload, so an update only has to send what changes. */
function uom_input(array $uom): array
{
    return [
        'unitName' => $uom['name'], 'decimalAllowed' => $uom['decimalAllowed'], 'status' => $uom['status'],
        'conversionBaseId' => $uom['conversionBaseId'], 'conversionFactor' => $uom['conversionFactor'], 'description' => $uom['description'],
    ];
}

/*
 * Payload: unitName, decimalAllowed, status, conversionBaseId, conversionFactor, description.
 * Only the name is required: decimals default to 0, the factor to 1, the status to active.
 * Creates when $id is null, otherwise updates that unit.
 */
function uom_save(array $data, ?int $id = null): array
{
    $saved = $id !== null ? uom_find($id) : null;
    if ($saved !== null) {
        $data = array_replace(uom_input($saved), $data);
    }
    $in = new Input($data);
    $name = $in->name('unitName', 'Unit of measure', 80);
    $decimals = $in->whole('decimalAllowed', 'Decimal allowed', false, UOM_MAX_DECIMALS) ?? 0;
    $status = $in->choice('status', 'Record status', UOM_STATUSES, 'active');
    $baseId = $in->id('conversionBaseId', 'base unit', 'uoms');
    if ($id !== null && $baseId === $id) {
        $in->fail('conversionBaseId', 'A unit cannot convert to itself.');
    }
    $factor = $in->decimal('conversionFactor', 'Conversion factor', 14, 4) ?? '1';
    if ((float) $factor <= 0) {
        $in->fail('conversionFactor', 'Conversion factor must be above 0.');
    }
    $description = $in->text('description', 'Description', 255);
    // Predefined units keep their name and stay active; the rest of the record can change.
    if ($saved !== null && $saved['isSystem']) {
        if ($name !== '' && strcasecmp($name, $saved['name']) !== 0) {
            $in->fail('unitName', 'This is a predefined unit; its name cannot be changed.');
        }
        if ($status !== 'active') {
            $in->fail('status', 'This is a predefined unit; it must stay active.');
        }
    }
    if ($name !== '' && query('SELECT 1 FROM uoms WHERE uom_name = ? AND id <> ?', [$name, $id ?? 0])->fetchColumn()) {
        $in->fail('unitName', 'A unit with this name already exists.');
    }
    $in->done();

    $values = [$name, $description, $decimals, $baseId, $factor, $status];
    $id = transaction(static function () use ($id, $values): int {
        if ($id !== null) {
            query('UPDATE uoms SET uom_name = ?, description = ?, decimal_allowed = ?, conversion_base_id = ?, conversion_factor = ?, status = ? WHERE id = ?',
                [...$values, $id]);
            return $id;
        }
        query(
            'INSERT INTO uoms (uom_code, uom_name, description, decimal_allowed, conversion_base_id, conversion_factor, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uom_next_code(), ...$values]
        );
        return (int) db()->lastInsertId();
    });
    return uom_find($id);
}

function uom_create(array $data): array
{
    return uom_save($data);
}

/* 409 for a predefined unit, or while items or other units still use it. */
function uom_delete(int $id): void
{
    if (uom_find($id)['isSystem']) {
        throw new Conflict('This is a predefined unit and cannot be deleted.');
    }
    delete_row('uoms', $id, 'Unit of measure not found.');
}
