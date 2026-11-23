<?php
declare(strict_types=1);

/*
 * Employees (Employee Management › Employee).
 * GET list / one (with its documents) / next code, POST create, PUT update, DELETE: see serve_master() in
 * src/api_bootstrap.php. GET ?company=1 → the signed-in company every employee here belongs to, { code, name };
 * GET ?nextNumber=1 → the Employee ID the next new employee gets, { number }.
 * The photo and documents: api/employee-files.php.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/employees.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && isset($_GET['company'])) {
    json_out(employee_company());
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && isset($_GET['nextNumber'])) {
    json_out(['number' => employee_next_number()]);
}
serve_master('employees_list', 'employee_find', 'employee_next_code', 'employee_save', 'employee_delete');
