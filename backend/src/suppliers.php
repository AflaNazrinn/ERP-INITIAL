<?php
declare(strict_types=1);

require_once __DIR__ . '/master_validation.php';

/* Suppliers (Party › Creditors), their contacts and the brands they sell (supplier_brands). */

const SUPPLIER_CURRENCIES = ['OMR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'USD', 'EUR', 'INR'];
const SUPPLIER_PAYMENT_TERMS = ['Cash', 'Advance', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90'];

function supplier_format(array $row): array
{
    return [
        'id'             => (int) $row['id'],
        'code'           => $row['supplier_code'],
        'name'           => $row['supplier_name'],
        'city'           => $row['city'],
        'country'        => $row['country'],
        'currency'       => $row['currency'],
        'address'        => $row['address'],
        'taxRegNo'       => $row['tax_reg_no'],
        'ownerDetails'   => $row['owner_details'],
        'phone'          => $row['phone'],
        'telephone'      => $row['telephone'],
        'email'          => $row['email'],
        'paymentTerms'   => $row['payment_terms'],
        'openingBalance' => $row['opening_balance'],
        'debitLimit'     => $row['debit_limit'],
        'debitDays'      => $row['debit_days'] === null ? null : (int) $row['debit_days'],
        'accountDetails' => $row['account_details'] ?? '',
        'remarks'        => $row['remarks'] ?? '',
        'status'         => $row['status'],
    ];
}

function suppliers_list(string $search = ''): array
{
    $sql = "SELECT * FROM suppliers WHERE status = 'active'";
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (supplier_code LIKE ? OR supplier_name LIKE ?)';
        $params = [like($search), like($search)];
    }
    return array_map('supplier_format', query($sql . ' ORDER BY supplier_name', $params)->fetchAll());
}

function supplier_find(int $id): array
{
    $row = query('SELECT * FROM suppliers WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Supplier not found.');
    }
    $contacts = query('SELECT contact_name, contact_number FROM supplier_contacts WHERE supplier_id = ? ORDER BY sort_order', [$id])->fetchAll();
    $brands = query(
        'SELECT b.id, b.brand_code, b.brand_name FROM supplier_brands sb JOIN brands b ON b.id = sb.brand_id WHERE sb.supplier_id = ? ORDER BY b.brand_name',
        [$id]
    )->fetchAll();
    return supplier_format($row) + [
        'contacts' => array_map(static fn ($c) => ['name' => $c['contact_name'], 'number' => $c['contact_number']], $contacts),
        'brands'   => array_map(static fn ($b) => ['id' => (int) $b['id'], 'code' => $b['brand_code'], 'name' => $b['brand_name']], $brands),
    ];
}

function supplier_next_code(): string
{
    return next_code('suppliers', 'supplier_code', 'SUP');
}

/* Contact rows [{ name, number }] → clean rows; blank rows are dropped. */
function contact_rows(Input $in, array $rows): array
{
    $clean = [];
    foreach ($rows as $row) {
        $name = trim(is_scalar($row['name'] ?? null) ? (string) $row['name'] : '');
        $number = trim(is_scalar($row['number'] ?? null) ? (string) $row['number'] : '');
        if ($name === '' && $number === '') {
            continue;
        }
        if (mb_strlen($name) > 100 || mb_strlen($number) > 40) {
            $in->fail('contacts', 'Contact names are at most 100 characters and numbers at most 40.');
        }
        $clean[] = ['name' => mb_substr($name, 0, 100), 'number' => mb_substr($number, 0, 40)];
    }
    return $clean;
}

/*
 * Payload: supplierName, address, country, currency, taxRegNo, remarks, ownerDetails, phone,
 * telephone, email, debitLimit, debitDays, paymentTerms, openingBalance, accountDetails,
 * brandIds: [id, …], contacts: [{ name, number }, …].
 */
function supplier_create(array $data): array
{
    $in = new Input($data);
    $row = [
        'supplier_name'   => $in->text('supplierName', 'Name', 150, true),
        'address'         => $in->text('address', 'Address', 255),
        'country'         => $in->text('country', 'Country', 80),
        'currency'        => $in->choice('currency', 'Currency', SUPPLIER_CURRENCIES, 'OMR'),
        'tax_reg_no'      => $in->text('taxRegNo', 'Tax reg number', 50),
        'remarks'         => $in->text('remarks', 'Comments', 65535),
        'owner_details'   => $in->text('ownerDetails', 'Owner name', 150),
        'phone'           => $in->text('phone', 'Mobile number', 40),
        'telephone'       => $in->text('telephone', 'Telephone number', 40),
        'email'           => $in->email('email', 'Email', 150),
        'debit_limit'     => $in->decimal('debitLimit', 'Credit limit', 12, 2) ?? '0',
        'debit_days'      => $in->whole('debitDays', 'Credit period'),
        'payment_terms'   => $in->choice('paymentTerms', 'Payment terms', SUPPLIER_PAYMENT_TERMS, ''),
        'opening_balance' => $in->decimal('openingBalance', 'Opening balance', 15, 2) ?? '0',
        'account_details' => $in->text('accountDetails', 'Bank details', 65535),
    ];
    $brandIds = $in->ids('brandIds', 'brand', 'brands');
    $contacts = contact_rows($in, $in->rows('contacts'));
    $in->done();

    // The model keeps the first three contact names on the supplier row as well.
    foreach (['contact_person', 'contact_person2', 'contact_person3'] as $i => $column) {
        $row[$column] = mb_substr($contacts[$i]['name'] ?? '', 0, $column === 'contact_person' ? 120 : 100);
    }

    $id = transaction(static function () use ($row, $brandIds, $contacts): int {
        $row['supplier_code'] = supplier_next_code();
        query(
            'INSERT INTO suppliers (' . implode(', ', array_keys($row)) . ') VALUES (' . implode(', ', array_fill(0, count($row), '?')) . ')',
            array_values($row)
        );
        $id = (int) db()->lastInsertId();
        foreach ($brandIds as $brandId) {
            query('INSERT INTO supplier_brands (supplier_id, brand_id) VALUES (?, ?)', [$id, $brandId]);
        }
        foreach ($contacts as $order => $contact) {
            query('INSERT INTO supplier_contacts (supplier_id, contact_name, contact_number, sort_order) VALUES (?, ?, ?, ?)',
                [$id, $contact['name'], $contact['number'], $order + 1]);
        }
        return $id;
    });
    return supplier_find($id);
}
