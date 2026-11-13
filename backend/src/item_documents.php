<?php
declare(strict_types=1);

require_once __DIR__ . '/document_storage.php';

/*
 * Item files (item_documents): the Doc / PDF Spec and CAD / Image uploads of Item Creation.
 * doc_kind is 'spec' or 'image'; each kind takes its own file types.
 */

const ITEM_DOCUMENT_FOLDER = 'item-documents';
const ITEM_DOCUMENT_KINDS = [
    'spec'  => ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'],
    'image' => ['jpg', 'jpeg', 'png', 'pdf', 'dwg', 'dxf'],
];

function item_document_format(array $row): array
{
    $path = rtrim(config()['storage'], '/') . '/' . $row['file_path'];
    return [
        'id'           => (int) $row['id'],
        'kind'         => $row['doc_kind'],
        'originalName' => $row['original_name'],
        'size'         => is_file($path) ? filesize($path) : null,
        'uploadedAt'   => $row['uploaded_at'],
    ];
}

function item_documents_list(int $itemId): array
{
    return array_map('item_document_format',
        query('SELECT * FROM item_documents WHERE item_id = ? ORDER BY uploaded_at, id', [$itemId])->fetchAll());
}

/* Stores every file for one item, all or nothing; returns the item's files. */
function item_documents_upload(int $itemId, string $kind, array $files): array
{
    if (!row_exists('items', $itemId)) {
        throw new NotFound('Item not found.');
    }
    $allowed = ITEM_DOCUMENT_KINDS[$kind] ?? null;
    if ($allowed === null) {
        throw new ValidationError(['kind' => 'Choose spec or image.']);
    }
    validate_uploads($files, $allowed);
    $stored = [];
    try {
        transaction(static function () use ($itemId, $kind, $files, &$stored): void {
            foreach ($files as $file) {
                [$path, $original] = store_upload($file, ITEM_DOCUMENT_FOLDER);
                $stored[] = $path;
                query('INSERT INTO item_documents (item_id, doc_kind, file_path, original_name) VALUES (?, ?, ?, ?)',
                    [$itemId, $kind, $path, $original]);
            }
        });
    } catch (Throwable $e) {
        foreach ($stored as $path) {
            delete_stored($path);   // no orphan files when the insert fails
        }
        throw $e;
    }
    return item_documents_list($itemId);
}

function item_document_row(int $id): array
{
    $row = query('SELECT * FROM item_documents WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('File not found.');
    }
    return $row;
}

function item_document_download(int $id, bool $inline = false): never
{
    $row = item_document_row($id);
    send_stored_file($row['file_path'], $row['original_name'], $inline);
}

function item_document_delete(int $id): void
{
    $row = item_document_row($id);
    query('DELETE FROM item_documents WHERE id = ?', [$id]);
    delete_stored($row['file_path']);
}
