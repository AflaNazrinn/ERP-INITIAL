<?php
declare(strict_types=1);

/*
 * Install check for Hostinger. Upload to public_html/api/check-install.php, open
 * https://<your-domain>/api/check-install.php, read the result, then DELETE the file.
 * It only reads: PHP version and extensions, the backend files the API loads, the database
 * connection, and the tables and columns the 2026-11-09 update added. Passwords are never printed.
 */

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
ini_set('display_errors', '0');

$ok = static fn (string $what) => print("OK    $what\n");
$bad = static fn (string $what) => print("FAIL  $what\n");
$root = dirname(__DIR__, 2);   // public_html/api → the domain folder

echo "Growth Engine install check\n\n";

// 1. PHP
version_compare(PHP_VERSION, '8.2.0', '>=') ? $ok('PHP ' . PHP_VERSION) : $bad('PHP ' . PHP_VERSION . ' (8.2 or newer needed: hPanel > Advanced > PHP Configuration)');
foreach (['pdo_mysql', 'mbstring'] as $ext) {
    extension_loaded($ext) ? $ok("extension $ext") : $bad("extension $ext is not enabled");
}

// 2. Files next to public_html, and that they are today's versions
$files = [
    'config.php' => null, 'db.php' => null, '.env' => null,
    'src/api_bootstrap.php' => 'function serve_master', 'src/master_validation.php' => 'function phone_problem',
    'src/party_records.php' => 'function party_rows_save', 'src/document_storage.php' => 'function post_list',
    'src/party_documents.php' => "'docType'", 'src/brands.php' => 'function brand_save', 'src/uoms.php' => 'function uom_save',
    'src/categories.php' => 'function category_save', 'src/warehouses.php' => 'function warehouse_save',
    'src/items.php' => 'function item_save', 'src/suppliers.php' => 'function supplier_save', 'src/customers.php' => 'function customer_save',
];
foreach ($files as $file => $marker) {
    $path = "$root/$file";
    if (!is_file($path)) {
        $bad("$file is missing (expected at " . basename($root) . "/$file, next to public_html)");
    } elseif ($marker !== null && !str_contains((string) file_get_contents($path), $marker)) {
        $bad("$file is an old version: upload today's copy");
    } else {
        $ok($file);
    }
}

// 3. The backend files load without errors
try {
    require_once "$root/src/master_validation.php";
    $ok('backend files load');
} catch (Throwable $e) {
    $bad('backend files do not load: ' . get_class($e) . ' in ' . basename($e->getFile()) . ' line ' . $e->getLine() . ': ' . $e->getMessage());
    exit;
}

// 4. Database connection (the message is shortened so no password or host details are shown)
try {
    db()->query('SELECT 1');
    $ok('database connection (' . config()['db']['name'] . ')');
} catch (Throwable $e) {
    $code = $e instanceof PDOException ? ($e->errorInfo[1] ?? $e->getCode()) : get_class($e);
    $hint = match (true) {
        str_contains($e->getMessage(), 'Missing required setting') => $e->getMessage() . ' Check the .env file next to config.php.',
        $code === 1045 => 'access denied: DB_USER or DB_PASS in .env is wrong',
        $code === 1049 => 'unknown database: DB_NAME in .env is wrong',
        $code === 2002 => 'cannot reach the database server: DB_HOST should be localhost',
        default => "error $code",
    };
    $bad("database connection: $hint");
    exit;
}

// 5. Tables and columns from the 2026-11-09 update
foreach (['supplier_quotation_items', 'customer_quotation_items', 'supplier_orders', 'customer_orders'] as $table) {
    query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [$table])->fetchColumn() ? $ok("table $table") : $bad("table $table is missing: import migrations/2026_11_09_001_master_fixes.sql");
}
foreach ([['supplier_contacts', 'designation'], ['customer_contacts', 'email'], ['supplier_documents', 'doc_type'], ['customer_documents', 'expiry_date']] as [$table, $column]) {
    query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [$table, $column])->fetchColumn() ? $ok("column $table.$column") : $bad("column $table.$column is missing: import the migration");
}
foreach ([['purchase_orders', 'salesman'], ['purchase_orders', 'contact_number']] as [$table, $column]) {
    query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [$table, $column])->fetchColumn() ? $ok("column $table.$column") : $bad("column $table.$column is missing: import migrations/2026_11_11_001_purchase_order_details.sql");
}
try {
    $applied = query("SELECT 1 FROM schema_migrations WHERE migration = '2026_11_09_001_master_fixes.sql'")->fetchColumn();
    $applied ? $ok('migration recorded in schema_migrations') : print("NOTE  migration not recorded in schema_migrations (harmless; see the deploy README)\n");
} catch (Throwable) {
    print("NOTE  no schema_migrations table (harmless; see the deploy README)\n");
}

// 6. Uploaded documents are written to storage/
$storage = config()['storage'];
is_dir($storage) && is_writable($storage) ? $ok('storage folder is writable') : $bad("storage folder is missing or not writable (create it next to config.php, permissions 755)");

// 7. One real read through the same code the API uses
try {
    require_once "$root/src/brands.php";
    $ok('brands load (' . count(brands_list('', true)) . ' brands), next code ' . brand_next_code());
} catch (Throwable $e) {
    $bad('reading brands: ' . get_class($e) . ' in ' . basename($e->getFile()) . ' line ' . $e->getLine() . ': ' . $e->getMessage());
}

echo "\nDone. Delete public_html/api/check-install.php now.\n";
