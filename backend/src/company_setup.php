<?php
declare(strict_types=1);

require_once __DIR__ . '/master_validation.php';
require_once __DIR__ . '/migrations.php';

/*
 * Create a Company (frontend/company.html → api/companies.php). One request does it all, or nothing:
 *   1. checks every field and file, and refuses a duplicate: a company already on this server with the same
 *      code, name (ignoring case, spaces and punctuation), CR number or VAT reg. number, and a username or
 *      password that any company's user already has
 *   2. gets the company its own database, named after the company (Bluesun International → <prefix>ge_bluesun_international):
 *      CREATE DATABASE with the server login from companyconfig.php, or, where the host does not allow that
 *      (Hostinger shared hosting), the first empty database listed under 'spare_databases'
 *   3. where the server allows it, a MySQL login of its own with the same name, that may open that database only
 *   4. creates the tables (every migration), the company's first user and its company_profile row
 *   5. stores the logo, letterhead and certificates in the company's own storage folder
 *   6. adds the company to companyconfig.php
 * Any failure undoes the steps before it (the database is dropped, or a spare one emptied again).
 */

const COMPANY_TYPES = ['Main Company', 'Branch', 'Subsidiary', 'Sister Concern'];
const BUSINESS_TYPES = ['Trading', 'Manufacturing', 'Services', 'Contracting', 'Retail', 'Distribution', 'IT', 'Others'];
const LEGAL_STRUCTURES = ['LLC', 'SAOC', 'SAOG', 'Sole Proprietorship', 'Partnership', 'Branch of Foreign Company', 'Free Zone Company'];
// The same currencies as the other modules (PB_CURRENCIES in purchase_book.php, PO_CURRENCIES in dashboard.js).
const CURRENCIES = ['OMR', 'AED', 'INR', 'SAR', 'QAR', 'KWD', 'BHD', 'USD', 'EUR', 'GBP', 'PKR', 'EGP', 'JOD', 'TRY', 'CNY', 'JPY', 'KRW'];

/* The four files: form field => [label, allowed extensions, max bytes, profile column prefix, required].
   The logo and letterhead are required; the CR and VAT certificates may be added later. */
const COMPANY_FILES = [
    'logo'           => ['Company logo', ['png', 'jpg', 'jpeg', 'svg'], 2 * 1024 * 1024, 'logo', true],
    'letterhead'     => ['Letterhead', ['pdf', 'png', 'jpg', 'jpeg'], 10 * 1024 * 1024, 'letterhead', true],
    'crCertificate'  => ['CR certificate', ['pdf', 'png', 'jpg', 'jpeg'], 10 * 1024 * 1024, 'cr_certificate', false],
    'vatCertificate' => ['VAT certificate', ['pdf', 'png', 'jpg', 'jpeg'], 10 * 1024 * 1024, 'vat_certificate', false],
    // The seal printed on Purchase Book PDFs (Attach Seal): stored as company/seal.png|jpg, where api/company-seal.php reads it.
    'seal'           => ['Company seal', ['png', 'jpg', 'jpeg'], 2 * 1024 * 1024, 'seal', false],
];

const COMPANY_CREATIONS_PER_HOUR = 3;   // per browser session
// "This username / password is already used" answers per IP address an hour: the page is open to anyone, so
// without a limit it could be used to try out passwords against every account on the server.
const COMPANY_LOGIN_REFUSALS_PER_HOUR = 10;
const COMPANY_CODE_FALLBACK_PREFIX = 'CO';   // a name without two Latin letters (e.g. only Arabic): CO0001 …

/* What the page needs before it opens: may companies be created here, is an access key asked for, and the
   code a company of this name gets when its code is left automatic (a preview: it is assigned when the company
   is saved). */
function company_creation_settings(string $name = ''): array
{
    $config = company_config();
    $creation = $config['creation'];
    return ['enabled' => $creation['enabled'], 'keyRequired' => $creation['key'] !== '', 'nextCode' => company_next_code($config, $name)];
}

/* The two letters an automatic code starts with: the first two letters of the company name
   ("Bluesun International" → BL, "3M Oman" → MO), or CO when the name has fewer than two Latin letters. */
function company_code_prefix(string $name): string
{
    $letters = preg_replace('/[^A-Z]/', '', strtoupper($name));
    return strlen($letters) >= 2 ? substr($letters, 0, 2) : COMPANY_CODE_FALLBACK_PREFIX;
}

/* The next automatic code for a company of this name: its two letters + one more than the highest number
   those letters have so far, 4 digits (BL0001, BL0002 …; another name's letters count on their own). */
function company_next_code(array $config, string $name): string
{
    $prefix = company_code_prefix($name);
    $highest = 0;
    foreach (array_keys($config['companies']) as $code) {
        if (preg_match('/^' . $prefix . '(\d+)$/', (string) $code, $match)) {
            $highest = max($highest, (int) $match[1]);
        }
    }
    return $prefix . str_pad((string) ($highest + 1), 4, '0', STR_PAD_LEFT);
}

/* Creates the company from the multipart form; returns { code, name }. */
function company_create(array $post, array $files): array
{
    $creation = company_config()['creation'];
    if (!$creation['enabled']) {
        throw new Conflict('Creating companies is turned off on this server.');
    }
    // The page types every field in capitals, the access key too: compared without regard to case.
    if ($creation['key'] !== '' && !hash_equals(mb_strtoupper($creation['key']), mb_strtoupper((string) ($post['accessKey'] ?? '')))) {
        throw new ValidationError(['accessKey' => 'The access key is not right.']);
    }
    $recent = array_filter((array) ($_SESSION['company_creations'] ?? []), static fn ($t) => $t > time() - 3600);
    if (count($recent) >= COMPANY_CREATIONS_PER_HOUR) {
        throw new Conflict('Too many companies created from this browser. Try again in an hour.');
    }

    // Left automatic (codeAuto=1): the server gives the code, as it does for every other record. It is taken
    // again under the lock below, so two companies created at the same moment never get the same one.
    $autoCode = ($post['codeAuto'] ?? '') === '1';
    if ($autoCode) {
        $post['companyCode'] = company_next_code(company_config(true), (string) ($post['companyName'] ?? ''));
    }

    $errors = [];                                            // fields and files are reported together
    try {
        [$profile, $account] = company_validate($post);
    } catch (ValidationError $e) {
        $errors = $e->fields;
    }
    try {
        $uploads = company_validate_files($files);
    } catch (ValidationError $e) {
        $errors += $e->fields;
    }
    if ($errors) {
        throw new ValidationError($errors);
    }
    $code = $profile['company_code'];

    return company_config_locked(static function () use ($profile, $account, $uploads, $code, $recent, $autoCode): array {
        $config = company_config(true);
        if ($autoCode) {
            $code = $profile['company_code'] = company_next_code($config, $profile['company_name']);
        }
        if (isset($config['companies'][$code])) {
            throw new ValidationError(['companyCode' => "Company code $code is already used. Choose another."]);
        }
        // No duplicate companies: checked here, under the lock, so two people creating the same company at the
        // same moment cannot both get through (the second sees the first).
        if ($duplicates = company_duplicates($config, $profile)) {
            throw new ValidationError($duplicates);
        }
        company_check_login_unique($config, $account);

        $undo = [];
        try {
            [$database, $source, $spareIndex] = company_allocate_database($config, $code, $profile['company_name'], $undo);
            $pdo = db_connect($database);
            run_migrations($pdo);

            // A new database has only the user the person creating it chose (the admin seeded by a migration goes).
            $pdo->exec('DELETE FROM users');
            $pdo->prepare('INSERT INTO users (username, full_name, password_hash, is_admin) VALUES (?, ?, ?, 1)')
                ->execute([$account['username'], 'Administrator', password_hash($account['password'], PASSWORD_DEFAULT)]);

            $folder = 'companies/' . $code;
            $directory = rtrim(config()['storage'], '/') . '/' . $folder;
            if (is_dir($directory)) {
                throw new RuntimeException("The storage folder for $code already exists; remove it or choose another code (see companyconfig.php).");
            }
            if (!mkdir("$directory/company", 0750, true)) {
                throw new RuntimeException("Cannot create the storage folder $folder: the storage folder must be writable.");
            }
            $undo[] = static fn () => company_remove_folder($directory);
            foreach ($uploads as $key => $file) {
                $column = COMPANY_FILES[$key][3];
                $stored = "company/$column." . $file['extension'];
                if (!move_uploaded_file($file['tmp_name'], "$directory/$stored")) {
                    throw new RuntimeException('Could not store the uploaded file.');
                }
                if ($key === 'seal') {
                    continue;                             // no profile column: the file itself is the seal
                }
                $profile["{$column}_path"] = $stored;
                $profile["{$column}_name"] = $file['name'];
            }

            $columns = array_keys($profile);
            $pdo->prepare('INSERT INTO company_profile (id, ' . implode(', ', $columns) . ') VALUES (1, '
                . implode(', ', array_fill(0, count($columns), '?')) . ')')->execute(array_values($profile));

            if ($spareIndex !== null) {
                array_splice($config['spare_databases'], $spareIndex, 1);
            }
            $config['companies'][$code] = [
                'name'       => $profile['company_name'],
                // Kept here (not only in the company's own database) so the duplicate check never opens another company's database.
                'cr_number'  => $profile['cr_number'],
                'vat_number' => $profile['vat_reg_number'],
                'username'   => $account['username'],      // its first user (usernames are unique across companies)
                'database'   => $database,
                'storage'    => $folder,
                'source'     => $source,
                'created_at' => date('Y-m-d H:i:s'),
            ];
            company_config_write($config);
        } catch (Throwable $e) {
            foreach (array_reverse($undo) as $step) {
                try {
                    $step();
                } catch (Throwable $cleanup) {
                    error_log('Undoing a failed company creation: ' . $cleanup->getMessage());
                }
            }
            throw $e;
        }

        $_SESSION['company_creations'] = [...$recent, time()];
        return ['code' => $code, 'name' => $profile['company_name']];
    });
}

/* A name or number as compared for duplicates: capitals, letters and digits only
   ("Bluesun International L.L.C." and "BLUESUN INTERNATIONAL LLC" are the same company). */
function company_identity(?string $value): string
{
    return preg_replace('/[^A-Z0-9]/', '', mb_strtoupper((string) $value)) ?? '';
}

/*
 * Field errors when a company already on this server has the same name, CR number or VAT reg. number; [] when
 * there is none. The other company is not named: the page is open to anyone, before sign-in.
 */
function company_duplicates(array $config, array $profile): array
{
    $checks = [
        'companyName' => [company_identity($profile['company_name']), 'name', 'A company with this name already exists on this server.'],
        'crNumber'    => [company_identity($profile['cr_number']), 'cr_number', 'A company with this CR number already exists on this server.'],
        'vatNumber'   => [company_identity($profile['vat_reg_number']), 'vat_number', 'A company with this VAT reg. number already exists on this server.'],
    ];
    $errors = [];
    foreach ($config['companies'] as $company) {
        foreach ($checks as $field => [$value, $key, $message]) {
            if ($value !== '' && !isset($errors[$field]) && company_identity($company[$key] ?? null) === $value) {
                $errors[$field] = $message;
            }
        }
    }
    return $errors;
}

/*
 * Every user on this server has a username and a password no other user has, in any company. Throws
 * ValidationError (username / password) when the new account's are already used. The other account and its
 * company are not named. Runs under the companyconfig.php lock, as creation does.
 */
function company_check_login_unique(array $config, array $account): void
{
    $file = rtrim(config()['storage'], '/') . '/company-login-refusals.json';
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'cli');
    $log = is_file($file) ? (json_decode((string) file_get_contents($file), true) ?: []) : [];
    $log = array_filter(array_map(
        static fn ($times) => array_values(array_filter((array) $times, static fn ($t) => $t > time() - 3600)),
        $log
    ));
    if (count($log[$ip] ?? []) >= COMPANY_LOGIN_REFUSALS_PER_HOUR) {
        throw new Conflict('Too many usernames or passwords were refused. Try again in an hour.');
    }

    $username = mb_strtolower($account['username']);
    $errors = [];
    foreach ($config['companies'] as $company) {
        try {
            $users = db_connect($company['database'])->query('SELECT username, password_hash FROM users')->fetchAll();
        } catch (PDOException $e) {
            // Fail closed: a company that cannot be checked could already have this username or password.
            error_log('Create a Company: cannot read the users of company ' . ($company['database']['name'] ?? '?') . ': ' . $e->getMessage());
            throw new RuntimeException('the users of an existing company could not be checked (see the server log). Try again later.');
        }
        foreach ($users as $user) {
            if (!isset($errors['username']) && mb_strtolower((string) $user['username']) === $username) {
                $errors['username'] = 'This username is already used. Choose another.';
            }
            if (!isset($errors['password']) && password_verify($account['password'], (string) $user['password_hash'])) {
                $errors['password'] = 'This password is already used by another account. Choose a different one.';
            }
        }
        if (count($errors) === 2) {
            break;
        }
    }
    if (!$errors) {
        return;
    }
    $log[$ip] = [...($log[$ip] ?? []), time()];
    if (!is_dir(dirname($file))) {
        @mkdir(dirname($file), 0750, true);
    }
    @file_put_contents($file, json_encode($log));
    throw new ValidationError($errors);
}

/* The company name as a database name: letters and digits, words joined by _ ("Bluesun Int'l L.L.C." → bluesun_int_l_l_l_c). */
function company_database_slug(string $companyName, string $code): string
{
    $ascii = function_exists('iconv') ? (string) @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $companyName) : $companyName;
    $slug = trim((string) preg_replace('/[^a-z0-9]+/', '_', strtolower($ascii)), '_');
    return $slug !== '' ? $slug : strtolower($code);          // e.g. a name in Arabic letters only
}

/* $base, then $base_2, $base_3 …, each cut to $max characters. */
function company_name_candidates(string $base, int $max): array
{
    $names = [rtrim(substr($base, 0, $max), '_')];
    for ($n = 2; $n <= 20; $n++) {
        $names[] = rtrim(substr($base, 0, $max - strlen("_$n")), '_') . "_$n";
    }
    return $names;
}

/* The form's fields as [company_profile row, { username, password }]; throws ValidationError. */
function company_validate(array $post): array
{
    $in = new Input($post);
    $name = $in->name('companyName', 'Company name', 150);
    $code = strtoupper($in->text('companyCode', 'Company code', 12, true));
    if ($code !== '' && !preg_match(COMPANY_CODE_PATTERN, $code)) {
        $in->fail('companyCode', 'Company code must be 2 to 12 letters or digits, no spaces.');
    }
    $choice = static function (string $key, string $label, array $allowed, ?string $default) use ($in, $post): ?string {
        $value = trim((string) ($post[$key] ?? ''));
        if ($value === '') {
            return $default;
        }
        if (!in_array($value, $allowed, true)) {
            $in->fail($key, "Choose a $label from the list.");
        }
        return $value;
    };
    $vat = ($post['vatApplicable'] ?? '1') !== '0';
    $percentage = $vat ? $in->decimal('vatPercentage', 'VAT percentage', 5, 2, true, '100') : null;
    $swift = strtoupper($in->text('swiftCode', 'SWIFT code', 11));
    if ($swift !== '' && !preg_match('/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/', $swift)) {
        $in->fail('swiftCode', 'A SWIFT code has 8 or 11 letters and digits (e.g. BMUSOMRX).');
    }
    $website = $in->text('website', 'Website', 150);
    if ($website !== '' && !preg_match('#^(https?://)?([a-z0-9-]+\.)+[a-z]{2,}(/\S*)?$#i', $website)) {
        $in->fail('website', 'Enter a website like www.example.com.');
    }
    $iban = strtoupper(str_replace(' ', '', $in->text('iban', 'IBAN', 40)));
    if ($iban !== '' && !preg_match('/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/', $iban)) {
        $in->fail('iban', 'An IBAN starts with the country letters and two digits (e.g. OM81…).');
    }

    $profile = [
        'company_code'         => $code,
        'company_name'         => $name,
        'company_type'         => $choice('companyType', 'company type', COMPANY_TYPES, 'Main Company'),
        'business_type'        => $choice('businessType', 'business type', BUSINESS_TYPES, 'Trading'),
        'cr_number'            => $in->text('crNumber', 'CR number', 30) ?: null,
        'cr_expiry_date'       => $in->date('crExpiry', 'CR expiry date'),
        'vat_reg_number'       => strtoupper($in->text('vatNumber', 'VAT reg. number', 30)) ?: null,
        'legal_structure'      => $choice('legalStructure', 'legal structure', LEGAL_STRUCTURES, null),
        'base_currency'        => $choice('baseCurrency', 'currency', CURRENCIES, 'OMR'),
        'financial_year_start' => $in->date('financialYearStart', 'Financial year start'),
        'vat_applicable'       => $vat ? 1 : 0,
        'vat_percentage'       => $percentage,
        'building'             => $in->text('building', 'Building / office no.', 100) ?: null,
        'street'               => $in->text('street', 'Street', 150) ?: null,
        'area'                 => $in->text('area', 'Area', 100) ?: null,
        'city'                 => $in->text('city', 'City', 100) ?: null,
        'country'              => $in->text('country', 'Country', 80) ?: null,
        'po_box'               => $in->text('poBox', 'P O Box', 20) ?: null,
        'postal_code'          => $in->text('postalCode', 'Postal code', 20) ?: null,
        'phone'                => $in->phone('phone', 'Phone') ?: null,
        'email'                => $in->email('email', 'Email') ?: null,
        'website'              => $website ?: null,
        'bank_name'            => $in->text('bankName', 'Bank name', 100) ?: null,
        'account_holder'       => $in->text('accountHolder', 'Account holder', 150) ?: null,
        'account_number'       => $in->text('accountNumber', 'Account number', 40) ?: null,
        'iban'                 => $iban ?: null,
        'swift_code'           => $swift ?: null,
        // The quotation's General Terms & Conditions (blank: the standard terms are printed).
        'terms_conditions'     => $in->text('termsConditions', 'Terms & conditions', 20000) ?: null,
    ];

    $username = $in->text('username', 'Username', 50, true);
    if ($username !== '' && !preg_match('/^[A-Za-z0-9._@-]{3,50}$/', $username)) {
        $in->fail('username', 'Username: 3 to 50 letters, digits or . _ @ - (no spaces).');
    }
    $password = mb_strtoupper((string) ($post['password'] ?? ''));   // in capitals, as the page types it
    if (mb_strlen($password) < 8) {
        $in->fail('password', 'The password needs at least 8 characters.');
    } elseif (mb_strlen($password) > 200) {
        $in->fail('password', 'The password must be at most 200 characters.');
    }
    if (mb_strtoupper((string) ($post['confirmPassword'] ?? '')) !== $password) {
        $in->fail('confirmPassword', 'The two passwords are not the same.');
    }
    $in->done();
    return [$profile, ['username' => $username, 'password' => $password]];
}

/* The uploads, checked: key => { tmp_name, name, extension }. A required file that is missing is an error;
   an optional one (the certificates) is simply left out. */
function company_validate_files(array $files): array
{
    $errors = [];
    $valid = [];
    foreach (COMPANY_FILES as $key => [$label, $allowed, $max, , $required]) {
        $file = $files[$key] ?? null;
        if (!is_array($file) || is_array($file['name'] ?? null) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            if ($required) {
                $errors[$key] = "$label is required.";
            }
            continue;
        }
        $extension = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
        if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
            $errors[$key] = "$label could not be uploaded" . ($file['error'] === UPLOAD_ERR_INI_SIZE ? ' (too large for this server).' : '.');
        } elseif (!in_array($extension, $allowed, true)) {
            $errors[$key] = "$label must be " . strtoupper(implode(', ', array_diff($allowed, ['jpeg']))) . '.';
        } elseif ($file['size'] > $max) {
            $errors[$key] = "$label must be at most " . ($max / 1024 / 1024) . ' MB.';
        } elseif (!company_file_content_matches($file['tmp_name'], $extension)) {
            $errors[$key] = "$label is not a real " . strtoupper($extension) . ' file.';
        } else {
            $valid[$key] = [
                'tmp_name'  => $file['tmp_name'],
                'name'      => mb_substr(basename(str_replace('\\', '/', (string) $file['name'])), 0, 255),
                'extension' => $extension === 'jpeg' ? 'jpg' : $extension,
            ];
        }
    }
    if ($errors) {
        throw new ValidationError($errors);
    }
    return $valid;
}

/* The file is what its name says: an image really is one, a PDF starts like one, an SVG has no scripts. */
function company_file_content_matches(string $path, string $extension): bool
{
    $head = (string) file_get_contents($path, false, null, 0, 1024);
    return match ($extension) {
        'pdf'         => str_starts_with($head, '%PDF'),
        'png'         => (@getimagesize($path)['mime'] ?? '') === 'image/png',
        'jpg', 'jpeg' => (@getimagesize($path)['mime'] ?? '') === 'image/jpeg',
        'svg'         => (bool) preg_match('/<svg[\s>]/i', (string) file_get_contents($path))
                         && !preg_match('/<script|\bon\w+\s*=|javascript:|<foreignObject/i', (string) file_get_contents($path)),
        default       => false,
    };
}

/*
 * The new company's database: [login { host, port, name, user, pass }, source 'created' | 'spare', spare index].
 * Adds the steps that undo it to $undo.
 */
function company_allocate_database(array $config, string $code, string $companyName, array &$undo): array
{
    $server = $config['server'];
    $refused = null;
    if ($server['user'] !== '') {
        if (!preg_match('/^[A-Za-z0-9_]{0,40}$/', $server['prefix'])) {
            throw new RuntimeException("The database prefix in companyconfig.php may only have letters, digits and _ .");
        }
        $root = db_connect($server);
        $registered = array_map(static fn ($c) => $c['database']['name'] ?? '', $config['companies']);
        // Named after the company; a name already taken on the server (an old database) gets _2, _3 …
        foreach (company_name_candidates($server['prefix'] . 'ge_' . company_database_slug($companyName, $code), 64) as $name) {
            if (in_array($name, $registered, true)) {
                continue;
            }
            try {
                $root->exec("CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                $undo[] = static fn () => $root->exec("DROP DATABASE IF EXISTS `$name`");
                $login = ['host' => $server['host'], 'port' => $server['port'], 'name' => $name, 'user' => $server['user'], 'pass' => $server['pass']];
                return [company_own_login($root, $login, $undo), 'created', null];
            } catch (PDOException $e) {
                $error = (int) ($e->errorInfo[1] ?? 0);
                if ($error === 1007) {
                    continue;                                // that name exists: try the next one
                }
                if (!in_array($error, [1044, 1045, 1142, 1227], true)) {
                    throw $e;
                }
                $refused = $e;                               // not allowed here: use a spare database
                break;
            }
        }
        if ($refused === null) {
            throw new RuntimeException('every database name for this company is taken on the server.');
        }
    }

    $used = array_map(static fn ($c) => $c['database']['name'] ?? '', $config['companies']);
    foreach ($config['spare_databases'] as $index => $spare) {
        $name = (string) ($spare['name'] ?? '');
        if ($name === '' || in_array($name, $used, true)) {
            continue;
        }
        $login = [
            'host' => (string) ($spare['host'] ?? $server['host']), 'port' => (int) ($spare['port'] ?? $server['port']), 'name' => $name,
            'user' => (string) ($spare['user'] ?? $server['user']), 'pass' => (string) ($spare['pass'] ?? $server['pass']),
        ];
        try {
            $pdo = db_connect($login);
        } catch (PDOException $e) {
            error_log("Spare database $name cannot be opened: " . $e->getMessage());
            continue;
        }
        if ($pdo->query('SHOW TABLES')->fetchColumn() !== false) {
            error_log("Spare database $name is not empty; skipped.");
            continue;
        }
        $undo[] = static fn () => company_empty_database($pdo);
        return [$login, 'spare', $index];
    }

    throw new RuntimeException($server['user'] === ''
        ? "the database login is not set up yet: fill in 'server' in companyconfig.php (next to config.php)."
        : ($refused !== null
            ? "this server's database login may not create databases (Hostinger shared hosting does not allow it). Create an empty database in hPanel > Databases and add it under 'spare_databases' in companyconfig.php."
            : "there is no free spare database left: add one under 'spare_databases' in companyconfig.php."));
}

/*
 * Where the server login may create logins (a VPS, a local MySQL), the company gets a MySQL login of its
 * own with rights on its own database only. Elsewhere it uses the server login: the program still only
 * ever opens the signed-in company's database.
 */
function company_own_login(PDO $root, array $login, array &$undo): array
{
    // Named like its database (MySQL logins have at most 32 characters); a taken name gets _2, _3 …
    $pass = bin2hex(random_bytes(18));
    $account = null;
    foreach (company_name_candidates($login['name'], 32) as $user) {
        $candidate = $root->quote($user) . "@'%'";
        try {
            $root->exec("CREATE USER $candidate IDENTIFIED BY " . $root->quote($pass));
            $account = $candidate;
            break;
        } catch (PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) !== 1396) {
                return $login;                               // not allowed here: the server login
            }
        }
    }
    if ($account === null) {
        return $login;
    }
    $drop = static fn () => $root->exec("DROP USER IF EXISTS $account");
    try {
        $root->exec("GRANT ALL PRIVILEGES ON `{$login['name']}`.* TO $account");
        $own = ['user' => $user, 'pass' => $pass] + $login;
        db_connect($own)->query('SELECT 1');                 // e.g. an anonymous local user can shadow '%'
        $undo[] = $drop;
        return $own;
    } catch (PDOException) {
        $drop();
        return $login;
    }
}

/* Drops every table of a spare database again (a failed creation leaves it as empty as it was). */
function company_empty_database(PDO $pdo): void
{
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
        $pdo->exec('DROP TABLE IF EXISTS `' . str_replace('`', '``', $table) . '`');
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
}

function company_remove_folder(string $directory): void
{
    if (!is_dir($directory)) {
        return;
    }
    $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($items as $item) {
        $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    }
    rmdir($directory);
}
