<?php
declare(strict_types=1);

/*
 * Required first by every JSON endpoint in backend/public/api/.
 * Sends JSON headers, starts the session, answers 401 when nobody is signed in
 * (except endpoints that define PUBLIC_ENDPOINT), checks the CSRF token on writes,
 * and turns exceptions into JSON errors:
 *   ValidationError → 422 { "error": "...", "fields": { "field": "message" } }
 *   NotFound        → 404 { "error": "..." }
 *   anything else   → 500 { "error": "Something went wrong." } (details only in the PHP log)
 * Success responses are { "data": ... }. A successful write (POST / PUT / DELETE) also bumps this endpoint's
 * row in data_versions and names it in the X-Data-Version header ("uoms=42"), so other open browsers
 * (polling api/changes.php) reload it and this one knows the change was its own.
 */

require_once __DIR__ . '/security.php';
require_once __DIR__ . '/master_validation.php';   // ValidationError, NotFound

function json_out(mixed $data, int $status = 200): never
{
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true) && !defined('PUBLIC_ENDPOINT') && $status < 400) {
        $name = data_version_name();
        header("X-Data-Version: $name=" . bump_data_version($name));
    }
    http_response_code($status);
    echo json_encode(['data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function json_error(string $message, int $status, array $fields = []): never
{
    http_response_code($status);
    $body = ['error' => $message];
    if ($fields) {
        $body['fields'] = $fields;
    }
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* This endpoint's name in data_versions: its file name ("uoms", "item-documents" …). */
function data_version_name(): string
{
    return basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? 'unknown'), '.php');
}

/* Counts one more change to $name; returns the new version. Never fails the request it belongs to. */
function bump_data_version(string $name): int
{
    try {
        query('INSERT INTO data_versions (name, version) VALUES (?, 1) ON DUPLICATE KEY UPDATE version = version + 1', [$name]);
        return (int) query('SELECT version FROM data_versions WHERE name = ?', [$name])->fetchColumn();
    } catch (Throwable $e) {
        error_log((string) $e);   // e.g. the data_versions migration is not imported yet
        return 0;
    }
}

/* The request body as an array (JSON endpoints only). */
function json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_error('The request body must be a JSON object.', 400);
    }
    return $data;
}

/* Ends the request unless the method is one of $allowed. */
function allow_methods(string ...$allowed): string
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, $allowed, true)) {
        header('Allow: ' . implode(', ', $allowed));
        json_error('Method not allowed.', 405);
    }
    return $method;
}

/* A positive whole-number query parameter, or null. */
function query_id(string $name): ?int
{
    $value = $_GET[$name] ?? null;
    if ($value === null || $value === '') {
        return null;
    }
    if (!ctype_digit((string) $value) || (int) $value < 1) {
        json_error("$name must be a positive whole number.", 400);
    }
    return (int) $value;
}

/* The ?q= search text ('' when absent). */
function query_search(): string
{
    $q = $_GET['q'] ?? '';
    return is_string($q) ? trim(mb_substr($q, 0, 100)) : '';
}

/*
 * The standard master endpoint:
 *   GET            → list (?q= search; ?all=1 also lists inactive records, for the list pages)
 *   GET ?id=N      → one record
 *   GET ?nextCode  → the code the next save will get (preview only)
 *   POST (JSON)    → create; 201 with the saved record, 422 with field errors
 *   PUT ?id=N      → update; only the keys sent change (an import can send a few columns)
 *   DELETE ?id=N   → delete; 409 when other records still use it
 * $save(array $data, ?int $id) creates when $id is null.
 */
function serve_master(callable $list, callable $find, callable $nextCode, callable $save, callable $delete): never
{
    $method = allow_methods('GET', 'POST', 'PUT', 'DELETE');
    if ($method === 'POST' && isset($_GET['bulk'])) {
        json_out(serve_bulk_save($save));
    }
    if ($method === 'POST') {
        json_out($save(json_input(), null), 201);
    }
    if ($method === 'PUT' || $method === 'DELETE') {
        $id = query_id('id') ?? json_error('id is required.', 400);
        if ($method === 'DELETE') {
            $delete($id);
            json_out(['id' => $id]);
        }
        json_out($save(json_input(), $id));
    }
    if (isset($_GET['nextCode'])) {
        json_out(['code' => $nextCode()]);
    }
    $id = query_id('id');
    json_out($id !== null ? $find($id) : $list(query_search(), isset($_GET['all'])));
}

/*
 * POST ?bulk=1 { "records": [ { "id": null | N, "data": { …the usual payload… } }, … ] } → one result per
 * record, in order: { "ok": true, "record": … } or { "ok": false, "error": "...", "fields": {…} }.
 * Each record is saved on its own (one bad row never undoes the others): an import of hundreds of rows
 * is one request instead of one per row. At most BULK_MAX_RECORDS records a request.
 */
const BULK_MAX_RECORDS = 200;

function serve_bulk_save(callable $save): array
{
    $records = json_input()['records'] ?? null;
    if (!is_array($records) || !array_is_list($records)) {
        json_error('records must be a list.', 400);
    }
    if (count($records) > BULK_MAX_RECORDS) {
        json_error('Send at most ' . BULK_MAX_RECORDS . ' records a request.', 413);
    }
    set_time_limit(120);
    $results = [];
    foreach ($records as $entry) {
        $id = $entry['id'] ?? null;
        $data = $entry['data'] ?? null;
        if (!is_array($data) || ($id !== null && (!is_int($id) || $id < 1))) {
            $results[] = ['ok' => false, 'error' => 'Each record needs data (and a whole-number id to update).'];
            continue;
        }
        try {
            $results[] = ['ok' => true, 'record' => $save($data, $id)];
        } catch (ValidationError $e) {
            $results[] = ['ok' => false, 'error' => $e->getMessage(), 'fields' => $e->fields];
        } catch (NotFound | Conflict $e) {
            $results[] = ['ok' => false, 'error' => $e->getMessage()];
        } catch (Throwable $e) {
            $code = $e instanceof PDOException ? ($e->errorInfo[1] ?? null) : null;
            if ($code !== 1062 && $code !== 1451) {
                error_log((string) $e);          // the rows before it are saved; this one is reported
            }
            $results[] = ['ok' => false, 'error' => match ($code) {
                1062    => 'A record with the same code or name already exists.',
                1451    => 'This record is used by other records, so it cannot be changed this way.',
                default => 'Something went wrong saving this row.',
            }];
        }
    }
    return $results;
}

/* What to fix when $e comes from a missing .env, a database that cannot be reached, or a schema that is not up to date; null otherwise. */
function setup_problem(Throwable $e): ?string
{
    if ($e instanceof RuntimeException && str_starts_with($e->getMessage(), 'Missing required setting')) {
        return 'the .env file next to config.php is missing or incomplete (DB_NAME, DB_USER and DB_PASS are needed).';
    }
    if (!$e instanceof PDOException) {
        return null;
    }
    $code = (int) ($e->errorInfo[1] ?? $e->getCode());
    return match ($code) {
        1044       => 'this database user may not open that database: check DB_NAME and DB_USER in .env (full names, with the hosting prefix).',
        1045       => 'the database refused the login: check DB_USER and DB_PASS in .env (full names, with the hosting prefix).',
        1049       => 'the database was not found: check DB_NAME in .env (the full name, with the hosting prefix).',
        2002, 2005 => 'the database server cannot be reached: check DB_HOST in .env (localhost on Hostinger).',
        1146       => 'a database table is missing: import the files in migrations/ (see the deploy guide).',
        1054       => 'the database is not up to date: import the newest file in migrations/ (see the deploy guide).',
        default    => null,
    };
}

// Outside development, PHP warnings go to the error log only, never into a JSON response
// (shared hosts such as Hostinger often ship with display_errors on).
if (env('APP_ENV', 'production') !== 'development') {
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

set_exception_handler(static function (Throwable $e): void {
    if ($e instanceof ValidationError) {
        json_error($e->getMessage(), 422, $e->fields);
    }
    if ($e instanceof NotFound) {
        json_error($e->getMessage(), 404);
    }
    if ($e instanceof Conflict) {
        json_error($e->getMessage(), 409);
    }
    // MySQL duplicate key: two people saved the same unique value at once.
    if ($e instanceof PDOException && ($e->errorInfo[1] ?? null) === 1062) {
        json_error('A record with the same code or name already exists.', 409);
    }
    // Server setup problems name the fix (no secrets: no names, hosts or passwords), so a fresh install on
    // Hostinger does not just say "Something went wrong". The full error still goes to the PHP log.
    if ($setup = setup_problem($e)) {
        error_log((string) $e);
        json_error("Server setup: $setup", 500);
    }
    // MySQL foreign key: the record is still used by other records (an item's unit, a stock point's racks ...).
    if ($e instanceof PDOException && ($e->errorInfo[1] ?? null) === 1451) {
        json_error('This record is used by other records, so it cannot be deleted or changed this way.', 409);
    }
    error_log((string) $e);
    json_error('Something went wrong. Please try again.', 500);
});

start_secure_session();

// Signed in, or 401. session.php and login.php define PUBLIC_ENDPOINT before requiring this file.
if (!defined('PUBLIC_ENDPOINT') && current_user() === null) {
    json_error('Please sign in.', 401);
}

if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)
    && !csrf_valid($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
    json_error('Your session has expired. Reload the page and try again.', 403);
}

// Reads never change the session: release its file lock now, so one user's requests (a list, its lookups,
// the change poll) run side by side instead of waiting for each other.
if (!defined('PUBLIC_ENDPOINT') && in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) {
    session_write_close();
}
