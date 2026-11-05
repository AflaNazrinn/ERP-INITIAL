<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';

/*
 * Sessions and CSRF. The __Host- cookie prefix needs HTTPS, which Caddy provides
 * (also on localhost). There is no login yet: every visitor gets a session and a
 * CSRF token, and require_login() is the place to switch authentication on later.
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

/* Login is not built yet. Once it is, return the user from $_SESSION and send 401 when there is none. */
function current_user(): ?array
{
    return null;
}

function password_hash_for(string $password): string
{
    return password_hash($password, PASSWORD_DEFAULT);
}
