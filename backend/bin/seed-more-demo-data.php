<?php
declare(strict_types=1);

/*
 * Tops up the demo masters (after seed-demo-data.php): more brands, suppliers, customers and items, the items
 * with brands, suppliers, buying costs, selling prices and opening stock, so the item popups and the
 * Purchase Book have realistic choices. Saved through the same module functions the API uses.
 * Safe to run again: a record whose name is already on file is skipped.
 *
 *   php backend/bin/seed-more-demo-data.php
 * Then, for demo Purchase Book documents:  php backend/bin/seed-purchase-book.php
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}

require_once __DIR__ . '/../src/brands.php';
require_once __DIR__ . '/../src/suppliers.php';
require_once __DIR__ . '/../src/customers.php';
require_once __DIR__ . '/../src/items.php';

$upper = static fn (string $text): string => mb_strtoupper(trim($text));
// name (upper case) => id, for a master table.
$ids = static fn (string $table, string $column): array => array_change_key_case(
    array_map('intval', query("SELECT $column, id FROM $table")->fetchAll(PDO::FETCH_KEY_PAIR)), CASE_UPPER);
$added = ['brands' => 0, 'suppliers' => 0, 'customers' => 0, 'items' => 0];

$uoms = $ids('uoms', 'uom_name');
$subs = $ids('sub_categories', 'sub_category_name');
$warehouses = $ids('warehouses', 'warehouse_name');
if (!$uoms || !$subs || !$warehouses) {
    fwrite(STDERR, "Run php backend/bin/seed-demo-data.php first (units, categories and stock points are needed).\n");
    exit(1);
}
$firstRack = static fn (int $warehouseId) => query('SELECT id FROM rack_bins WHERE warehouse_id = ? ORDER BY id LIMIT 1', [$warehouseId])->fetchColumn() ?: null;

try {
    // ---------- Brands ----------
    $brands = $ids('brands', 'brand_name');
    foreach (['Parker', 'Swagelok', 'ABB', 'Siemens', 'Timken', 'NSK', 'WIKA', 'Honeywell', 'Ansell', 'Bosch', 'Legrand', 'Danfoss'] as $name) {
        if (!isset($brands[$upper($name)])) {
            $brands[$upper($name)] = brand_create(['brandName' => $name])['id'];
            $added['brands']++;
        }
    }

    // ---------- Suppliers ----------
    $suppliers = $ids('suppliers', 'supplier_name');
    foreach ([
        ['Sohar Industrial Trading LLC', 'Sohar', 'Oman', 'OMR', 'sales@sohar-industrial.example', 'Net 30', ['Parker', 'Swagelok']],
        ['Emirates Valve & Fittings FZE', 'Jebel Ali, Dubai', 'United Arab Emirates', 'AED', 'info@evf.example', 'Advance', ['Parker', 'Danfoss']],
        ['Nizwa Safety Equipment Co.', 'Nizwa', 'Oman', 'OMR', 'orders@nizwasafety.example', 'Cash', ['Ansell', 'Honeywell', '3M']],
        ['Global Automation Supplies', 'Doha', 'Qatar', 'QAR', 'quotes@globalauto.example', 'Net 45', ['ABB', 'Siemens', 'Schneider Electric']],
        ['Salalah Engineering Stores', 'Salalah', 'Oman', 'OMR', 'stores@salalah-eng.example', 'Net 30', ['SKF', 'Timken', 'NSK']],
    ] as [$name, $city, $country, $currency, $email, $terms, $brandNames]) {
        if (isset($suppliers[$upper($name)])) {
            continue;
        }
        $suppliers[$upper($name)] = supplier_create([
            'supplierName' => $name, 'address' => $city, 'country' => $country, 'currency' => $currency, 'email' => $email,
            'paymentTerms' => $terms, 'debitLimit' => '5000', 'debitDays' => '30',
            'brandIds' => array_values(array_filter(array_map(static fn ($b) => $brands[$upper($b)] ?? null, $brandNames))),
        ])['id'];
        $added['suppliers']++;
    }

    // ---------- Customers ----------
    $customers = $ids('customers', 'customer_name');
    foreach ([
        ['Petroleum Development Projects LLC', 'Muscat', 'Oman', '10000', '30', '2.5'],
        ['Al Batinah Construction Co.', 'Sohar', 'Oman', '7500', '45', '0'],
        ['Dhofar Power Company', 'Salalah', 'Oman', '15000', '60', '5'],
        ['Gulf Marine Services', 'Duqm', 'Oman', '5000', '30', '0'],
        ['Muscat Facilities Management', 'Muscat', 'Oman', '3000', '15', '1'],
    ] as [$name, $city, $country, $limit, $days, $discount]) {
        if (isset($customers[$upper($name)])) {
            continue;
        }
        customer_create(['customerName' => $name, 'city' => $city, 'address' => $city, 'country' => $country,
            'creditLimit' => $limit, 'creditDays' => $days, 'discountPercent' => $discount, 'salesman' => 'ADMIN']);
        $added['customers']++;
    }

    // ---------- Items ----------
    // [name, unit, sub-category, stock point, [[brand, supplier, cost, selling price, opening stock], …]]
    // The first sourcing row's brand becomes the item's brand; items with two rows have two brands to pick from.
    $existingItems = $ids('items', 'item_name');
    $alMaha = 'Al Maha Industrial Supplies LLC';
    $gulfPneu = 'Gulf Pneumatics Trading';
    $muscatElec = 'Muscat Electrical Co. LLC';
    $arabian = 'Arabian Bearings Est.';
    foreach ([
        ['Gate Valve 2" SS316', 'Pieces', 'Ball Valves', 'Central WH North', [['Swagelok', 'Sohar Industrial Trading LLC', '42.500', '58.000', '12'], ['Parker', 'Emirates Valve & Fittings FZE', '39.750', '55.000', '6']]],
        ['Ball Valve 1" Brass', 'Pieces', 'Ball Valves', 'Central WH North', [['Parker', $gulfPneu, '8.250', '12.500', '40']]],
        ['Solenoid Valve 230V AC 1/2"', 'Pieces', 'Solenoid Valves', 'Central WH North', [['Danfoss', 'Emirates Valve & Fittings FZE', '27.900', '38.000', '15'], ['Parker', $gulfPneu, '29.400', '39.500', '5']]],
        ['Pressure Regulator 0-10 Bar 1/4"', 'Pieces', 'Pressure Regulators', 'Central WH North', [['Parker', $gulfPneu, '18.600', '26.000', '10']]],
        ['Hydraulic Hose 1/2" R2AT', 'Metre', 'Hydraulic Hoses', 'Central WH North', [['Parker', 'Sohar Industrial Trading LLC', '3.150', '4.800', '150']]],
        ['MCCB 100A 3-Pole 36kA', 'Pieces', 'Circuit Breakers', 'Secondary WH South', [['ABB', 'Global Automation Supplies', '64.000', '85.000', '8'], ['Schneider Electric', $muscatElec, '66.500', '88.000', '4']]],
        ['Contactor 32A 24V DC Coil', 'Pieces', 'Contactors', 'Secondary WH South', [['Siemens', 'Global Automation Supplies', '21.300', '29.500', '20'], ['ABB', $muscatElec, '20.900', '29.000', '10']]],
        ['Armoured Cable 4C x 16 sq.mm', 'Metre', 'Cables & Wires', 'Secondary WH South', [['Legrand', $muscatElec, '6.400', '8.900', '500']]],
        ['Tapered Roller Bearing 30208', 'Pieces', 'Bearings', 'Spare Parts Store', [['Timken', 'Salalah Engineering Stores', '9.800', '14.000', '25'], ['SKF', $arabian, '10.400', '14.500', '18']]],
        ['Deep Groove Bearing 6308-2Z', 'Pieces', 'Bearings', 'Spare Parts Store', [['NSK', 'Salalah Engineering Stores', '5.600', '8.200', '30'], ['SKF', $arabian, '6.100', '8.600', '22']]],
        ['Jaw Coupling L100 Spider', 'Pieces', 'Couplings', 'Spare Parts Store', [['Bosch', $alMaha, '4.200', '6.500', '35']]],
        ['Stainless Hex Nut M12 A2-70', 'Box', 'Fasteners', 'Spare Parts Store', [['Bosch', $alMaha, '7.500', '11.000', '20']]],
        ['Safety Helmet Class E White', 'Pieces', 'Helmets & Headgear', 'Secondary WH South', [['Honeywell', 'Nizwa Safety Equipment Co.', '3.900', '6.000', '60'], ['3M', 'Nizwa Safety Equipment Co.', '4.300', '6.500', '40']]],
        ['Cut Resistant Gloves Level 5', 'Pair', 'Gloves', 'Secondary WH South', [['Ansell', 'Nizwa Safety Equipment Co.', '2.750', '4.200', '200']]],
        ['Safety Shoes S3 Size 42', 'Pair', 'Safety Footwear', 'Secondary WH South', [['Honeywell', 'Nizwa Safety Equipment Co.', '14.500', '21.000', '24']]],
        ['Pressure Gauge 0-16 Bar 100mm', 'Pieces', 'Pressure Gauges', 'Central WH North', [['WIKA', $alMaha, '11.200', '16.500', '18'], ['Swagelok', 'Sohar Industrial Trading LLC', '12.900', '18.000', '6']]],
        ['PT100 Temperature Sensor 6mm x 150mm', 'Pieces', 'Temperature Sensors', 'Central WH North', [['WIKA', $alMaha, '16.800', '24.000', '12'], ['Siemens', 'Global Automation Supplies', '18.200', '25.500', '8']]],
        ['Thermostat Controller 0-120°C', 'Pieces', 'Temperature Sensors', 'Central WH North', [['Danfoss', 'Emirates Valve & Fittings FZE', '22.400', '31.000', '7']]],
    ] as [$name, $unit, $subName, $warehouse, $sources]) {
        if (isset($existingItems[$upper($name)])) {
            continue;
        }
        $warehouseId = $warehouses[$upper($warehouse)] ?? null;
        $sourcing = array_map(static fn ($s) => [
            'brandId' => $brands[$upper($s[0])] ?? null, 'supplierId' => $suppliers[$upper($s[1])] ?? null,
            'cost' => $s[2], 'sellingPrice' => $s[3], 'openingStock' => $s[4],
        ], $sources);
        $item = item_create([
            'itemName' => $name, 'uomId' => $uoms[$upper($unit)] ?? null, 'subCategoryId' => $subs[$upper($subName)] ?? null,
            'brandId' => $sourcing[0]['brandId'], 'warehouseId' => $warehouseId, 'rackId' => $warehouseId ? $firstRack($warehouseId) : null,
            'comments' => 'Demo item.', 'sourcing' => $sourcing,
        ]);
        $existingItems[$upper($name)] = $item['id'];
        $added['items']++;
    }
} catch (ValidationError $e) {
    fwrite(STDERR, 'Seed data failed validation: ' . json_encode($e->fields, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
    fwrite(STDERR, 'Added before the failure: ' . json_encode($added) . "\n");
    exit(1);
}

printf("Demo masters topped up: %d brands, %d suppliers, %d customers, %d items added.\n",
    $added['brands'], $added['suppliers'], $added['customers'], $added['items']);
