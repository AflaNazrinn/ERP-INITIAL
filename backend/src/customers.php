<?php
declare(strict_types=1);

require_once __DIR__ . '/party_records.php';

/* Customers (Party › Debtors): their contacts, quotation lines, previous sales orders and documents (party_records.php). */

function customer_format(array $row): array
{
    return [
        'id'               => (int) $row['id'],
        'code'             => $row['customer_code'],
        'name'             => $row['customer_name'],
        'organizationName' => $row['organization_name'],
        'city'             => $row['city'],
        'country'          => $row['country'],
        'address'          => $row['address'],
        'zipCode'          => $row['zip_code'],
        'phone'            => $row['phone'],
        'telephone'        => $row['telephone'],
        'email'            => $row['email'],
        'ownerDetails'     => $row['owner_details'],
        'taxRegNo'         => $row['tax_reg_no'],
        'salesman'         => $row['salesman'],
        'currency'         => $row['currency'],
        'creditLimit'      => $row['credit_limit'],
        'creditDays'       => $row['credit_days'] === null ? null : (int) $row['credit_days'],
        'discountPercent'  => $row['discount_percent'],
        'accountDetails'   => $row['account_details'] ?? '',
        'comments'         => $row['comments'] ?? '',
        'status'           => $row['status'],
        'createdAt'        => date_only($row['created_at']),
    ];
}

/* Active customers for the lookups; every customer when $all (the Customer list page). */
function customers_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM customers' . ($all ? ' WHERE 1 = 1' : " WHERE status = 'active'");
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (customer_code LIKE ? OR customer_name LIKE ?)';
        $params = [like($search), like($search)];
    }
    return array_map('customer_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function customer_find(int $id): array
{
    $row = query('SELECT * FROM customers WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Customer not found.');
    }
    return customer_format($row) + party_rows_find('customer', $id);
}

function customer_next_code(): string
{
    return next_code('customers', 'customer_code', 'CUS');
}

function customer_input(array $c): array
{
    return [
        'customerName' => $c['name'], 'organizationName' => $c['organizationName'], 'address' => $c['address'], 'country' => $c['country'],
        'city' => $c['city'], 'zipCode' => $c['zipCode'], 'phone' => $c['phone'], 'telephone' => $c['telephone'], 'email' => $c['email'],
        'ownerDetails' => $c['ownerDetails'], 'creditLimit' => $c['creditLimit'], 'creditDays' => $c['creditDays'],
        'discountPercent' => $c['discountPercent'], 'salesman' => $c['salesman'], 'taxRegNo' => $c['taxRegNo'], 'currency' => $c['currency'],
        'accountDetails' => $c['accountDetails'], 'comments' => $c['comments'], 'status' => $c['status'],
    ] + party_rows_as_input($c);
}

/*
 * Payload: customerName, organizationName, address, country, city, zipCode, phone, telephone,
 * email, ownerDetails, creditLimit, creditDays, discountPercent, salesman, taxRegNo, currency,
 * accountDetails, comments, status, contacts, quotations, orders, documents (as for suppliers).
 */
function customer_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(customer_input(customer_find($id)), $data);
    }
    $in = new Input($data);
    $row = [
        'customer_name'     => $in->name('customerName', 'Name', 150),
        'organization_name' => $in->text('organizationName', 'Organization name', 150),
        'address'           => $in->text('address', 'Address', 255),
        'country'           => $in->text('country', 'Country', 80),
        'city'              => $in->text('city', 'City', 100),
        'zip_code'          => $in->text('zipCode', 'Zip code', 20),
        'phone'             => $in->phone('phone', 'Mobile number'),
        'telephone'         => $in->phone('telephone', 'Telephone number'),
        'email'             => $in->email('email', 'Email', 150),
        'owner_details'     => $in->text('ownerDetails', 'Owner details', 150),
        'credit_limit'      => $in->decimal('creditLimit', 'Credit limit', 15, 3) ?? '0',
        'credit_days'       => $in->whole('creditDays', 'Credit days'),
        'discount_percent'  => $in->decimal('discountPercent', 'Discount', 5, 2, false, '100') ?? '0',
        'salesman'          => $in->text('salesman', 'Salesman', 100),
        'tax_reg_no'        => $in->text('taxRegNo', 'Tax registration number', 50),
        'currency'          => $in->choice('currency', 'Currency', PARTY_CURRENCIES, 'OMR'),
        'account_details'   => $in->text('accountDetails', 'Additional info', 65535),
        'comments'          => $in->text('comments', 'Comments', 65535),
        'status'            => $in->choice('status', 'Status', PARTY_STATUSES, 'active'),
    ];
    $rows = party_rows_input($in);
    $in->done();

    $removedFiles = [];
    $id = transaction(static function () use ($id, $row, $rows, &$removedFiles): int {
        $isUpdate = $id !== null;
        if ($isUpdate) {
            query('UPDATE customers SET ' . implode(' = ?, ', array_keys($row)) . ' = ? WHERE id = ?', [...array_values($row), $id]);
        } else {
            $row['customer_code'] = customer_next_code();
            query(
                'INSERT INTO customers (' . implode(', ', array_keys($row)) . ') VALUES (' . implode(', ', array_fill(0, count($row), '?')) . ')',
                array_values($row)
            );
            $id = (int) db()->lastInsertId();
        }
        $removedFiles = party_rows_save('customer', $id, $rows, $isUpdate);
        return $id;
    });
    foreach ($removedFiles as $path) {
        delete_stored($path);
    }
    return customer_find($id);
}

function customer_create(array $data): array
{
    return customer_save($data);
}

function customer_delete(int $id): void
{
    party_delete('customer', 'customers', $id, 'Customer not found.');
}
