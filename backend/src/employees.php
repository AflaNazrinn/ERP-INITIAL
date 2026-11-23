<?php
declare(strict_types=1);

require_once __DIR__ . '/master_validation.php';
require_once __DIR__ . '/document_storage.php';
require_once __DIR__ . '/purchase_book.php';

/*
 * Employee Management › Employee: staff records. Each gets a code (typed, or the next EMP-0001) and an employee number
 * (1001, automatic). Required: first name, email, phone, address, city, country, company, department, designation, joining
 * date, employment type and work location; everything else is optional. The stock point comes from the Stock Point
 * master (warehouses); the company is always the signed-in one. A profile photo and documents
 * are uploaded after the record is saved (api/employee-files.php).
 */

const EMPLOYEE_STATUSES = ['Active', 'On Leave', 'Resigned', 'Inactive'];
const EMPLOYEE_GENDERS = ['', 'Male', 'Female', 'Others'];
const EMPLOYEE_MARITAL = ['', 'Single', 'Married', 'Divorced', 'Widowed'];
const EMPLOYEE_TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern', 'Temporary'];
const EMPLOYEE_NO_BASE = 1000;                     // the first employee is number 1001
const EMPLOYEE_PHOTO_FOLDER = 'employee-photos';
const EMPLOYEE_DOCUMENT_FOLDER = 'employee-documents';
const EMPLOYEE_PHOTO_TYPES = ['jpg', 'jpeg', 'png'];

/* The payload keys and their columns, in the form's order (also what an update starts from). */
const EMPLOYEE_FIELDS = [
    'firstName' => 'first_name', 'lastName' => 'last_name', 'gender' => 'gender', 'dateOfBirth' => 'date_of_birth',
    'maritalStatus' => 'marital_status', 'nationality' => 'nationality', 'email' => 'email', 'phone' => 'phone',
    'address' => 'address', 'city' => 'city', 'country' => 'country', 'companyCode' => 'company_code',
    'department' => 'department', 'designation' => 'designation', 'joinDate' => 'join_date', 'status' => 'status',
    'employmentType' => 'employment_type', 'workLocation' => 'work_location', 'warehouseId' => 'warehouse_id',
    'boardMember' => 'board_member', 'basicSalary' => 'basic_salary', 'hra' => 'hra', 'otherAllowance' => 'other_allowance',
    'bankName' => 'bank_name', 'bankAccountNo' => 'bank_account_no', 'iban' => 'iban', 'nationalId' => 'national_id',
    'passportNo' => 'passport_no', 'passportExpiry' => 'passport_expiry', 'visaNo' => 'visa_no', 'visaExpiry' => 'visa_expiry',
    'emergencyName' => 'emergency_name', 'emergencyRelationship' => 'emergency_relationship', 'emergencyPhone' => 'emergency_phone',
    'remarks' => 'remarks',
];

/* The employee's company: always the one signed in (each company keeps its own employees), { code, name }. */
function employee_company(): array
{
    $company = active_company();
    return ['code' => (string) $company['code'], 'name' => (string) ($company['name'] ?? $company['code'])];
}

function employee_format(array $row): array
{
    $out = ['id' => (int) $row['id'], 'number' => (int) $row['emp_no'], 'code' => $row['emp_code']];
    foreach (EMPLOYEE_FIELDS as $key => $column) {
        $out[$key] = $row[$column] ?? '';
    }
    $warehouse = $row['warehouse_id'] === null ? null
        : query('SELECT warehouse_code, warehouse_name FROM warehouses WHERE id = ?', [$row['warehouse_id']])->fetch();
    return array_replace($out, [
        'name'          => trim($row['first_name'] . ' ' . $row['last_name']),
        'companyName'   => $row['company_name'],
        'warehouseId'   => $warehouse ? (int) $row['warehouse_id'] : null,
        'warehouseCode' => $warehouse ? $warehouse['warehouse_code'] : '',
        'warehouseName' => $warehouse ? $warehouse['warehouse_name'] : '',
        'boardMember'   => (bool) $row['board_member'],
        'hasPhoto'      => $row['photo_path'] !== null,
        'photoVersion'  => $row['photo_path'] === null ? '' : substr(md5($row['photo_path']), 0, 8),
        'remarks'       => $row['remarks'] ?? '',
        'createdAt'     => date_only($row['created_at']),
    ]);
}

/* Every employee, by name; $search matches the name, designation, department, code or email. */
function employees_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM employees';
    $params = [];
    if ($search !== '') {
        $sql .= " WHERE CONCAT(first_name, ' ', last_name) LIKE ? OR designation LIKE ? OR department LIKE ? OR emp_code LIKE ? OR email LIKE ?";
        $params = array_fill(0, 5, like($search));
    }
    // The resigned come last, each group by name.
    return array_map('employee_format', query($sql . " ORDER BY status = 'Resigned', first_name, last_name, id", $params)->fetchAll());
}

function employee_row(int $id): array
{
    $row = query('SELECT * FROM employees WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Employee not found.');
    }
    return $row;
}

function employee_find(int $id): array
{
    return employee_format(employee_row($id)) + ['documents' => employee_documents_list($id)];
}

function employee_next_code(): string
{
    return pb_next_code('employees', 'emp_code', 'EMP-', 4);
}

/* The next employee number (Employee ID): 1001, 1002 …, whatever codes were typed. */
function employee_next_number(): int
{
    return max(EMPLOYEE_NO_BASE, (int) query('SELECT COALESCE(MAX(emp_no), 0) FROM employees FOR UPDATE')->fetchColumn()) + 1;
}

function employee_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $e = employee_find($id);
        $data = array_replace(array_intersect_key($e, EMPLOYEE_FIELDS) + ['code' => $e['code']], $data);
    }
    $in = new Input($data);
    $required = static function (string $key, string $label, string $value) use ($in): string {
        if ($value === '') {
            $in->fail($key, "$label is required.");
        }
        return $value;
    };
    $money = static fn (string $key, string $label) => $in->decimal($key, $label, 14, 3);
    $company = employee_company();               // whatever the page sent: the signed-in company
    // The code may be typed (blank: the next EMP-0001 one); no two employees share one.
    $code = strtoupper($in->text('code', 'Employee code', 20));
    if ($code !== '' && !preg_match('/^[A-Z0-9][A-Z0-9\/_.-]*$/', $code)) {
        $in->fail('code', 'Use letters, digits and - / _ . only.');
    } elseif ($code !== '' && query('SELECT 1 FROM employees WHERE emp_code = ? AND id <> ?', [$code, $id ?? 0])->fetchColumn()) {
        $in->fail('code', "Employee code $code is already used.");
    }
    $row = [
        'first_name'             => $required('firstName', 'First name', $in->text('firstName', 'First name', 60)),
        'last_name'              => $in->text('lastName', 'Last name', 60),
        'gender'                 => $in->choice('gender', 'Gender', EMPLOYEE_GENDERS, ''),
        'date_of_birth'          => $in->date('dateOfBirth', 'Date of birth'),
        'marital_status'         => $in->choice('maritalStatus', 'Marital status', EMPLOYEE_MARITAL, ''),
        'nationality'            => $in->text('nationality', 'Nationality', 80),
        'email'                  => $in->email('email', 'Email address', 150, true),
        'phone'                  => $required('phone', 'Phone number', $in->phone('phone', 'Phone number', 40)),
        'address'                => $required('address', 'Address', $in->text('address', 'Address', 255)),
        'city'                   => $required('city', 'City', $in->text('city', 'City', 80)),
        'country'                => $required('country', 'Country', $in->text('country', 'Country', 80)),
        'company_code'           => $company['code'],
        'company_name'           => $company['name'],
        'department'             => $required('department', 'Department', $in->text('department', 'Department', 80)),
        'designation'            => $required('designation', 'Designation', $in->text('designation', 'Designation', 100)),
        'join_date'              => $in->date('joinDate', 'Date of joining'),
        'status'                 => $in->choice('status', 'Status', EMPLOYEE_STATUSES, 'Active'),
        'employment_type'        => $in->choice('employmentType', 'Employment type', EMPLOYEE_TYPES, 'Full-time'),
        'work_location'          => $required('workLocation', 'Work location', $in->text('workLocation', 'Work location', 100)),
        'warehouse_id'           => $in->id('warehouseId', 'stock point', 'warehouses'),
        'board_member'           => !empty($data['boardMember']) && $data['boardMember'] !== 'false' ? 1 : 0,
        'basic_salary'           => $money('basicSalary', 'Basic salary'),
        'hra'                    => $money('hra', 'HRA'),
        'other_allowance'        => $money('otherAllowance', 'Other allowance'),
        'bank_name'              => $in->text('bankName', 'Bank name', 120),
        'bank_account_no'        => $in->text('bankAccountNo', 'Bank account number', 40),
        'iban'                   => strtoupper(str_replace(' ', '', $in->text('iban', 'IBAN number', 40))),
        'national_id'            => $in->text('nationalId', 'National ID number', 40),
        'passport_no'            => $in->text('passportNo', 'Passport number', 40),
        'passport_expiry'        => $in->date('passportExpiry', 'Passport expiry date'),
        'visa_no'                => $in->text('visaNo', 'Visa number', 40),
        'visa_expiry'            => $in->date('visaExpiry', 'Visa expiry date'),
        'emergency_name'         => $in->text('emergencyName', 'Emergency contact name', 120),
        'emergency_relationship' => $in->text('emergencyRelationship', 'Relationship', 60),
        'emergency_phone'        => $in->phone('emergencyPhone', 'Emergency contact phone', 40),
        'remarks'                => $in->text('remarks', 'Remarks', 65535),
    ];
    if ($row['join_date'] === null) {
        $in->fail('joinDate', 'Date of joining is required.');
    }
    if ($row['join_date'] !== null && $row['date_of_birth'] !== null && $row['date_of_birth'] >= $row['join_date']) {
        $in->fail('dateOfBirth', 'The date of birth must be before the date of joining.');
    }
    $in->done();

    $id = transaction(static function () use ($id, $row, $code): int {
        $row['emp_code'] = $code !== '' ? $code : ($id === null ? employee_next_code() : employee_row($id)['emp_code']);
        if ($id === null) {
            $row['emp_no'] = employee_next_number();
            query('INSERT INTO employees (' . implode(', ', array_keys($row)) . ') VALUES (' . implode(', ', array_fill(0, count($row), '?')) . ')',
                array_values($row));
            return (int) db()->lastInsertId();
        }
        query('UPDATE employees SET ' . implode(' = ?, ', array_keys($row)) . ' = ? WHERE id = ?', [...array_values($row), $id]);
        return $id;
    });
    return employee_find($id);
}

/* The record, its photo and its documents (the files too). */
function employee_delete(int $id): void
{
    $row = employee_row($id);
    $files = query('SELECT file_path FROM employee_documents WHERE employee_id = ?', [$id])->fetchAll(PDO::FETCH_COLUMN);
    delete_row('employees', $id, 'Employee not found.');
    foreach ([$row['photo_path'], ...$files] as $path) {
        if ($path !== null) {
            delete_stored($path);
        }
    }
}

/* ---------- Profile photo ---------- */

function employee_photo_upload(int $id, array $files): array
{
    $row = employee_row($id);
    if (count($files) !== 1) {
        throw new ValidationError(['photo' => 'Choose one photo.']);
    }
    validate_uploads($files, EMPLOYEE_PHOTO_TYPES);
    [$path] = store_upload($files[0], EMPLOYEE_PHOTO_FOLDER);
    query('UPDATE employees SET photo_path = ? WHERE id = ?', [$path, $id]);
    if ($row['photo_path'] !== null) {
        delete_stored($row['photo_path']);
    }
    return employee_find($id);
}

function employee_photo_send(int $id): never
{
    $row = employee_row($id);
    if ($row['photo_path'] === null) {
        throw new NotFound('This employee has no photo.');
    }
    send_stored_file($row['photo_path'], $row['emp_code'] . '.' . pathinfo($row['photo_path'], PATHINFO_EXTENSION), true);
}

function employee_photo_delete(int $id): void
{
    $row = employee_row($id);
    query('UPDATE employees SET photo_path = NULL WHERE id = ?', [$id]);
    if ($row['photo_path'] !== null) {
        delete_stored($row['photo_path']);
    }
}

/* ---------- Documents ---------- */

function employee_documents_list(int $employeeId): array
{
    return array_map(static function (array $row): array {
        $path = storage_dir() . '/' . $row['file_path'];
        return ['id' => (int) $row['id'], 'docType' => $row['doc_type'], 'originalName' => $row['original_name'],
            'size' => is_file($path) ? filesize($path) : null, 'uploadedAt' => $row['uploaded_at']];
    }, query('SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY uploaded_at, id', [$employeeId])->fetchAll());
}

/* Stores every file for one employee, each with its document type; all or nothing. */
function employee_documents_upload(int $employeeId, array $files, array $types): array
{
    employee_row($employeeId);
    validate_uploads($files);
    $meta = [];
    foreach (array_keys($files) as $i) {
        $in = new Input(['type' => $types[$i] ?? '']);
        $meta[$i] = $in->text('type', 'Document type', 60);
        $in->done();
    }
    $stored = [];
    try {
        transaction(static function () use ($employeeId, $files, $meta, &$stored): void {
            foreach ($files as $i => $file) {
                [$path, $original] = store_upload($file, EMPLOYEE_DOCUMENT_FOLDER);
                $stored[] = $path;
                query('INSERT INTO employee_documents (employee_id, doc_type, file_path, original_name) VALUES (?, ?, ?, ?)',
                    [$employeeId, $meta[$i], $path, $original]);
            }
        });
    } catch (Throwable $e) {
        foreach ($stored as $path) {
            delete_stored($path);   // no orphan files when the insert fails
        }
        throw $e;
    }
    return employee_documents_list($employeeId);
}

function employee_document_row(int $id): array
{
    $row = query('SELECT * FROM employee_documents WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Document not found.');
    }
    return $row;
}

function employee_document_download(int $id, bool $inline = false): never
{
    $row = employee_document_row($id);
    send_stored_file($row['file_path'], $row['original_name'], $inline);
}

function employee_document_delete(int $id): void
{
    $row = employee_document_row($id);
    query('DELETE FROM employee_documents WHERE id = ?', [$id]);
    delete_stored($row['file_path']);
}
