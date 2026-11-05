<?php
declare(strict_types=1);

/*
 * Applies the SQL files in backend/migrations/ that have not run yet, in file-name order,
 * and records each in schema_migrations.  Usage: php backend/bin/migrate.php
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}

require_once __DIR__ . '/../db.php';

db()->exec('CREATE TABLE IF NOT EXISTS schema_migrations (
    migration  VARCHAR(190) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

$applied = array_flip(query('SELECT migration FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN));
$files = glob(__DIR__ . '/../migrations/*.sql');
sort($files);

$count = 0;
foreach ($files as $file) {
    $name = basename($file);
    if (isset($applied[$name])) {
        continue;
    }
    // Statements end with ";" at the end of a line; "--" comment lines are dropped first.
    $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($file));
    foreach (preg_split('/;\s*$/m', $sql) as $statement) {
        if (trim($statement) !== '') {
            db()->exec($statement);   // MySQL commits DDL itself, so a failed file stops here for a manual look
        }
    }
    query('INSERT INTO schema_migrations (migration) VALUES (?)', [$name]);
    echo "Applied $name\n";
    $count++;
}
echo $count === 0 ? "Nothing to apply.\n" : "Done: $count migration(s).\n";
