<?php
declare(strict_types=1);

/*
 * The dashboard's figures, from the signed-in company's own records.
 *   GET ?year=2026&month=11 → { kpis, profitLoss, chart, returns, quotations, activities (the latest 5), activityTotal }
 *   GET ?audit=1            → { activities }: every recorded activity, newest first (the Audit Trail page)
 *
 *   Total Purchase   purchase orders dated in the chosen month (not Cancelled), grand totals
 *   Pending Purchase purchase orders not yet Received (or Cancelled), any date
 *   Total Items      items in the Item master
 *   Creditors        how many suppliers there are (Party › Creditors)
 *   Debtors          how many customers there are (Party › Debtors)
 *   Total Employees  user accounts
 *   Chart            purchase orders per week of the chosen month
 *   Sales Return     sales returns dated in the chosen month, their Total Refund
 *   Activities       the latest records created or changed (Purchase Book documents and masters)
 * Sales, purchase returns and quotations are not counted yet, so they stay 0.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';

allow_methods('GET');
header('Cache-Control: no-store');

$auditPage = isset($_GET['audit']);
$year = (int) ($_GET['year'] ?? date('Y'));
$month = (int) ($_GET['month'] ?? date('n'));
if ($year < 2000 || $year > 2100 || $month < 1 || $month > 12) {
    throw new ValidationError(['month' => 'Choose a valid month.'], 'Choose a valid month.');
}
$from = sprintf('%04d-%02d-01', $year, $month);
$to = date('Y-m-t', strtotime($from));
$money = static fn ($value) => number_format((float) $value, 3, '.', '');
$scalar = static fn (string $sql, array $params = []) => query($sql, $params)->fetchColumn();

$totalPurchase = $scalar("SELECT COALESCE(SUM(grand_total), 0) FROM purchase_orders WHERE po_date BETWEEN ? AND ? AND status <> 'Cancelled'", [$from, $to]);
$pendingPurchase = $scalar("SELECT COALESCE(SUM(grand_total), 0) FROM purchase_orders WHERE status NOT IN ('Received', 'Cancelled')");
try {
    $salesReturn = $scalar('SELECT COALESCE(SUM(grand_total), 0) FROM sales_returns WHERE sr_date BETWEEN ? AND ?', [$from, $to]);
} catch (PDOException) {
    $salesReturn = 0;                              // the sales returns migration is not applied yet
}

// Purchase per week of the month: days 1–7 are W1, 8–14 W2 …
$weeks = (int) ceil((int) date('t', strtotime($from)) / 7);
$perWeek = array_fill(1, $weeks, 0.0);
foreach (query("SELECT DAY(po_date) AS d, grand_total FROM purchase_orders WHERE po_date BETWEEN ? AND ? AND status <> 'Cancelled'", [$from, $to])->fetchAll() as $row) {
    $perWeek[(int) ceil((int) $row['d'] / 7)] += (float) $row['grand_total'];
}

// Recent activity. Who made a change is not recorded yet: with one user account it is that user.
$users = query('SELECT username, full_name FROM users ORDER BY id')->fetchAll();
$who = count($users) === 1 ? (trim((string) $users[0]['full_name']) ?: $users[0]['username']) : 'User';
$role = count($users) === 1 ? 'Administrator' : '';
$sources = [
    ['purchase_requests', 'pr_code', "CONCAT(purchase_type, ' purchase request')", 'Purchase Request', 'Purchase Book'],
    ['quotation_requests', 'rfq_code', "'Quotation request to suppliers'", 'Quotation Request', 'Purchase Book'],
    ['purchase_orders', 'po_code', "CONCAT('Purchase order, ', status)", 'Purchase Order', 'Purchase Book'],
    ['grns', 'grn_code', "'Goods received'", 'Goods Receipt Note', 'Purchase Book'],
    ['items', 'item_code', 'item_name', 'Item', 'Item Master'],
    ['suppliers', 'supplier_code', 'supplier_name', 'Supplier', 'Supplier Master'],
    ['customers', 'customer_code', 'customer_name', 'Customer', 'Customer Master'],
];
$activities = [];
foreach ($sources as [$table, $codeColumn, $detail, $noun, $module]) {
    try {
        // The dashboard needs only the newest few of each table; the Audit Trail page lists them all.
        $limit = $auditPage ? '' : ' LIMIT 5';
        $rows = query("SELECT $codeColumn AS code, $detail AS detail, created_at, updated_at FROM $table ORDER BY GREATEST(created_at, updated_at) DESC$limit")->fetchAll();
    } catch (PDOException) {
        continue;                                 // a table this company's database does not have yet
    }
    foreach ($rows as $row) {
        $edited = strtotime((string) $row['updated_at']) - strtotime((string) $row['created_at']) > 2;
        $activities[] = [
            'at' => date('c', strtotime((string) ($edited ? $row['updated_at'] : $row['created_at']))),
            'user' => $who, 'role' => $role,
            'title' => ($edited ? 'Updated ' : 'Created ') . (preg_match('/^[AEIOU]/', $noun) ? 'an ' : 'a ') . $noun,
            'detail' => trim((string) $row['detail']) . ':', 'ref' => '#' . $row['code'],
            'module' => $module, 'status' => $edited ? 'Updated' : 'Completed',
        ];
    }
}
usort($activities, static fn ($a, $b) => strcmp($b['at'], $a['at']));
if ($auditPage) {
    json_out(['activities' => $activities]);
}
// How many activities there are in all (shown under the dashboard's latest 5).
$activityTotal = 0;
foreach ($sources as [$table]) {
    try {
        $activityTotal += (int) $scalar("SELECT COUNT(*) FROM $table");
    } catch (PDOException) {
        // a table this company's database does not have yet
    }
}

json_out([
    'kpis' => [
        'totalSales' => $money(0), 'totalPurchase' => $money($totalPurchase), 'pendingPurchase' => $money($pendingPurchase),
        'totalItems' => (int) $scalar('SELECT COUNT(*) FROM items'),
        'totalEmployees' => (int) $scalar('SELECT COUNT(*) FROM users'),
        'creditors' => (int) $scalar('SELECT COUNT(*) FROM suppliers'),
        'debtors' => (int) $scalar('SELECT COUNT(*) FROM customers'),
    ],
    'profitLoss' => ['overall' => ['margin' => '0.0'], 'lastMonth' => ['margin' => '0.0']],
    'chart' => [
        'sales' => $money(0), 'purchase' => $money(array_sum($perWeek)),
        'weeks' => array_map(static fn ($week) => ['label' => "W$week", 'sales' => $money(0), 'purchase' => $money($perWeek[$week])], array_keys($perWeek)),
    ],
    'returns' => ['purchaseReturn' => $money(0), 'salesReturn' => $money($salesReturn), 'rmaCount' => 0, 'resolvedCount' => 0],
    'quotations' => ['total' => 0, 'totalValue' => $money(0), 'pending' => 0, 'approved' => 0, 'rejected' => 0],
    'activities' => array_slice($activities, 0, 5),
    'activityTotal' => $activityTotal,
]);
