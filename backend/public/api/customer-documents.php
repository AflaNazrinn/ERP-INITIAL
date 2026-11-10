<?php
declare(strict_types=1);

/*
 * Customer documents (customer_documents).
 *   GET ?customerId=N         → the customer's documents
 *   GET ?id=N               → download one file
 *   POST (multipart/form-data: customerId, files[], types[], expiries[]) → upload; 201 with the customer's documents
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/party_documents.php';

$method = allow_methods('GET', 'POST');
if ($method === 'POST') {
    $ownerId = $_POST['customerId'] ?? '';
    if (!is_string($ownerId) || !ctype_digit($ownerId)) {
        json_error('customerId is required.', 400);
    }
    json_out(party_documents_upload('customer', (int) $ownerId, uploaded_files('files'), post_list('types'), post_list('expiries')), 201);
}
$id = query_id('id');
if ($id !== null) {
    party_document_download('customer', $id);
}
$ownerId = query_id('customerId') ?? json_error('customerId is required.', 400);
json_out(party_documents_list('customer', $ownerId));
