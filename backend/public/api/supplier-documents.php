<?php
declare(strict_types=1);

/*
 * Supplier documents (supplier_documents).
 *   GET ?supplierId=N         → the supplier's documents
 *   GET ?id=N               → download one file
 *   POST (multipart/form-data: supplierId, files[]) → upload; 201 with the supplier's documents
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/party_documents.php';

$method = allow_methods('GET', 'POST');
if ($method === 'POST') {
    $ownerId = $_POST['supplierId'] ?? '';
    if (!is_string($ownerId) || !ctype_digit($ownerId)) {
        json_error('supplierId is required.', 400);
    }
    json_out(party_documents_upload('supplier', (int) $ownerId, uploaded_files('files')), 201);
}
$id = query_id('id');
if ($id !== null) {
    party_document_download('supplier', $id);
}
$ownerId = query_id('supplierId') ?? json_error('supplierId is required.', 400);
json_out(party_documents_list('supplier', $ownerId));
