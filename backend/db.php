<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/src/company_registry.php';

/*
 * One PDO connection per request, to the database of the company this request works on
 * (active_company() in src/company_registry.php): never to another company's.
 * Real prepared statements, exceptions on error.
 */
function db(): PDO
{
    static $pdo = null;
    static $for = null;
    $company = active_company();
    if ($pdo === null || $for !== $company['code']) {
        $pdo = db_connect($company['database']);
        $for = $company['code'];
    }
    return $pdo;
}

/* Runs a prepared statement and returns it. */
function query(string $sql, array $params = []): PDOStatement
{
    $statement = db()->prepare($sql);
    $statement->execute($params);
    return $statement;
}

/* Runs $work inside a transaction; rolls back and rethrows on any error. */
function transaction(callable $work): mixed
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $result = $work();
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}
