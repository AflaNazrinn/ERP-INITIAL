<?php
declare(strict_types=1);

/*
 * Required first by every JSON endpoint in backend/public/api/.
 * Sends JSON headers, starts the session, checks the CSRF token on writes,
 * and turns exceptions into JSON errors:
 *   ValidationError → 422 { "error": "...", "fields": { "field": "message" } }
 *   NotFound        → 404 { "error": "..." }
 *   anything else   → 500 { "error": "Something went wrong." } (details only in the PHP log)
 * Success responses are { "data": ... }.
 */

require_once __DIR__ . '/security.php';
require_once __DIR__ . '/master_validation.php';   // ValidationError, NotFound

function json_out(mixed $data, int $status = 200): never
{
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
    // MySQL duplicate key: two people saved the same unique value at once.
    if ($e instanceof PDOException && ($e->errorInfo[1] ?? null) === 1062) {
        json_error('A record with the same code or name already exists.', 409);
    }
    error_log((string) $e);
    json_error('Something went wrong. Please try again.', 500);
});

start_secure_session();

if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)
    && !csrf_valid($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
    json_error('Your session has expired. Reload the page and try again.', 403);
}
