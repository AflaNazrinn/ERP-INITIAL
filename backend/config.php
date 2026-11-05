<?php
declare(strict_types=1);

/*
 * Settings come from the environment, or from backend/.env (KEY=value lines) when present.
 * Required database settings fail closed: a missing value stops the request instead of
 * guessing a default. Copy backend/.env.example to backend/.env to start.
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
            'db'      => [
                'host'    => env('DB_HOST', '127.0.0.1'),
                'port'    => (int) env('DB_PORT', '3306'),
                'name'    => env('DB_NAME'),
                'user'    => env('DB_USER'),
                'pass'    => env('DB_PASS', ''),
            ],
            'storage' => env('STORAGE_DIR', __DIR__ . '/storage'),
        ];
    }
    return $config;
}
