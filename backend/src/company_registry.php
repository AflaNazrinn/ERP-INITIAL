<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';

/*
 * One database per company. backend/companyconfig.php lists the companies and where each one's
 * database is; the program writes it when a company is created (src/company_setup.php), so nobody
 * types a company's database settings by hand.
 *
 * Which company a request works on:
 *   web  → the company the user signed in to ($_SESSION['company'], set by api/login.php)
 *   CLI  → --company=CODE, or the only company when there is just one
 *   code → use_company('CODE') (company creation, the install check)
 * db() (db.php) connects to that company's database and nothing else; storage_dir() is that company's
 * own folder for uploaded files. A session signed in to company A has no way to name company B.
 */

const COMPANY_CONFIG_FILE = __DIR__ . '/../companyconfig.php';
const COMPANY_CODE_PATTERN = '/^[A-Z0-9]{2,12}$/';

/* No company is chosen for this request, or the chosen one is not in companyconfig.php. */
final class CompanyMissing extends RuntimeException {}

/* The server's company settings, with every key present. Writes the file first when it does not exist yet. */
function company_config(bool $reload = false): array
{
    static $config = null;
    if ($config !== null && !$reload) {
        return $config;
    }
    if (!is_file(COMPANY_CONFIG_FILE)) {
        company_config_locked(static function (): void {
            if (!is_file(COMPANY_CONFIG_FILE)) {
                company_config_write(company_config_first());
            }
        });
    }
    // Read from disk every time, never from opcache: a copy cached by another PHP process (or a hand edit
    // made a second ago) must not be read stale and then written back over the newer file.
    $source = file_get_contents(COMPANY_CONFIG_FILE);
    if ($source === false) {
        throw new RuntimeException('Cannot read companyconfig.php.');
    }
    $loaded = (static fn () => eval('?>' . $source))();
    if (!is_array($loaded)) {
        throw new RuntimeException('companyconfig.php must return an array (see companyconfig.example.php).');
    }
    $config = company_config_normalise($loaded);
    return $config;
}

function company_config_normalise(array $c): array
{
    $server = (array) ($c['server'] ?? []);
    return [
        'server' => [
            'host'   => (string) ($server['host'] ?? 'localhost'),
            'port'   => (int) ($server['port'] ?? 3306),
            'user'   => (string) ($server['user'] ?? ''),
            'pass'   => (string) ($server['pass'] ?? ''),
            'prefix' => (string) ($server['prefix'] ?? ''),
        ],
        'spare_databases' => array_values(array_filter((array) ($c['spare_databases'] ?? []), 'is_array')),
        'creation' => [
            'enabled' => (bool) ($c['creation']['enabled'] ?? true),
            'key'     => (string) ($c['creation']['key'] ?? ''),
        ],
        'companies' => (array) ($c['companies'] ?? []),
    ];
}

/*
 * The first companyconfig.php. An install from before companies (one database named in .env) keeps
 * working: that login becomes the server login, and that database becomes company MAIN.
 */
function company_config_first(): array
{
    $config = company_config_normalise([]);
    $user = getenv('DB_USER');
    if ($user === false || $user === '') {
        return $config;
    }
    $config['server'] = [
        'host' => env('DB_HOST', 'localhost'), 'port' => (int) env('DB_PORT', '3306'),
        'user' => $user, 'pass' => env('DB_PASS', ''), 'prefix' => '',
    ];
    $name = getenv('DB_NAME');
    if ($name !== false && $name !== '') {
        try {
            $pdo = db_connect($config['server'] + ['name' => $name]);
            if ($pdo->query("SHOW TABLES LIKE 'users'")->fetchColumn() !== false) {
                $config['companies']['MAIN'] = [
                    'name'       => 'MAIN COMPANY',
                    'database'   => ['host' => $config['server']['host'], 'port' => $config['server']['port'], 'name' => $name, 'user' => $user, 'pass' => $config['server']['pass']],
                    'storage'    => '',          // its uploads stay where they were: the storage folder itself
                    'source'     => 'existing',
                    'created_at' => date('Y-m-d H:i:s'),
                ];
            }
        } catch (Throwable $e) {
            error_log('companyconfig.php: the .env database was not added as a company: ' . $e->getMessage());
        }
    }
    return $config;
}

/* Runs $work with companyconfig.php locked against other writers (other requests creating a company). */
function company_config_locked(callable $work): mixed
{
    $handle = fopen(dirname(COMPANY_CONFIG_FILE) . '/companyconfig.lock', 'c');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        throw new RuntimeException('Cannot lock companyconfig.php: the folder next to config.php must be writable.');
    }
    try {
        return $work();
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

/* Saves the settings (whole file, written to a temporary file first so a reader never sees half of it). */
function company_config_write(array $config): void
{
    $temporary = COMPANY_CONFIG_FILE . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($temporary, company_config_render($config)) === false) {
        throw new RuntimeException('Cannot write companyconfig.php: the folder next to config.php must be writable.');
    }
    chmod($temporary, 0640);
    if (!rename($temporary, COMPANY_CONFIG_FILE)) {
        @unlink($temporary);
        throw new RuntimeException('Cannot replace companyconfig.php.');
    }
    if (function_exists('opcache_invalidate')) {
        opcache_invalidate(COMPANY_CONFIG_FILE, true);   // the next request must read the new list
    }
    company_config(true);
}

function company_config_render(array $c): string
{
    $v = static fn (string $key): string => php_literal($c[$key], 1);
    $date = date('Y-m-d H:i:s');
    return <<<PHP
<?php
/*
 * Growth Engine: the companies on this server and where each one's data is kept.
 *
 * Every company has its own MySQL database. A user of company A signs in to company A's database
 * only; nothing in the program lets that session read or reach company B's database or files.
 *
 * The program writes this file (last on $date): you fill in 'server' once, and the Create a Company
 * page creates each company's database and adds it under 'companies'. Never type a company in by hand.
 *
 * Keep it private: it holds database passwords. It sits outside public_html, .gitignore keeps it out of
 * git and the Hostinger build never packs it. Back it up with the databases: without it nobody can sign in.
 */

return [
    // The MySQL login that creates each new company's database (it needs the CREATE privilege).
    // prefix: put in front of every new database name. Hostinger: your account prefix, e.g. 'u123456789_'.
    'server' => {$v('server')},

    // Only when the server login may not create databases (Hostinger shared hosting): empty databases you
    // made in hPanel > Databases, one for each company still to come. Each new company takes the first one
    // and it is removed from this list. 'user' and 'pass' may be left out when the server login may open it.
    //   ['name' => 'u123456789_company2', 'user' => 'u123456789_company2', 'pass' => 'its password'],
    'spare_databases' => {$v('spare_databases')},

    // The Create a Company page. enabled: false turns it off. key: when not empty, the page asks for this
    // access key, so only people you give it to can create companies.
    'creation' => {$v('creation')},

    // Written by the program: one entry per company, by company code.
    'companies' => {$v('companies')},
];

PHP;
}

/* A PHP literal for a value (short arrays, 4-space indent). */
function php_literal(mixed $value, int $depth = 0): string
{
    if (!is_array($value)) {
        return var_export($value, true);
    }
    if ($value === []) {
        return '[]';
    }
    $pad = str_repeat('    ', $depth + 1);
    $list = array_is_list($value);
    $out = "[\n";
    foreach ($value as $key => $item) {
        $out .= $pad . ($list ? '' : var_export($key, true) . ' => ') . php_literal($item, $depth + 1) . ",\n";
    }
    return $out . str_repeat('    ', $depth) . ']';
}

/* A company by code (any case), with 'code' added; null when there is none. */
function company_find(string $code): ?array
{
    $code = strtoupper(trim($code));
    if (!preg_match(COMPANY_CODE_PATTERN, $code)) {
        return null;
    }
    $entry = company_config()['companies'][$code] ?? null;
    return is_array($entry) && is_array($entry['database'] ?? null) ? ['code' => $code] + $entry : null;
}

/* Makes $code the company this request (or CLI run) works on. Throws CompanyMissing for an unknown code. */
function use_company(string $code): array
{
    $company = company_find($code) ?? throw new CompanyMissing("There is no company $code.");
    $GLOBALS['ge_company'] = $company;
    return $company;
}

/* The company this request works on (see the top of this file). */
function active_company(): array
{
    if (isset($GLOBALS['ge_company'])) {
        return $GLOBALS['ge_company'];
    }
    if (PHP_SAPI === 'cli') {
        try {
            return use_company(cli_company_code());
        } catch (CompanyMissing $e) {
            fwrite(STDERR, $e->getMessage() . "\n");
            exit(1);
        }
    }
    $code = $_SESSION['company'] ?? null;
    if (!is_string($code) || ($company = company_find($code)) === null) {
        throw new CompanyMissing('No company is signed in.');
    }
    return $company;
}

/* --company=CODE from the command line, or the only company there is. */
function cli_company_code(): string
{
    foreach ($GLOBALS['argv'] ?? [] as $argument) {
        if (str_starts_with($argument, '--company=')) {
            return substr($argument, 10);
        }
    }
    $codes = array_keys(company_config()['companies']);
    if (count($codes) === 1) {
        return (string) $codes[0];
    }
    throw new CompanyMissing($codes
        ? 'Choose the company: add --company=CODE (' . implode(', ', $codes) . ').'
        : 'There are no companies yet: create one on the Create a Company page.');
}

/* This company's folder for uploaded files (created on first use by whoever stores a file). */
function storage_dir(): string
{
    $company = active_company();
    $folder = $company['storage'] ?? ('companies/' . $company['code']);
    return rtrim(config()['storage'], '/') . ($folder === '' ? '' : '/' . trim((string) $folder, '/'));
}

/* A PDO connection to a database login (host, port, user, pass; name is left out to connect to the server only). */
function db_connect(array $c): PDO
{
    $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $c['host'] ?? 'localhost', (int) ($c['port'] ?? 3306));
    if (($c['name'] ?? '') !== '') {
        $dsn .= ';dbname=' . $c['name'];
    }
    return new PDO($dsn, (string) ($c['user'] ?? ''), (string) ($c['pass'] ?? ''), [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
}
