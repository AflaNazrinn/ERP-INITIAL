<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';

/*
 * Sessions, CSRF and sign-in. The __Host- cookie prefix needs HTTPS, which Caddy provides
 * (also on localhost). Every visitor gets a session and a CSRF token; signing in (api/login.php)
 * puts the company and the user in the session, and every API endpoint except the public ones
 * answers 401 until then (api_bootstrap.php). The session's company decides which database
 * db() opens, so a user of one company never reaches another company's data.
 */

function start_secure_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('__Host-auth');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_start();
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_valid(?string $token): bool
{
    return is_string($token) && !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
}

/* The signed-in user ({ id, username, fullName, company: { code, name } }), or null.
   A session without a company (signed in before companies existed) counts as signed out. */
function current_user(): ?array
{
    return isset($_SESSION['user']['id'], $_SESSION['company']) ? $_SESSION['user'] : null;
}

/* Wrong sign-ins a session may make before it has to wait, and how long (seconds). */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_SECONDS = 60;

/*
 * Checks a username and password against the users table of the company's own database. On success the
 * session gets a new id (so an id known before sign-in is useless after it) and holds the company and the
 * user. Returns the user, or null. A wrong company code, username or password all take as long and answer
 * the same, so none tells which one was wrong (or which companies exist).
 */
function attempt_login(string $companyCode, string $username, string $password): ?array
{
    $company = company_find($companyCode);
    if ($company === null) {
        password_verify($password, '$2y$12$D4EJZkA5kqknHTWRnSGyGeI.6wC36KqWyEhm8WK0.TfQmdor14xi.');
        return null;
    }
    use_company($company['code']);
    $row = query('SELECT id, username, full_name, password_hash FROM users WHERE username = ?', [$username])->fetch();
    // A real bcrypt hash of a random password: an unknown username costs the same check as a known one.
    $hash = $row['password_hash'] ?? '$2y$12$D4EJZkA5kqknHTWRnSGyGeI.6wC36KqWyEhm8WK0.TfQmdor14xi.';
    $ok = password_verify($password, $hash) && $row !== false;
    if (!$ok) {
        return null;
    }
    if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
        query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash_for($password), $row['id']]);
    }
    session_regenerate_id(true);
    $_SESSION['company'] = $company['code'];
    $_SESSION['user'] = [
        'id' => (int) $row['id'], 'username' => $row['username'], 'fullName' => $row['full_name'],
        'company' => ['code' => $company['code'], 'name' => (string) ($company['name'] ?? $company['code'])],
    ];
    return $_SESSION['user'];
}

function logout(): void
{
    $_SESSION = [];
    session_regenerate_id(true);
}

function password_hash_for(string $password): string
{
    return password_hash($password, PASSWORD_DEFAULT);
}
