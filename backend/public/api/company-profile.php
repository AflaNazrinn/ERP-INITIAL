<?php
declare(strict_types=1);

/*
 * The signed-in company's own details (the company_profile row in its own database), for the dashboard.
 *   GET                                               → { code, name, …, files: { logo: name|null, … } }
 *   GET ?file=logo|letterhead|crCertificate|vatCertificate → that file (images and PDFs open in the tab)
 * Only ever the signed-in company's: the database and the storage folder come from the session.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/document_storage.php';

allow_methods('GET');
$row = query('SELECT * FROM company_profile WHERE id = 1')->fetch() ?: null;
if ($row === null) {
    throw new NotFound('This company has no profile yet.');
}

$files = ['logo' => 'logo', 'letterhead' => 'letterhead', 'crCertificate' => 'cr_certificate', 'vatCertificate' => 'vat_certificate'];
if (isset($_GET['file'])) {
    $column = $files[(string) $_GET['file']] ?? null;
    if ($column === null || empty($row["{$column}_path"])) {
        throw new NotFound('File not found.');
    }
    $path = (string) $row["{$column}_path"];
    if (str_ends_with($path, '.svg')) {
        // An SVG is shown as a picture only: no scripts, no links out, even when opened on its own.
        $full = storage_dir() . '/' . $path;
        is_file($full) || throw new NotFound('File not found.');
        header_remove('Content-Type');
        header('Content-Type: image/svg+xml');
        header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox");
        header('Content-Length: ' . filesize($full));
        readfile($full);
        exit;
    }
    send_stored_file($path, (string) $row["{$column}_name"], true);
}

$out = [];
foreach ($row as $column => $value) {
    if (!preg_match('/_(path|name)$/', $column) || in_array($column, ['company_name'], true)) {
        $out[lcfirst(str_replace('_', '', ucwords($column, '_')))] = $value;
    }
}
$out['files'] = [];
foreach ($files as $key => $column) {
    $out['files'][$key] = $row["{$column}_name"] ?? null;
}
json_out($out);
