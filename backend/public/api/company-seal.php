<?php
declare(strict_types=1);

/*
 * The company seal printed on Purchase Book PDFs when "Attach Seal" is ticked. One image for the company,
 * kept as storage/company/seal.png (or .jpg).
 *   GET              → { data: { name, size } } or { data: null } when there is none
 *   GET ?file=1      → the image itself
 *   POST (multipart) → seal = a PNG or JPG up to 2 MB; replaces the current seal
 *   DELETE           → removes it
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/document_storage.php';

const SEAL_MAX_BYTES = 2 * 1024 * 1024;
const SEAL_TYPES = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg'];

/* The stored seal's path relative to storage/, or null. */
function seal_current(): ?string
{
    foreach (['png', 'jpg'] as $extension) {
        if (is_file(rtrim(config()['storage'], '/') . "/company/seal.$extension")) {
            return "company/seal.$extension";
        }
    }
    return null;
}

$method = allow_methods('GET', 'POST', 'DELETE');
$current = seal_current();

if ($method === 'GET') {
    if (isset($_GET['file'])) {
        if ($current === null) {
            throw new NotFound('There is no company seal.');
        }
        $path = rtrim(config()['storage'], '/') . '/' . $current;
        header_remove('Content-Type');
        header('Content-Type: ' . SEAL_TYPES[pathinfo($current, PATHINFO_EXTENSION)]);
        header('Content-Length: ' . filesize($path));
        readfile($path);
        exit;
    }
    json_out($current === null ? null : ['name' => basename($current), 'size' => filesize(rtrim(config()['storage'], '/') . '/' . $current)]);
}

if ($method === 'DELETE') {
    if ($current !== null) {
        delete_stored($current);
    }
    json_out(null);
}

$file = uploaded_files('seal')[0] ?? null;
if ($file === null) {
    throw new ValidationError(['seal' => 'Choose the seal image.']);
}
$extension = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
    throw new ValidationError(['seal' => 'The image could not be uploaded.']);
}
if (!isset(SEAL_TYPES[$extension]) || !in_array(@getimagesize($file['tmp_name'])['mime'] ?? '', ['image/png', 'image/jpeg'], true)) {
    throw new ValidationError(['seal' => 'The seal must be a PNG or JPG image.'], 'The seal must be a PNG or JPG image.');
}
if ($file['size'] > SEAL_MAX_BYTES) {
    throw new ValidationError(['seal' => 'The seal image must be at most 2 MB.'], 'The seal image must be at most 2 MB.');
}
$directory = rtrim(config()['storage'], '/') . '/company';
if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
    throw new RuntimeException("Cannot create $directory");
}
if ($current !== null) {
    delete_stored($current);
}
$extension = $extension === 'jpeg' ? 'jpg' : $extension;
if (!move_uploaded_file($file['tmp_name'], "$directory/seal.$extension")) {
    throw new RuntimeException('Could not store the seal image.');
}
json_out(['name' => "seal.$extension", 'size' => filesize("$directory/seal.$extension")], 201);
