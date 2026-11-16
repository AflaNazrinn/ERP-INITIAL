<?php
declare(strict_types=1);

/*
 * Install check for Hostinger. Upload to public_html/api/check-install.php, open
 * https://<your-domain>/api/check-install.php, read the result, then DELETE the file.
 * It only reads: PHP version and extensions, the backend files the API loads, companyconfig.php (the
 * server login, and each company's own database), and the tables and columns of each company's
 * database. Passwords are never printed.
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
    'config.php' => null, 'db.php' => 'active_company', 'src/company_registry.php' => 'function use_company',
    'src/company_setup.php' => 'function company_create', 'src/migrations.php' => 'function run_migrations',
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

// 4. companyconfig.php: the server login, and every company's own database
try {
    $config = company_config();
    $ok('companyconfig.php (' . count($config['companies']) . ' companies)');
} catch (Throwable $e) {
    $bad('companyconfig.php: ' . $e->getMessage());
    exit;
}
if ($config['server']['user'] === '') {
    $bad("companyconfig.php: 'server' has no user yet: fill in the MySQL login that creates company databases");
} else {
    try {
        db_connect($config['server'])->query('SELECT 1');
        $ok('server login (' . $config['server']['user'] . ')');
    } catch (Throwable $e) {
        $code = $e instanceof PDOException ? ($e->errorInfo[1] ?? $e->getCode()) : get_class($e);
        $bad("server login: error $code (check user, pass and host under 'server' in companyconfig.php)");
    }
}
print('NOTE  ' . count($config['spare_databases']) . " spare database(s) left for new companies (needed only where the server login may not CREATE DATABASE)\n");
print('NOTE  Create a Company page is ' . ($config['creation']['enabled'] ? 'on' : 'off') . ($config['creation']['key'] !== '' ? ', with an access key' : ', without an access key') . "\n");

$companies = array_keys($config['companies']);
if (!$companies) {
    print("NOTE  no companies yet: open https://<your-domain>/company.html to create the first one\n");
}
foreach ($companies as $companyCode) {
    echo "\nCompany $companyCode\n";
    try {
        use_company((string) $companyCode);
        db()->query('SELECT 1');
        $ok('database connection (' . active_company()['database']['name'] . ')');
    } catch (Throwable $e) {
        $code = $e instanceof PDOException ? ($e->errorInfo[1] ?? $e->getCode()) : get_class($e);
        $bad('database connection: ' . match ($code) {
            1045 => "access denied: check this company's user and pass in companyconfig.php",
            1049 => "unknown database: check this company's database name in companyconfig.php",
            2002 => 'cannot reach the database server: host should be localhost',
            default => "error $code",
        });
        continue;
    }
    foreach (['users', 'items', 'company_profile', 'data_versions'] as $table) {
        query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [$table])->fetchColumn()
            ? $ok("table $table") : $bad("table $table is missing: run php bin/migrate.php --company=$companyCode");
    }
    $storage = storage_dir();
    is_dir($storage) ? (is_writable($storage) ? $ok('storage folder is writable') : $bad("storage folder is not writable")) : print("NOTE  no uploaded files yet\n");
    try {
        require_once "$root/src/brands.php";
        $ok('brands load (' . count(brands_list('', true)) . ' brands), next code ' . brand_next_code());
    } catch (Throwable $e) {
        $bad('reading brands: ' . get_class($e) . ' in ' . basename($e->getFile()) . ' line ' . $e->getLine() . ': ' . $e->getMessage());
    }
}
echo "\n";

// 5. Uploaded documents are written under storage/ (one folder per company)
$storage = config()['storage'];
is_dir($storage) && is_writable($storage) ? $ok('storage folder is writable') : $bad("storage folder is missing or not writable (create it next to config.php, permissions 755)");

echo "\nDone. Delete public_html/api/check-install.php now.\n";
