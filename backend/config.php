<?php
declare(strict_types=1);

/*
 * Settings come from the environment, or from backend/.env (KEY=value lines) when present.
 * Copy backend/.env.example to backend/.env to start.
 *
 * The databases are not set here: every company has its own, listed in backend/companyconfig.php
 * (src/company_registry.php reads and writes it). DB_* lines left in an older .env are read only once,
 * to write the first companyconfig.php.
 */

function load_env_file(string $path): void
{
    if (!is_readable($path)) {
        return;
    }
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = array_map('trim', explode('=', $line, 2));
        if (strlen($value) >= 2 && ($value[0] === '"' || $value[0] === "'") && $value[-1] === $value[0]) {
            $value = substr($value, 1, -1);
        }
        if (getenv($key) === false) {   // the real environment wins over the file
            putenv("$key=$value");
            $_ENV[$key] = $value;
        }
    }
}

function env(string $key, ?string $default = null): string
{
    $value = getenv($key);
    if ($value === false || $value === '') {
        if ($default === null) {
            throw new RuntimeException("Missing required setting $key (see backend/.env.example).");
        }
        return $default;
    }
    return $value;
}

load_env_file(__DIR__ . '/.env');

function config(): array
{
    static $config = null;
    if ($config === null) {
        $config = [
            'env'     => env('APP_ENV', 'production'),
            // The base folder; each company's files are in a folder of their own under it (storage_dir()).
            'storage' => env('STORAGE_DIR', __DIR__ . '/storage'),
        ];
    }
    return $config;
}
