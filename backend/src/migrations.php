<?php
declare(strict_types=1);

/*
 * Applies the SQL files in backend/migrations/ that have not run yet on one database, in file-name order,
 * and records each in its schema_migrations table. Used by bin/migrate.php (every company) and by
 * company creation (the new company's empty database). Returns the names applied.
 * Statements end with ";" at the end of a line; "--" comment lines are dropped first.
 */
function run_migrations(PDO $pdo, ?callable $log = null): array
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (
        migration  VARCHAR(190) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

    $applied = array_flip($pdo->query('SELECT migration FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN));
    $files = glob(__DIR__ . '/../migrations/*.sql') ?: [];
    sort($files);

    $done = [];
    foreach ($files as $file) {
        $name = basename($file);
        if (isset($applied[$name])) {
            continue;
        }
        $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($file));
        foreach (preg_split('/;\s*$/m', $sql) as $statement) {
            if (trim($statement) !== '') {
                $pdo->exec($statement);   // MySQL commits DDL itself, so a failed file stops here for a manual look
            }
        }
        $pdo->prepare('INSERT INTO schema_migrations (migration) VALUES (?)')->execute([$name]);
        $done[] = $name;
        if ($log) {
            $log($name);
        }
    }
    return $done;
}
