<?php
declare(strict_types=1);

/*
 * The company icon: the round picture at the top left of the dashboard (the company's first letter until one
 * is uploaded). Kept apart from the logo given on Create a Company, as storage/company/icon.png (or .jpg).
 *   GET              → { data: { name, size } } or { data: null } when there is none
 *   GET ?file=1      → the image itself
 *   POST (multipart) → icon = a PNG or JPG up to 2 MB; replaces the current icon
 *   DELETE           → removes it (the letter shows again)
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/document_storage.php';

const ICON_MAX_BYTES = 2 * 1024 * 1024;
const ICON_TYPES = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg'];

/* The stored icon's path relative to storage/, or null. */
function icon_current(): ?string
{
    foreach (['png', 'jpg'] as $extension) {
        if (is_file(storage_dir() . "/company/icon.$extension")) {
            return "company/icon.$extension";
        }
    }
    return null;
}

$method = allow_methods('GET', 'POST', 'DELETE');
$current = icon_current();

if ($method === 'GET') {
    if (isset($_GET['file'])) {
        if ($current === null) {
            throw new NotFound('There is no company icon.');
        }
        $path = storage_dir() . '/' . $current;
        header_remove('Content-Type');
        header('Content-Type: ' . ICON_TYPES[pathinfo($current, PATHINFO_EXTENSION)]);
        header('Content-Length: ' . filesize($path));
        readfile($path);
        exit;
    }
    json_out($current === null ? null : ['name' => basename($current), 'size' => filesize(storage_dir() . '/' . $current)]);
}

if ($method === 'DELETE') {
    if ($current !== null) {
        delete_stored($current);
    }
    json_out(null);
}

$file = uploaded_files('icon')[0] ?? null;
if ($file === null) {
    throw new ValidationError(['icon' => 'Choose the logo image.']);
}
$extension = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
    throw new ValidationError(['icon' => 'The image could not be uploaded.'], 'The image could not be uploaded.');
}
if (!isset(ICON_TYPES[$extension]) || !in_array(@getimagesize($file['tmp_name'])['mime'] ?? '', ['image/png', 'image/jpeg'], true)) {
    throw new ValidationError(['icon' => 'The logo must be a PNG or JPG image.'], 'The logo must be a PNG or JPG image.');
}
if ($file['size'] > ICON_MAX_BYTES) {
    throw new ValidationError(['icon' => 'The logo image must be at most 2 MB.'], 'The logo image must be at most 2 MB.');
}
$directory = storage_dir() . '/company';
if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
    throw new RuntimeException("Cannot create $directory");
}
if ($current !== null) {
    delete_stored($current);
}
$extension = $extension === 'jpeg' ? 'jpg' : $extension;
if (!move_uploaded_file($file['tmp_name'], "$directory/icon.$extension")) {
    throw new RuntimeException('Could not store the logo image.');
}
json_out(['name' => "icon.$extension", 'size' => filesize("$directory/icon.$extension")], 201);
