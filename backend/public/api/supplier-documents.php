<?php
declare(strict_types=1);

/*
 * Supplier documents (supplier_documents).
 *   GET ?supplierId=N         → the supplier's documents
 *   GET ?id=N               → download one file (&inline=1: a PDF or image opens in the browser)
 *   POST (multipart/form-data: supplierId, files[], types[], expiries[], orders[] (a PO / SO document's order number)) → upload; 201 with the supplier's documents
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/party_documents.php';

$method = allow_methods('GET', 'POST');
if ($method === 'POST') {
    $ownerId = $_POST['supplierId'] ?? '';
    if (!is_string($ownerId) || !ctype_digit($ownerId)) {
        json_error('supplierId is required.', 400);
    }
    json_out(party_documents_upload('supplier', (int) $ownerId, uploaded_files('files'), post_list('types'), post_list('expiries'), post_list('orders')), 201);
}
$id = query_id('id');
if ($id !== null) {
    party_document_download('supplier', $id, ($_GET['inline'] ?? '') === '1');
}
$ownerId = query_id('supplierId') ?? json_error('supplierId is required.', 400);
json_out(party_documents_list('supplier', $ownerId));
