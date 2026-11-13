<?php
declare(strict_types=1);

require_once __DIR__ . '/master_validation.php';

/*
 * Uploaded files live under backend/storage/ (outside the web root, never served directly)
 * with random stored names. The database keeps the stored path and the original name.
 */

const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const DOCUMENT_TYPES = [
    'pdf'  => 'application/pdf',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png'  => 'image/png',
    'doc'  => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls'  => 'application/vnd.ms-excel',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/* $_FILES['files'] (multiple) as a list of single-file arrays. */
function uploaded_files(string $field): array
{
    $files = $_FILES[$field] ?? null;
    if (!$files || !is_array($files['name'])) {
        return $files && $files['error'] !== UPLOAD_ERR_NO_FILE ? [$files] : [];
    }
    $list = [];
    foreach (array_keys($files['name']) as $i) {
        if ($files['error'][$i] === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        $list[] = ['name' => $files['name'][$i], 'tmp_name' => $files['tmp_name'][$i], 'size' => $files['size'][$i], 'error' => $files['error'][$i]];
    }
    return $list;
}

/* A list field of a multipart form (name[] = ...) as a list of strings; [] when absent. */
function post_list(string $field): array
{
    $values = $_POST[$field] ?? [];
    return is_array($values) ? array_values(array_map(static fn ($v) => is_scalar($v) ? (string) $v : '', $values)) : [];
}

/* Checks every file before any is stored; throws ValidationError on the first bad one. */
function validate_uploads(array $files): void
{
    if (!$files) {
        throw new ValidationError(['files' => 'Choose at least one file.']);
    }
    foreach ($files as $file) {
        $name = (string) $file['name'];
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
            throw new ValidationError(['files' => "$name could not be uploaded."]);
        }
        if (!isset(DOCUMENT_TYPES[$extension])) {
            throw new ValidationError(['files' => "$name is not a supported file type."]);
        }
        if ($file['size'] > DOCUMENT_MAX_BYTES) {
            throw new ValidationError(['files' => "$name is larger than 10 MB."]);
        }
    }
}

/* Moves one validated upload into storage/$folder; returns [storedPath, originalName]. */
function store_upload(array $file, string $folder): array
{
    $directory = rtrim(config()['storage'], '/') . '/' . $folder;
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        throw new RuntimeException("Cannot create $directory");
    }
    $extension = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
    $stored = $folder . '/' . bin2hex(random_bytes(16)) . '.' . $extension;
    if (!move_uploaded_file($file['tmp_name'], rtrim(config()['storage'], '/') . '/' . $stored)) {
        throw new RuntimeException('Could not store the uploaded file.');
    }
    $original = mb_substr(basename(str_replace('\\', '/', (string) $file['name'])), 0, 255);
    return [$stored, $original];
}

function delete_stored(string $storedPath): void
{
    $path = rtrim(config()['storage'], '/') . '/' . $storedPath;
    if (is_file($path)) {
        unlink($path);
    }
}

/* Streams a stored file and ends the request: as a download, or (inline, for a PDF or an image only)
   for the browser to show in a tab. */
function send_stored_file(string $storedPath, string $originalName, bool $inline = false): never
{
    $path = rtrim(config()['storage'], '/') . '/' . $storedPath;
    if (!is_file($path)) {
        throw new NotFound('File not found.');
    }
    $extension = strtolower(pathinfo($storedPath, PATHINFO_EXTENSION));
    header_remove('Content-Type');
    header('Content-Type: ' . (DOCUMENT_TYPES[$extension] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($path));
    $inline = $inline && in_array($extension, ['pdf', 'jpg', 'jpeg', 'png'], true);
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($originalName));
    readfile($path);
    exit;
}
