<?php
declare(strict_types=1);

/*
 * Applies the SQL files in backend/migrations/ that have not run yet, to every company's database
 * (each company has its own: see companyconfig.php), and records each in that database's schema_migrations.
 *   php backend/bin/migrate.php                  every company
 *   php backend/bin/migrate.php --company=CODE   one company
 * A new company's database is migrated when it is created, so this is for updates that add a migration.
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../src/migrations.php';

$only = null;
foreach (array_slice($argv, 1) as $argument) {
    if (str_starts_with($argument, '--company=')) {
        $only = strtoupper(substr($argument, 10));
    }
}
$codes = $only !== null ? [$only] : array_keys(company_config()['companies']);
if (!$codes) {
    echo "There are no companies yet: create one on the Create a Company page.\n";
    exit(0);
}

$failed = false;
foreach ($codes as $code) {
    try {
        $company = use_company((string) $code);
        echo "$code ({$company['database']['name']})\n";
        $done = run_migrations(db_connect($company['database']), static fn (string $name) => print("  Applied $name\n"));
        echo $done ? '  Done: ' . count($done) . " migration(s).\n" : "  Nothing to apply.\n";
    } catch (Throwable $e) {
        $failed = true;
        fwrite(STDERR, "  FAILED: {$e->getMessage()}\n");
    }
}
exit($failed ? 1 : 0);
