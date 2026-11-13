<?php
declare(strict_types=1);

/*
 * Item files (item_documents): Item Creation › Media & Specification Assets.
 *   GET ?itemId=N   → the item's files
 *   GET ?id=N       → download one file (&inline=1: a PDF or image opens in the browser)
 *   POST (multipart/form-data: itemId, kind = spec | image, files[]) → upload; 201 with the item's files
 *   DELETE ?id=N    → remove one file
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/item_documents.php';

$method = allow_methods('GET', 'POST', 'DELETE');
if ($method === 'POST') {
    $itemId = $_POST['itemId'] ?? '';
    if (!is_string($itemId) || !ctype_digit($itemId)) {
        json_error('itemId is required.', 400);
    }
    json_out(item_documents_upload((int) $itemId, (string) ($_POST['kind'] ?? ''), uploaded_files('files')), 201);
}
$id = query_id('id');
if ($method === 'DELETE') {
    item_document_delete($id ?? json_error('id is required.', 400));
    json_out(['id' => $id]);
}
if ($id !== null) {
    item_document_download($id, ($_GET['inline'] ?? '') === '1');
}
$itemId = query_id('itemId') ?? json_error('itemId is required.', 400);
json_out(item_documents_list($itemId));
