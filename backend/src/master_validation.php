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

/* A request that is not allowed for this record (a predefined unit's delete …): 409 with the message. */
final class Conflict extends RuntimeException {}

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

    /* A record name: stored in capitals, whatever case it was typed in. */
    public function name(string $key, string $label, int $max, bool $required = true): string
    {
        return mb_substr(mb_strtoupper($this->text($key, $label, $max, $required)), 0, $max);
    }

    /* A YYYY-MM-DD date, or null when blank. */
    public function date(string $key, string $label): ?string
    {
        $value = trim((string) ($this->raw($key) ?? ''));
        if ($value === '') {
            return null;
        }
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if (!$date || $date->format('Y-m-d') !== $value) {
            $this->fail($key, "$label must be a date (YYYY-MM-DD).");
            return null;
        }
        return $value;
    }

    public function email(string $key, string $label, int $max = 150, bool $required = false): string
    {
        $value = $this->text($key, $label, $max, $required);
        // A real address: name@domain with a domain ending such as .com or .om.
        if ($value !== '' && (filter_var($value, FILTER_VALIDATE_EMAIL) === false || !preg_match('/@[^@]+\.[a-z]{2,}$/i', $value))) {
            $this->fail($key, 'Enter a valid email address.');
        }
        return $value;
    }

    /*
     * A phone number, checked against its country: "+968 9123 4455" must have the digits Oman uses after
     * +968 (PHONE_DIGITS). Spaces, dashes, dots and brackets are allowed; one leading 0 (a trunk prefix,
     * "+971 050 …") is ignored. A number without a + code, or with a code not in the list, needs 6 to 15
     * digits. $allowExtension also takes a short extension (up to 5 digits) on its own.
     */
    public function phone(string $key, string $label, int $max = 40, bool $allowExtension = false): string
    {
        $value = $this->text($key, $label, $max);
        if ($value !== '' && ($message = phone_problem($value, $allowExtension)) !== null) {
            $this->fail($key, "$label: $message");
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

/* Calling code => [country, fewest, most digits after the code]. The same list as COUNTRIES in dashboard.js. */
const PHONE_DIGITS = [
    '+968' => ['Oman', 8, 8], '+971' => ['United Arab Emirates', 8, 9], '+966' => ['Saudi Arabia', 8, 9],
    '+974' => ['Qatar', 8, 8], '+965' => ['Kuwait', 8, 8], '+973' => ['Bahrain', 8, 8], '+91' => ['India', 10, 10],
    '+92' => ['Pakistan', 9, 10], '+20' => ['Egypt', 8, 10], '+962' => ['Jordan', 8, 9], '+90' => ['Türkiye', 10, 10],
    '+86' => ['China', 10, 11], '+81' => ['Japan', 9, 10], '+82' => ['South Korea', 8, 10], '+49' => ['Germany', 6, 11],
    '+39' => ['Italy', 6, 11], '+44' => ['United Kingdom', 9, 10], '+1' => ['United States', 10, 10],
];

/* Why a phone number is not valid for its country, or null when it is. See Input::phone(). */
function phone_problem(string $value, bool $allowExtension = false): ?string
{
    $text = trim($value);
    $code = null;
    if (str_starts_with($text, '+')) {
        $codes = array_keys(PHONE_DIGITS);
        usort($codes, static fn ($a, $b) => strlen($b) <=> strlen($a));   // +968 before +9…
        foreach ($codes as $candidate) {
            if (str_starts_with($text, $candidate)) {
                $code = $candidate;
                $text = substr($text, strlen($candidate));
                break;
            }
        }
        if ($code === null) {
            $text = substr($text, 1);
        }
    }
    $digits = preg_replace('/[\s\-().]/', '', $text);
    if ($digits === '' || !ctype_digit($digits)) {
        return 'use digits only (spaces and dashes are fine).';
    }
    if ($allowExtension && $code === null && strlen($digits) <= 5) {
        return null;   // an extension such as 204
    }
    if ($code === null) {
        return strlen($digits) >= 6 && strlen($digits) <= 15 ? null : 'enter 6 to 15 digits, or start with a country code such as +968.';
    }
    [$country, $min, $max] = PHONE_DIGITS[$code];
    $national = strlen($digits) > $max && $digits[0] === '0' ? substr($digits, 1) : $digits;
    if (strlen($national) < $min || strlen($national) > $max) {
        $range = $min === $max ? "$min digits" : "$min to $max digits";
        return "numbers in $country have $range after $code.";
    }
    return null;
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

/* Deletes one row; NotFound when it is not there. A foreign key that still points at it ends as 409 (api_bootstrap.php). */
function delete_row(string $table, int $id, string $notFound): void
{
    if (query("DELETE FROM `$table` WHERE id = ?", [$id])->rowCount() === 0) {
        throw new NotFound($notFound);
    }
}

/* The date part of a TIMESTAMP column (YYYY-MM-DD), for the list pages' date filter. */
function date_only(?string $timestamp): string
{
    return $timestamp === null ? '' : substr($timestamp, 0, 10);
}

/* "WHERE a LIKE ? OR b LIKE ?" parameters for a search box. */
function like(string $search): string
{
    return '%' . addcslashes($search, '%_\\') . '%';
}
