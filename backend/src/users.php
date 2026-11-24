<?php
declare(strict_types=1);

require_once __DIR__ . '/employees.php';
require_once __DIR__ . '/permissions.php';

/*
 * Employee Management › User Setting: a sign-in (username and password) for an employee, whether it may sign in
 * (active), and the modules it may open (permissions, see permissions.php). One login per employee.
 * The user's details (gender, department, designation, employment type, stock point, work location) are the
 * employee's: they come from the employee record and a save writes them back to it.
 * Usernames are unique across every company on this server (sign-in asks for no company code).
 * Role: staff open on the module cards and have no dashboard; managers open on the dashboard.
 * Admins (the company's own sign-in) are not listed or changed here, and nobody changes their own access.
 */

const USER_DETAIL_FIELDS = [
    'gender' => 'gender', 'department' => 'department', 'designation' => 'designation',
    'employmentType' => 'employment_type', 'warehouseId' => 'warehouse_id', 'workLocation' => 'work_location',
];
const USERNAME_PATTERN = '/^[A-Za-z0-9][A-Za-z0-9._@-]{2,49}$/';
const USER_PASSWORD_MIN = 6;

/*
 * The key that encrypts the passwords shown on Edit: PASSWORD_KEY (base64, 32 bytes) when set, else a key file in the
 * storage folder made on first use (readable by the server only). Losing it only means those passwords can no longer
 * be shown (signing in does not use it).
 */
function user_password_key(): string
{
    static $key = null;
    if ($key !== null) {
        return $key;
    }
    $env = env('PASSWORD_KEY', '');
    if ($env !== '') {
        $decoded = base64_decode($env, true);
        if ($decoded === false || strlen($decoded) !== SODIUM_CRYPTO_SECRETBOX_KEYBYTES) {
            throw new RuntimeException('PASSWORD_KEY must be 32 bytes in base64.');
        }
        return $key = $decoded;
    }
    if (!function_exists('sodium_crypto_secretbox_keygen')) {
        throw new RuntimeException('The PHP sodium extension is not enabled (hPanel › PHP Configuration › PHP extensions).');
    }
    $file = rtrim(config()['storage'], '/') . '/password.key';
    if (!is_file($file)) {
        if (!is_dir(dirname($file)) && !@mkdir(dirname($file), 0750, true) && !is_dir(dirname($file))) {
            throw new RuntimeException('The storage folder could not be created for the password key: ' . dirname($file));
        }
        $fresh = sodium_crypto_secretbox_keygen();
        // x: never overwrite a key another request has just written.
        $handle = @fopen($file, 'x');
        if ($handle !== false) {
            fwrite($handle, base64_encode($fresh));
            fclose($handle);
            @chmod($file, 0600);
        } elseif (!is_file($file)) {
            throw new RuntimeException('The password key file could not be written: the storage folder is not writable (' . dirname($file) . ').');
        }
    }
    $decoded = base64_decode(trim((string) @file_get_contents($file)), true);
    if ($decoded === false || strlen($decoded) !== SODIUM_CRYPTO_SECRETBOX_KEYBYTES) {
        throw new RuntimeException('The password key file in the storage folder is damaged.');
    }
    return $key = $decoded;
}

/*
 * The password encrypted for the Edit page, or null when the server cannot encrypt it (no sodium extension, or the
 * storage folder is not writable for the key file). The login still saves: only showing the password on Edit is lost,
 * and the reason goes to the PHP error log.
 */
function user_password_encrypt(string $password): ?string
{
    try {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return base64_encode($nonce . sodium_crypto_secretbox($password, $nonce, user_password_key()));
    } catch (Throwable $e) {
        error_log('User Setting: the password is saved but cannot be shown on Edit: ' . $e->getMessage());
        return null;
    }
}

/* The stored password, or null (none stored, or it cannot be opened with this key). */
function user_password_decrypt(?string $secret): ?string
{
    if ($secret === null || $secret === '') {
        return null;
    }
    if (!function_exists('sodium_crypto_secretbox_open')) {
        return null;
    }
    $raw = base64_decode($secret, true);
    if ($raw === false || strlen($raw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
        return null;
    }
    try {
        $plain = sodium_crypto_secretbox_open(substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), user_password_key());
    } catch (Throwable $e) {
        error_log('User Setting: a saved password cannot be shown: ' . $e->getMessage());
        return null;
    }
    return $plain === false ? null : $plain;
}

/* $withPassword: the Edit page's record (one login, for a user allowed to edit logins); never in the list. */
function user_format(array $row, bool $withPassword = false): array
{
    $employee = $row['employee_id'] !== null ? employee_format(employee_row((int) $row['employee_id'])) : null;
    return [
        'id'          => (int) $row['id'],
        'code'        => $row['username'],
        'name'        => $employee['name'] ?? $row['full_name'],
        'username'    => $row['username'],
        'employeeId'  => $row['employee_id'] !== null ? (int) $row['employee_id'] : null,
        'employee'    => $employee,
        'active'      => (bool) $row['active'],
        'admin'       => (bool) $row['is_admin'],
        'role'        => in_array($row['role'] ?? '', USER_ROLES, true) ? $row['role'] : 'staff',
        'permissions' => (object) permission_clean(json_decode((string) ($row['permissions'] ?? ''), true)),
        'updatedAt'   => date_only($row['updated_at']),
    ] + ($withPassword ? ['password' => user_password_decrypt($row['password_secret'] ?? null)] : []);
}

function user_row(int $id): array
{
    $row = query('SELECT * FROM users WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('User not found.');
    }
    return $row;
}

function user_find(int $id): array
{
    $row = user_row($id);
    $show = !(int) $row['is_admin'];             // only admins reach this page (permissions.php)
    return user_format($row, $show);
}

/* Every login, the admins first (listed, not changed here), then by name. */
function users_list(string $search = '', bool $all = false): array
{
    $rows = query('SELECT * FROM users ORDER BY is_admin DESC, full_name, id')->fetchAll();
    $users = array_map('user_format', $rows);
    if ($search === '') {
        return $users;
    }
    $needle = mb_strtolower($search);
    return array_values(array_filter($users, static fn ($u) =>
        str_contains(mb_strtolower($u['name'] . ' ' . $u['username'] . ' ' . ($u['employee']['code'] ?? '')), $needle)));
}

/* The User popup: every employee, with its login when it has one. */
function users_employees(): array
{
    $logins = [];
    foreach (query('SELECT id, employee_id, username, active FROM users WHERE employee_id IS NOT NULL')->fetchAll() as $row) {
        $logins[(int) $row['employee_id']] = $row;
    }
    $out = [];
    foreach (query('SELECT id, emp_code, first_name, last_name, designation, department, email, status FROM employees ORDER BY first_name, last_name, id')->fetchAll() as $row) {
        $login = $logins[(int) $row['id']] ?? null;
        $out[] = [
            'id'          => (int) $row['id'],
            'code'        => $row['emp_code'],
            'name'        => trim($row['first_name'] . ' ' . $row['last_name']),
            'designation' => $row['designation'],
            'department'  => $row['department'],
            'email'       => $row['email'],
            'status'      => $row['status'],
            'userId'      => $login ? (int) $login['id'] : null,
            'username'    => $login ? $login['username'] : '',
            'active'      => $login ? (bool) $login['active'] : null,
        ];
    }
    return $out;
}

function user_next_code(): string
{
    return '';
}

/* Whether another account on this server (any company) has this username. */
function username_taken(string $username, ?int $exceptId): bool
{
    $current = (string) active_company()['code'];
    foreach (array_keys(company_config()['companies']) as $code) {
        $company = company_find((string) $code);
        if ($company === null) {
            continue;
        }
        if ($company['code'] === $current) {
            if (query('SELECT 1 FROM users WHERE username = ? AND id <> ?', [$username, $exceptId ?? 0])->fetchColumn()) {
                return true;
            }
            continue;
        }
        try {
            $statement = db_connect($company['database'])->prepare('SELECT 1 FROM users WHERE username = ?');
            $statement->execute([$username]);
        } catch (PDOException $e) {
            // Fail closed: a company that cannot be checked could already have this username.
            error_log("User Setting: cannot read the users of company {$company['code']}: " . $e->getMessage());
            throw new Conflict('The usernames of another company could not be checked. Try again later.');
        }
        if ($statement->fetchColumn()) {
            return true;
        }
    }
    return false;
}

/* Admins and your own account are not changed here. */
function user_guard(array $row): void
{
    if ((int) $row['is_admin']) {
        throw new Conflict('An administrator account cannot be changed on User Setting.');
    }
    if ((int) $row['id'] === (int) ($_SESSION['user']['id'] ?? 0)) {
        throw new Conflict("You can't change your own access. Ask your manager or admin.");
    }
}

function user_save(array $data, ?int $id = null): array
{
    $existing = $id !== null ? user_row($id) : null;
    if ($existing !== null) {
        user_guard($existing);
    }
    $in = new Input($data);
    $employeeId = $in->id('employeeId', 'User', 'employees', true);
    if ($employeeId !== null) {
        $other = query('SELECT id FROM users WHERE employee_id = ? AND id <> ?', [$employeeId, $id ?? 0])->fetchColumn();
        if ($other !== false) {
            $in->fail('employeeId', 'This employee already has a login. Pick them again to change it.');
        }
    }
    $username = $in->text('username', 'Username', 50, true);
    if ($username !== '' && !preg_match(USERNAME_PATTERN, $username)) {
        $in->fail('username', 'Use 3 to 50 letters, digits and . _ @ - (starting with a letter or digit).');
    } elseif ($username !== '' && username_taken($username, $id)) {
        $in->fail('username', 'This username is already used. Choose another.');
    }
    $password = is_string($data['password'] ?? null) ? $data['password'] : '';
    if ($password === '' && $existing === null) {
        $in->fail('password', 'Password is required.');
    } elseif ($password !== '' && mb_strlen($password) < USER_PASSWORD_MIN) {
        $in->fail('password', 'Use at least ' . USER_PASSWORD_MIN . ' characters.');
    } elseif (mb_strlen($password) > 200) {
        $in->fail('password', 'Password must be at most 200 characters.');
    }
    $details = [
        'gender'          => $in->choice('gender', 'Gender', EMPLOYEE_GENDERS, ''),
        'department'      => $in->text('department', 'Department', 80, true),
        'designation'     => $in->text('designation', 'Designation', 100, true),
        'employment_type' => $in->choice('employmentType', 'Employment type', EMPLOYEE_TYPES, 'Full-time'),
        'warehouse_id'    => $in->id('warehouseId', 'stock point', 'warehouses'),
        'work_location'   => $in->text('workLocation', 'Work location', 100, true),
    ];
    $active = !array_key_exists('active', $data) || ($data['active'] !== false && $data['active'] !== 0 && $data['active'] !== '0' && $data['active'] !== 'false');
    $role = $in->choice('role', 'Role', USER_ROLES, 'staff');
    $permissions = permission_clean($data['permissions'] ?? []);
    if ($role !== 'manager') {                   // staff have no dashboard and no Employee Management
        $permissions = array_filter($permissions, static fn ($key) => !in_array(strtok($key, '/'), PERMISSION_MANAGER_MODULES, true), ARRAY_FILTER_USE_KEY);
    }
    $in->done();

    $id = transaction(static function () use ($id, $employeeId, $username, $password, $details, $active, $role, $permissions): int {
        query('UPDATE employees SET ' . implode(' = ?, ', array_keys($details)) . ' = ? WHERE id = ?', [...array_values($details), $employeeId]);
        $employee = employee_row($employeeId);
        $row = [
            'employee_id' => $employeeId,
            'username'    => $username,
            'full_name'   => mb_substr(trim($employee['first_name'] . ' ' . $employee['last_name']), 0, 100),
            'active'      => $active ? 1 : 0,
            'role'        => $role,
            'permissions' => json_encode((object) $permissions, JSON_UNESCAPED_SLASHES),
        ];
        if ($password !== '') {
            $row['password_hash'] = password_hash_for($password);
            $row['password_secret'] = user_password_encrypt($password);   // shown on Edit
        }
        if ($id === null) {
            query('INSERT INTO users (' . implode(', ', array_keys($row)) . ') VALUES (' . implode(', ', array_fill(0, count($row), '?')) . ')',
                array_values($row));
            return (int) db()->lastInsertId();
        }
        query('UPDATE users SET ' . implode(' = ?, ', array_keys($row)) . ' = ? WHERE id = ?', [...array_values($row), $id]);
        return $id;
    });
    return user_find($id);
}

/* Removes the login only (the employee stays). */
function user_delete(int $id): void
{
    user_guard(user_row($id));
    delete_row('users', $id, 'User not found.');
}
