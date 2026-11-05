<?php
declare(strict_types=1);

/*
 * Fills an empty database with demo masters through the same module functions the API uses,
 * so the lookup popups have something to show.  Usage: php backend/bin/seed-demo-data.php
 * Refuses to run when any unit of measure already exists.
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}

require_once __DIR__ . '/../src/uoms.php';
require_once __DIR__ . '/../src/categories.php';
require_once __DIR__ . '/../src/brands.php';
require_once __DIR__ . '/../src/warehouses.php';
require_once __DIR__ . '/../src/suppliers.php';
require_once __DIR__ . '/../src/customers.php';
require_once __DIR__ . '/../src/items.php';

if (query('SELECT COUNT(*) FROM uoms')->fetchColumn() > 0) {
    fwrite(STDERR, "The database already has data; seeding skipped.\n");
    exit(1);
}

try {
    $uom = [];
    foreach ([['Pieces', 0], ['Numbers', 0], ['Box', 0], ['Set', 0], ['Packet', 0], ['Pair', 0], ['Kilogram', 3], ['Litre', 3], ['Metre', 2], ['Roll', 0]] as [$name, $decimals]) {
        $uom[$name] = uom_create(['unitName' => $name, 'decimalAllowed' => $decimals, 'conversionFactor' => '1'])['id'];
    }
    uom_create(['unitName' => 'Gram', 'decimalAllowed' => 0, 'conversionBaseId' => $uom['Kilogram'], 'conversionFactor' => '0.0010']);
    uom_create(['unitName' => 'Metric Tonne', 'decimalAllowed' => 3, 'conversionBaseId' => $uom['Kilogram'], 'conversionFactor' => '1000']);

    $categories = [
        'Pneumatics & Hydraulics' => ['Ball Valves', 'Solenoid Valves', 'Pressure Regulators', 'Hydraulic Hoses'],
        'Electrical Switchgear'   => ['Circuit Breakers', 'Contactors', 'Cables & Wires'],
        'Mechanical Hardware'     => ['Bearings', 'Fasteners', 'Couplings'],
        'Safety & Protective'     => ['Helmets & Headgear', 'Gloves', 'Safety Footwear'],
        'Instrumentation'         => ['Pressure Gauges', 'Temperature Sensors'],
    ];
    $sub = [];
    foreach ($categories as $name => $subs) {
        foreach (category_create(['categoryName' => $name, 'subcategories' => $subs])['subcategories'] as $row) {
            $sub[$row['name']] = $row;
        }
    }

    $warehouses = [];
    $racks = [];
    foreach ([['Central WH North', 'Finished Goods', 'N'], ['Secondary WH South', 'Finished Goods', 'S'], ['Spare Parts Store', 'Spare Parts', 'SP']] as [$name, $type, $prefix]) {
        // Rack / bin locations have no form yet, so they are inserted directly. A warehouse needs
        // at least one item, which does not exist yet: create the row here instead of warehouse_create().
        query("INSERT INTO warehouses (warehouse_code, warehouse_name, warehouse_type, address, country, city, contact_person, phone, email, manager, capacity)
               VALUES (?, ?, ?, 'Industrial Area', 'Oman', 'Muscat', 'Store Keeper', '+968 2400 0000', 'stores@example.com', 'Stores Manager', 5000)",
            [warehouse_next_code(), $name, $type]);
        $warehouseId = (int) db()->lastInsertId();
        $warehouses[$name] = $warehouseId;
        foreach (['A01-1', 'A01-2', 'B01-1'] as $location) {
            [$rack, $shelf] = explode('-', $location);
            query('INSERT INTO rack_bins (location_code, warehouse_id, rack, shelf) VALUES (?, ?, ?, ?)', ["$prefix-$location", $warehouseId, $rack, $shelf]);
            $racks[$name][] = (int) db()->lastInsertId();
        }
    }

    $suppliers = [];
    foreach ([['Al Maha Industrial Supplies LLC', 'Muscat'], ['Gulf Pneumatics Trading', 'Dubai'], ['Muscat Electrical Co. LLC', 'Muscat'], ['Arabian Bearings Est.', 'Riyadh']] as [$name, $city]) {
        $suppliers[$name] = supplier_create(['supplierName' => $name, 'address' => $city, 'country' => $city === 'Dubai' ? 'United Arab Emirates' : ($city === 'Riyadh' ? 'Saudi Arabia' : 'Oman')])['id'];
    }

    $items = [];
    foreach ([
        ['Ball Valve 1/2" SS316', 'Pieces', 'Ball Valves', 'Central WH North'],
        ['Solenoid Valve 24V DC 1/4"', 'Pieces', 'Solenoid Valves', 'Central WH North'],
        ['MCB 32A 3-Pole', 'Pieces', 'Circuit Breakers', 'Secondary WH South'],
        ['Deep Groove Bearing 6205-2RS', 'Pieces', 'Bearings', 'Spare Parts Store'],
        ['Hex Bolt M10 x 50', 'Box', 'Fasteners', 'Spare Parts Store'],
        ['Nitrile Gloves Size L', 'Pair', 'Gloves', 'Secondary WH South'],
    ] as [$name, $unit, $subName, $warehouse]) {
        $items[$name] = item_create([
            'itemName'      => $name,
            'uomId'         => $uom[$unit],
            'subCategoryId' => $sub[$subName]['id'],
            'warehouseId'   => $warehouses[$warehouse],
            'rackId'        => $racks[$warehouse][0],
        ])['id'];
    }

    foreach (['Festo' => ['Ball Valve 1/2" SS316', 'Solenoid Valve 24V DC 1/4"'], 'Schneider Electric' => ['MCB 32A 3-Pole'], 'SKF' => ['Deep Groove Bearing 6205-2RS'], '3M' => ['Nitrile Gloves Size L']] as $brand => $brandItems) {
        brand_create(['brandName' => $brand, 'itemIds' => array_map(static fn ($n) => $items[$n], $brandItems)]);
    }

    customer_create(['customerName' => 'Oman Oil Services LLC', 'country' => 'Oman', 'city' => 'Muscat']);
} catch (ValidationError $e) {
    fwrite(STDERR, 'Seed data failed validation: ' . json_encode($e->fields) . "\n");
    exit(1);
}

echo "Demo masters added.\n";
