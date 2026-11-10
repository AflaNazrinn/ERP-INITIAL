<?php
declare(strict_types=1);

require_once __DIR__ . '/party_records.php';

/*
 * Suppliers (Party › Creditors): their contacts, quotation lines, previous purchase orders and
 * documents (party_records.php), and the brands they sell (supplier_brands).
 */

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
        'contactPerson'  => $row['contact_person'],
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
        'createdAt'      => date_only($row['created_at']),
    ];
}

/* Active suppliers for the lookups; every supplier when $all (the Supplier list page). */
function suppliers_list(string $search = '', bool $all = false): array
{
    $sql = 'SELECT * FROM suppliers' . ($all ? ' WHERE 1 = 1' : " WHERE status = 'active'");
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (supplier_code LIKE ? OR supplier_name LIKE ?)';
        $params = [like($search), like($search)];
    }
    return array_map('supplier_format', query($sql . ' ORDER BY id DESC', $params)->fetchAll());
}

function supplier_find(int $id): array
{
    $row = query('SELECT * FROM suppliers WHERE id = ?', [$id])->fetch();
    if (!$row) {
        throw new NotFound('Supplier not found.');
    }
    $brands = query(
        'SELECT b.id, b.brand_code, b.brand_name FROM supplier_brands sb JOIN brands b ON b.id = sb.brand_id WHERE sb.supplier_id = ? ORDER BY b.brand_name',
        [$id]
    )->fetchAll();
    return supplier_format($row) + party_rows_find('supplier', $id) + [
        'brands' => array_map(static fn ($b) => ['id' => (int) $b['id'], 'code' => $b['brand_code'], 'name' => $b['brand_name']], $brands),
    ];
}

function supplier_next_code(): string
{
    return next_code('suppliers', 'supplier_code', 'SUP');
}

function supplier_input(array $s): array
{
    return [
        'supplierName' => $s['name'], 'address' => $s['address'], 'country' => $s['country'], 'city' => $s['city'], 'currency' => $s['currency'],
        'taxRegNo' => $s['taxRegNo'], 'remarks' => $s['remarks'], 'ownerDetails' => $s['ownerDetails'], 'phone' => $s['phone'],
        'telephone' => $s['telephone'], 'email' => $s['email'], 'debitLimit' => $s['debitLimit'], 'debitDays' => $s['debitDays'],
        'paymentTerms' => $s['paymentTerms'], 'openingBalance' => $s['openingBalance'], 'accountDetails' => $s['accountDetails'],
        'status' => $s['status'], 'brandIds' => array_column($s['brands'], 'id'),
    ] + party_rows_as_input($s);
}

/*
 * Payload: supplierName, address, country, city, currency, taxRegNo, remarks, ownerDetails, phone,
 * telephone, email, debitLimit, debitDays, paymentTerms, openingBalance, accountDetails, status,
 * brandIds: [id, …], contacts: [{ name, designation, number, email }, …],
 * quotations: [{ itemName, description, unit, rate, deliveryTime, warranty }, …],
 * orders: [{ number, date, value, items, status }, …], documents (update only): [{ id, type, expiry }, …].
 */
function supplier_save(array $data, ?int $id = null): array
{
    if ($id !== null) {
        $data = array_replace(supplier_input(supplier_find($id)), $data);
    }
    $in = new Input($data);
    $row = [
        'supplier_name'   => $in->name('supplierName', 'Name', 150),
        'address'         => $in->text('address', 'Address', 255),
        'country'         => $in->text('country', 'Country', 80),
        'city'            => $in->text('city', 'City', 100),
        'currency'        => $in->choice('currency', 'Currency', PARTY_CURRENCIES, 'OMR'),
        'tax_reg_no'      => $in->text('taxRegNo', 'Tax reg number', 50),
        'remarks'         => $in->text('remarks', 'Comments', 65535),
        'owner_details'   => $in->text('ownerDetails', 'Owner name', 150),
        'phone'           => $in->phone('phone', 'Mobile number'),
        'telephone'       => $in->phone('telephone', 'Telephone number'),
        'email'           => $in->email('email', 'Email', 150),
        'debit_limit'     => $in->decimal('debitLimit', 'Credit limit', 12, 2) ?? '0',
        'debit_days'      => $in->whole('debitDays', 'Credit period'),
        'payment_terms'   => $in->choice('paymentTerms', 'Payment terms', SUPPLIER_PAYMENT_TERMS, ''),
        'opening_balance' => $in->decimal('openingBalance', 'Opening balance', 15, 2) ?? '0',
        'account_details' => $in->text('accountDetails', 'Bank details', 65535),
        'status'          => $in->choice('status', 'Status', PARTY_STATUSES, 'active'),
    ];
    $brandIds = $in->ids('brandIds', 'brand', 'brands');
    $rows = party_rows_input($in);
    $in->done();

    // The model keeps the first three contact names on the supplier row as well.
    foreach (['contact_person', 'contact_person2', 'contact_person3'] as $i => $column) {
        $row[$column] = mb_substr($rows['contacts'][$i]['name'] ?? '', 0, $column === 'contact_person' ? 120 : 100);
    }

    $removedFiles = [];
    $id = transaction(static function () use ($id, $row, $brandIds, $rows, &$removedFiles): int {
        $isUpdate = $id !== null;
        if ($isUpdate) {
            query('UPDATE suppliers SET ' . implode(' = ?, ', array_keys($row)) . ' = ? WHERE id = ?', [...array_values($row), $id]);
            query('DELETE FROM supplier_brands WHERE supplier_id = ?', [$id]);
        } else {
            $row['supplier_code'] = supplier_next_code();
            query(
                'INSERT INTO suppliers (' . implode(', ', array_keys($row)) . ') VALUES (' . implode(', ', array_fill(0, count($row), '?')) . ')',
                array_values($row)
            );
            $id = (int) db()->lastInsertId();
        }
        foreach ($brandIds as $brandId) {
            query('INSERT INTO supplier_brands (supplier_id, brand_id) VALUES (?, ?)', [$id, $brandId]);
        }
        $removedFiles = party_rows_save('supplier', $id, $rows, $isUpdate);
        return $id;
    });
    foreach ($removedFiles as $path) {
        delete_stored($path);
    }
    return supplier_find($id);
}

function supplier_create(array $data): array
{
    return supplier_save($data);
}

function supplier_delete(int $id): void
{
    party_delete('supplier', 'suppliers', $id, 'Supplier not found.');
}
