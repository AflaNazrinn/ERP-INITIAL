<?php
declare(strict_types=1);

/*
 * An employee's profile photo and documents (employees.photo_path, employee_documents).
 *   GET ?photo=N              → the employee's photo (an image, shown in the page)
 *   POST photo: employeeId, photo (multipart; JPG or PNG) → the employee, with hasPhoto
 *   DELETE ?photo=N           → remove the photo
 *   GET ?employeeId=N         → the employee's documents
 *   GET ?id=N                 → download one document (&inline=1: a PDF or image opens in the browser)
 *   POST documents: employeeId, files[], types[] (multipart) → upload; 201 with the employee's documents
 *   DELETE ?id=N              → remove one document
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/employees.php';

$method = allow_methods('GET', 'POST', 'DELETE');
if ($method === 'POST') {
    $employeeId = $_POST['employeeId'] ?? '';
    if (!is_string($employeeId) || !ctype_digit($employeeId)) {
        json_error('employeeId is required.', 400);
    }
    if (isset($_FILES['photo'])) {
        json_out(employee_photo_upload((int) $employeeId, uploaded_files('photo')));
    }
    json_out(employee_documents_upload((int) $employeeId, uploaded_files('files'), post_list('types')), 201);
}
$photo = query_id('photo');
$id = query_id('id');
if ($method === 'DELETE') {
    if ($photo !== null) {
        employee_photo_delete($photo);
        json_out(['id' => $photo]);
    }
    employee_document_delete($id ?? json_error('id is required.', 400));
    json_out(['id' => $id]);
}
if ($photo !== null) {
    employee_photo_send($photo);
}
if ($id !== null) {
    employee_document_download($id, ($_GET['inline'] ?? '') === '1');
}
$employeeId = query_id('employeeId') ?? json_error('employeeId is required.', 400);
json_out(employee_documents_list($employeeId));
