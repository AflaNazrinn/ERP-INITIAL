<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';

/* Thrown by the modules; api_bootstrap.php turns them into 422 and 404 responses. */
final class ValidationError extends RuntimeException
{
    public function __construct(public readonly array $fields, string $message = '')
    {
        parent::__construct($message !== '' ? $message : (string) (array_values($fields)[0] ?? 'Check the highlighted fields.'));
    }
}

final class NotFound extends RuntimeException {}

/*
 * Server-side checks shared by the master modules. Input wraps a decoded JSON body;
 * each reader returns a clean value and records a message under the payload key
 * when the value is wrong. done() throws ValidationError (422) if anything failed.
 */
final class Input
{
    private array $errors = [];

    public function __construct(private readonly array $data) {}

    public function fail(string $key, string $message): void
    {
        $this->errors[$key] ??= $message;
    }

    public function done(): void
    {
        if ($this->errors) {
            throw new ValidationError($this->errors);
        }
    }

    private function raw(string $key): mixed
    {
        return $this->data[$key] ?? null;
    }

    public function text(string $key, string $label, int $max, bool $required = false): string
    {
        $value = $this->raw($key);
        if ($value !== null && !is_scalar($value)) {
            $this->fail($key, "$label must be text.");
            return '';
        }
        $value = trim((string) $value);
        if ($required && $value === '') {
            $this->fail($key, "$label is required.");
        } elseif (mb_strlen($value) > $max) {
            $this->fail($key, "$label must be at most $max characters.");
        }
        return mb_substr($value, 0, $max);
    }

    public function email(string $key, string $label, int $max = 150, bool $required = false): string
    {
        $value = $this->text($key, $label, $max, $required);
        if ($value !== '' && filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
            $this->fail($key, 'Enter a valid email address.');
        }
        return $value;
    }

    public function url(string $key, string $label, int $max = 255): string
    {
        $value = $this->text($key, $label, $max);
        if ($value !== '' && !preg_match('#^https?://#i', $value)) {
            $this->fail($key, "$label must start with http:// or https://");
        }
        return $value;
    }

    /* A DECIMAL(digits, scale) as a string ("12.500"), or null when blank. */
    public function decimal(string $key, string $label, int $digits, int $scale, bool $required = false, ?string $max = null): ?string
    {
        $value = trim((string) ($this->raw($key) ?? ''));
        if ($value === '') {
            if ($required) {
                $this->fail($key, "$label is required.");
            }
            return null;
        }
        $whole = $digits - $scale;
        if (!preg_match('/^\d{1,' . $whole . '}(\.\d{1,' . $scale . '})?$/', $value)) {
            $this->fail($key, "$label must be a number with up to $scale decimals.");
            return null;
        }
        if ($max !== null && (float) $value > (float) $max) {
            $this->fail($key, "$label must be at most $max.");
        }
        return $value;
    }

    public function whole(string $key, string $label, bool $required = false, int $max = 4294967295): ?int
    {
        $value = trim((string) ($this->raw($key) ?? ''));
        if ($value === '') {
            if ($required) {
                $this->fail($key, "$label is required.");
            }
            return null;
        }
        if (!ctype_digit($value) || (float) $value > $max) {
            $this->fail($key, "$label must be a whole number up to $max.");
            return null;
        }
        return (int) $value;
    }

    public function choice(string $key, string $label, array $allowed, string $default): string
    {
        $value = trim((string) ($this->raw($key) ?? ''));
        if ($value === '') {
            return $default;
        }
        if (!in_array($value, $allowed, true)) {
            $this->fail($key, "$label must be one of: " . implode(', ', $allowed) . '.');
            return $default;
        }
        return $value;
    }

    /* The id of an existing row in $table, or null when blank. */
    public function id(string $key, string $label, string $table, bool $required = false): ?int
    {
        $value = $this->raw($key);
        if ($value === null || $value === '') {
            if ($required) {
                $this->fail($key, "$label is required.");
            }
            return null;
        }
        if (!is_int($value) && !(is_string($value) && ctype_digit($value))) {
            $this->fail($key, "$label is not valid.");
            return null;
        }
        $id = (int) $value;
        if (!row_exists($table, $id)) {
            $this->fail($key, "The selected $label no longer exists.");
            return null;
        }
        return $id;
    }

    /* A list of distinct existing ids in $table. */
    public function ids(string $key, string $label, string $table): array
    {
        $values = $this->raw($key) ?? [];
        if (!is_array($values)) {
            $this->fail($key, "$label must be a list.");
            return [];
        }
        $ids = [];
        foreach ($values as $value) {
            if (!is_int($value) && !(is_string($value) && ctype_digit($value))) {
                $this->fail($key, "$label contains an invalid entry.");
                return [];
            }
            $ids[(int) $value] = true;
        }
        $ids = array_keys($ids);
        foreach ($ids as $id) {
            if (!row_exists($table, $id)) {
                $this->fail($key, "A selected $label no longer exists.");
                return [];
            }
        }
        return $ids;
    }

    /* A list of objects (table rows); anything that is not an object is skipped. */
    public function rows(string $key): array
    {
        $rows = $this->raw($key) ?? [];
        return is_array($rows) ? array_values(array_filter($rows, 'is_array')) : [];
    }
}

/* $table is always a constant from module code, never user input. */
function row_exists(string $table, int $id): bool
{
    return (bool) query("SELECT 1 FROM `$table` WHERE id = ?", [$id])->fetchColumn();
}

/*
 * The next code in a series: PREFIX-YYYY-0001 (or PREFIX-0001 without the year).
 * Call inside the insert's transaction; the row lock keeps two saves from taking one number,
 * and the unique key on the column is the final guard.
 */
function next_code(string $table, string $column, string $prefix, bool $withYear = true): string
{
    $stem = $withYear ? sprintf('%s-%d-', $prefix, (int) date('Y')) : "$prefix-";
    $last = query(
        "SELECT `$column` FROM `$table` WHERE `$column` LIKE ? ORDER BY `$column` DESC LIMIT 1 FOR UPDATE",
        [$stem . '%']
    )->fetchColumn();
    $number = $last === false ? 1 : ((int) substr((string) $last, strlen($stem))) + 1;
    return $stem . str_pad((string) $number, 4, '0', STR_PAD_LEFT);
}

/* "WHERE a LIKE ? OR b LIKE ?" parameters for a search box. */
function like(string $search): string
{
    return '%' . addcslashes($search, '%_\\') . '%';
}
