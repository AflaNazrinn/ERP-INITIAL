<?php
declare(strict_types=1);

/*
 * Shared by the Return & Replacement documents (sales return, sales replacement, purchase return, purchase replacement)
 * for their lists' Filter:
 *   rr_record_creator()  stores who made a new document (the signed-in user)
 *   rr_list_extras()     the employee who made it (the user's employee; else, on purchase documents, the employee
 *                        named in Created By)
 */

/* The signed-in user's id on a document just created. A database without the column yet is left as it is. */
function rr_record_creator(string $table, int $id): void
{
    $userId = (int) ($_SESSION['user']['id'] ?? 0);
    if ($userId < 1) {
        return;
    }
    try {
        query("UPDATE `$table` SET created_user_id = ? WHERE id = ?", [$userId, $id]);
    } catch (PDOException) {
        // migration 2026_11_27_001 not run yet: the document saves; the Employee filter just cannot name its maker
    }
}

/*
 * { employeeId, employeeCode, employeeName } for a document row. $createdBy: a purchase document's Created By text
 * ('' for sales documents).
 */
function rr_list_extras(array $row, string $createdBy = ''): array
{
    $employee = false;
    try {
        if (!empty($row['created_user_id'])) {
            $employee = query('SELECT e.id, e.emp_code, e.first_name, e.last_name FROM users u JOIN employees e ON e.id = u.employee_id WHERE u.id = ?',
                [(int) $row['created_user_id']])->fetch();
        }
        if (!$employee && trim($createdBy) !== '') {
            $name = preg_replace('/\s+/u', ' ', trim($createdBy));
            $employee = query("SELECT id, emp_code, first_name, last_name FROM employees
                               WHERE emp_code = ? OR TRIM(CONCAT(first_name, ' ', last_name)) = ? OR first_name = ? LIMIT 1", [$name, $name, $name])->fetch();
        }
    } catch (PDOException) {
        $employee = false;                       // no employees table yet
    }
    return [
        'employeeId' => $employee ? (int) $employee['id'] : null,
        'employeeCode' => $employee ? (string) $employee['emp_code'] : '',
        'employeeName' => $employee ? trim($employee['first_name'] . ' ' . $employee['last_name']) : '',
    ];
}
