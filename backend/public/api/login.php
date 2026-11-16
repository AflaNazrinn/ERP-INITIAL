<?php
declare(strict_types=1);

/*
 * Sign in and sign out (the login page and the dashboard's Sign out button).
 *   POST   { company, username, password } → 200 { user, csrfToken }; 401 for a wrong company code,
 *                                   username or password (one message for all three);
 *                                   429 after LOGIN_MAX_ATTEMPTS wrong tries, for LOGIN_LOCK_SECONDS
 *   DELETE                        → signs out; 200 { csrfToken } (a fresh token for the next sign-in)
 * Both need the X-CSRF-Token header from api/session.php, like every write.
 */

const PUBLIC_ENDPOINT = true;
require_once __DIR__ . '/../../src/api_bootstrap.php';

$method = allow_methods('POST', 'DELETE');

if ($method === 'DELETE') {
    logout();
    json_out(['csrfToken' => csrf_token()]);
}

$lockedUntil = (int) ($_SESSION['login_locked_until'] ?? 0);
if ($lockedUntil > time()) {
    json_error('Too many attempts. Wait a minute and try again.', 429);
}

$data = json_input();
$company = is_string($data['company'] ?? null) ? strtoupper(trim(mb_substr($data['company'], 0, 12))) : '';
$username = is_string($data['username'] ?? null) ? trim(mb_substr($data['username'], 0, 50)) : '';
$password = is_string($data['password'] ?? null) ? mb_substr($data['password'], 0, 200) : '';
if ($company === '' || $username === '' || $password === '') {
    json_error('Enter your company code, username and password.', 422, array_filter([
        'company'  => $company === '' ? 'Enter your company code.' : null,
        'username' => $username === '' ? 'Enter your username.' : null,
        'password' => $password === '' ? 'Enter your password.' : null,
    ]));
}

$user = attempt_login($company, $username, $password);
if ($user === null) {
    $_SESSION['login_failures'] = (int) ($_SESSION['login_failures'] ?? 0) + 1;
    if ($_SESSION['login_failures'] >= LOGIN_MAX_ATTEMPTS) {
        $_SESSION['login_failures'] = 0;
        $_SESSION['login_locked_until'] = time() + LOGIN_LOCK_SECONDS;
    }
    json_error('Incorrect company code, username or password.', 401);
}

unset($_SESSION['login_failures'], $_SESSION['login_locked_until']);
json_out(['user' => $user, 'csrfToken' => csrf_token()]);
