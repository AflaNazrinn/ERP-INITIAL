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
    if (!isset($_SESSION['user']['id'], $_SESSION['company'])) {
        return null;
    }
    // The company's name as companyconfig.php has it now, so a renamed company shows its new name
    // without signing out and in again.
    $user = $_SESSION['user'];
    $company = company_find((string) $_SESSION['company']);
    if ($company !== null) {
        $user['company']['name'] = (string) ($company['name'] ?? $company['code']);
    }
    return $user;
}

/* Wrong sign-ins a session may make before it has to wait, and how long (seconds). */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_SECONDS = 60;

/*
 * Checks a username and password. No company code is asked for: usernames are unique across every company
 * on this server (Create a Company refuses one that is taken), so the company is the one whose users table
 * has this username. On success the session gets a new id (so an id known before sign-in is useless after
 * it) and holds the company and the user. Returns the user, or null. A wrong username or password take as
 * long and answer the same, so neither tells which one was wrong (or which usernames exist).
 */
function attempt_login(string $username, string $password): ?array
{
    // A real bcrypt hash of a random password: an unknown username costs the same check as a known one.
    $dummy = '$2y$12$D4EJZkA5kqknHTWRnSGyGeI.6wC36KqWyEhm8WK0.TfQmdor14xi.';
    $found = null;
    $checked = false;
    foreach (array_keys(company_config()['companies']) as $code) {
        $company = company_find((string) $code);
        if ($company === null) {
            continue;
        }
        try {
            use_company($company['code']);
            $row = query('SELECT * FROM users WHERE username = ?', [$username])->fetch();
        } catch (PDOException | RuntimeException $e) {   // one company's database down: the others still sign in
            error_log("Sign-in: cannot read the users of company {$company['code']}: " . $e->getMessage());
            continue;
        }
        if ($row === false) {
            continue;
        }
        $checked = true;
        $matched = password_matches($password, (string) $row['password_hash']);
        if ($matched !== null) {
            $password = $matched;                   // the form that matched: a rehash below keeps it
            $found = [$company, $row];
            break;
        }
    }
    if (!$checked) {
        password_verify($password, $dummy);
    }
    if ($found === null) {
        return null;
    }
    [$company, $row] = $found;
    use_company($company['code']);
    // Turned off on User Setting: the right password still does not sign in (said only after it matched).
    if (isset($row['active']) && !(int) $row['active']) {
        throw new Conflict('This account is turned off. Please contact your manager or admin.');
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

/* Passwords made on Create a Company are saved in capitals (the page types every field in capitals), so a password
   typed in small letters also counts in capitals. Accounts from before that keep their password exactly as set.
   Returns the form of the password that matched (as typed, or in capitals), or null.
   The capitals are tried first: that is how most passwords are saved, so a sign-in usually costs one bcrypt check
   (each takes a noticeable fraction of a second) instead of two. */
function password_matches(string $password, string $hash): ?string
{
    $upper = mb_strtoupper($password);
    foreach ($upper === $password ? [$password] : [$upper, $password] as $form) {
        if (password_verify($form, $hash)) {
            return $form;
        }
    }
    return null;
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
