<?php
declare(strict_types=1);

require_once __DIR__ . '/document_storage.php';

/*
 * Supplier and customer documents (supplier_documents, customer_documents). Both tables have
 * the same shape, so one module serves both; $kind picks the table and storage folder.
 */

const PARTY_DOCUMENTS = [
    'supplier' => ['table' => 'supplier_documents', 'owner' => 'supplier_id', 'parent' => 'suppliers', 'folder' => 'supplier-documents'],
    'customer' => ['table' => 'customer_documents', 'owner' => 'customer_id', 'parent' => 'customers', 'folder' => 'customer-documents'],
];

function party_document_format(array $row): array
{
    $path = rtrim(config()['storage'], '/') . '/' . $row['file_path'];
    return [
        'id'           => (int) $row['id'],
        'originalName' => $row['original_name'],
        'docType'      => $row['doc_type'],
        'expiryDate'   => $row['expiry_date'],
        'size'         => is_file($path) ? filesize($path) : null,
        'uploadedAt'   => $row['uploaded_at'],
    ];
}

function party_documents_list(string $kind, int $ownerId): array
{
    $t = PARTY_DOCUMENTS[$kind];
    return array_map('party_document_format',
        query("SELECT * FROM `{$t['table']}` WHERE `{$t['owner']}` = ? ORDER BY uploaded_at, id", [$ownerId])->fetchAll());
}

/*
 * Stores every file in $files for one supplier or customer; all or nothing. $types and $expiries hold
 * each file's document type and expiry date (YYYY-MM-DD or ''), in the same order as the files.
 */
function party_documents_upload(string $kind, int $ownerId, array $files, array $types = [], array $expiries = []): array
{
    $t = PARTY_DOCUMENTS[$kind];
    if (!row_exists($t['parent'], $ownerId)) {
        throw new NotFound(ucfirst($kind) . ' not found.');
    }
    validate_uploads($files);
    $meta = [];
    foreach (array_keys($files) as $i) {
        $in = new Input(['type' => $types[$i] ?? '', 'expiry' => $expiries[$i] ?? '']);
        $meta[$i] = [$in->text('type', 'Document type', 60), $in->date('expiry', 'Expiry date')];
        $in->done();
    }
    $stored = [];
    try {
        transaction(static function () use ($t, $ownerId, $files, $meta, &$stored): void {
            foreach ($files as $i => $file) {
                [$path, $original] = store_upload($file, $t['folder']);
                $stored[] = $path;
                query("INSERT INTO `{$t['table']}` (`{$t['owner']}`, file_path, original_name, doc_type, expiry_date) VALUES (?, ?, ?, ?, ?)",
                    [$ownerId, $path, $original, $meta[$i][0], $meta[$i][1]]);
            }
        });
    } catch (Throwable $e) {
        foreach ($stored as $path) {
            delete_stored($path);   // no orphan files when the insert fails
        }
        throw $e;
    }
    return party_documents_list($kind, $ownerId);
}

function party_document_download(string $kind, int $id): never
{
    $t = PARTY_DOCUMENTS[$kind];
    $row = query("SELECT * FROM `{$t['table']}` WHERE id = ?", [$id])->fetch();
    if (!$row) {
        throw new NotFound('Document not found.');
    }
    send_stored_file($row['file_path'], $row['original_name']);
}
