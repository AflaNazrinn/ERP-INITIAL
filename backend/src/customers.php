<?php
declare(strict_types=1);

require_once __DIR__ . '/suppliers.php';   // contact_rows()

/* Customers (Party › Debtors) and their contacts. */

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
    ];
}

function customers_list(string $search = ''): array
{
    $sql = "SELECT * FROM customers WHERE status = 'active'";
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (customer_code LIKE ? OR customer_name LIKE ?)';
        $params = [like($search), like($search)];
    }
    return array_map('customer_format', query($sql . ' ORDER BY customer_name', $params)->fetchAll());
}

function customer_find(int $id): array
{
    $row = query('SELECT * FROM customers WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Customer not found.');
    }
    $contacts = query('SELECT contact_name, contact_number FROM customer_contacts WHERE customer_id = ? ORDER BY sort_order', [$id])->fetchAll();
    return customer_format($row) + [
        'contacts' => array_map(static fn ($c) => ['name' => $c['contact_name'], 'number' => $c['contact_number']], $contacts),
    ];
}

function customer_next_code(): string
{
    return next_code('customers', 'customer_code', 'CUS');
}

/*
 * Payload: customerName, organizationName, address, country, city, zipCode, phone, telephone,
 * email, ownerDetails, creditLimit, creditDays, discountPercent, salesman, taxRegNo,
 * accountDetails, comments, contacts: [{ name, number }, …].
 */
function customer_create(array $data): array
{
    $in = new Input($data);
    $row = [
        'customer_name'     => $in->text('customerName', 'Name', 150, true),
        'organization_name' => $in->text('organizationName', 'Organization name', 150),
        'address'           => $in->text('address', 'Address', 255),
        'country'           => $in->text('country', 'Country', 80),
        'city'              => $in->text('city', 'City', 100),
        'zip_code'          => $in->text('zipCode', 'Zip code', 20),
        'phone'             => $in->text('phone', 'Mobile number', 40),
        'telephone'         => $in->text('telephone', 'Telephone number', 40),
        'email'             => $in->email('email', 'Email', 150),
        'owner_details'     => $in->text('ownerDetails', 'Owner details', 150),
        'credit_limit'      => $in->decimal('creditLimit', 'Credit limit', 15, 3) ?? '0',
        'credit_days'       => $in->whole('creditDays', 'Credit days'),
        'discount_percent'  => $in->decimal('discountPercent', 'Discount', 5, 2, false, '100') ?? '0',
        'salesman'          => $in->text('salesman', 'Salesman', 100),
        'tax_reg_no'        => $in->text('taxRegNo', 'Tax registration number', 50),
        'account_details'   => $in->text('accountDetails', 'Additional info', 65535),
        'comments'          => $in->text('comments', 'Comments', 65535),
    ];
    $contacts = contact_rows($in, $in->rows('contacts'));
    $in->done();

    $id = transaction(static function () use ($row, $contacts): int {
        $row['customer_code'] = customer_next_code();
        query(
            'INSERT INTO customers (' . implode(', ', array_keys($row)) . ') VALUES (' . implode(', ', array_fill(0, count($row), '?')) . ')',
            array_values($row)
        );
        $id = (int) db()->lastInsertId();
        foreach ($contacts as $order => $contact) {
            query('INSERT INTO customer_contacts (customer_id, contact_name, contact_number, sort_order) VALUES (?, ?, ?, ?)',
                [$id, $contact['name'], $contact['number'], $order + 1]);
        }
        return $id;
    });
    return customer_find($id);
}
