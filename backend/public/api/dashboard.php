<?php
declare(strict_types=1);

/*
 * The dashboard's figures, from the signed-in company's own records.
 *   GET ?year=2026&month=11 → { kpis, profitLoss, chart, returns, quotations, activities (the latest 5), activityTotal }
 *   GET ?audit=1            → { activities }: every recorded activity, newest first (the Audit Trail page)
 *
 *   Total Purchase   purchase entries dated in the chosen month, grand totals (the chart's purchase bars too), as
 *                    Total Sales counts the sales entries
 *   Pending Purchase purchase orders not yet Received (or Cancelled), any date
 *   Total Items      items in the Item master
 *   Creditors        how many suppliers there are (Party › Creditors)
 *   Debtors          how many customers there are (Party › Debtors)
 *   Total Employees  employee records (Employee master)
 *   Profit & Loss    sales orders' own profit (Total Profit) over their selling value: last month and overall
 *   Chart            sales and purchase entries per week of the chosen month
 *   Sales Return     sales returns dated in the chosen month, their Total Refund
 *   Purchase Return  purchase returns dated in the chosen month, their Total Return Amount
 *   Return causes    the month's commonest return reason (sales and purchase returns), and how many returns had it
 *   Activities       the latest records created or changed (documents and masters), by the person each records
 *                    (Requested By / Created By / Salesman); "Not recorded" where a record keeps nobody
 *   Total Sales      sales entries dated in the chosen month, grand totals (the chart's sales bars too)
 *   Quotations       quotations dated in the chosen month: converted (a sales order made from it), still open
 *                    (30 days or less old) and expired (older, never converted)
 *   Insights         (a manager's dashboard) the month's top selling items, customers and suppliers
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

$pendingPurchase = $scalar("SELECT COALESCE(SUM(grand_total), 0) FROM purchase_orders WHERE status NOT IN ('Received', 'Cancelled')");
try {
    $salesReturn = $scalar('SELECT COALESCE(SUM(grand_total), 0) FROM sales_returns WHERE sr_date BETWEEN ? AND ?', [$from, $to]);
} catch (PDOException) {
    $salesReturn = 0;                              // the sales returns migration is not applied yet
}
try {
    $purchaseReturn = $scalar('SELECT COALESCE(SUM(grand_total), 0) FROM purchase_returns WHERE prt_date BETWEEN ? AND ?', [$from, $to]);
} catch (PDOException) {
    $purchaseReturn = 0;                           // the purchase returns migration is not applied yet
}

// A query on a table this company's database may not have yet: $fallback instead.
$safe = static function (callable $read, $fallback) {
    try {
        return $read();
    } catch (PDOException) {
        return $fallback;
    }
};

// Purchase (purchase entries) and sales (sales entries) per week of the month: days 1–7 are W1, 8–14 W2 …
$weeks = (int) ceil((int) date('t', strtotime($from)) / 7);
$perWeek = array_fill(1, $weeks, 0.0);
foreach ($safe(static fn () => query('SELECT DAY(pe_date) AS d, grand_total FROM purchase_entries WHERE pe_date BETWEEN ? AND ?', [$from, $to])->fetchAll(), []) as $row) {
    $perWeek[(int) ceil((int) $row['d'] / 7)] += (float) $row['grand_total'];
}
$totalPurchase = array_sum($perWeek);
$salesPerWeek = array_fill(1, $weeks, 0.0);
foreach ($safe(static fn () => query('SELECT DAY(se_date) AS d, grand_total FROM sales_entries WHERE se_date BETWEEN ? AND ?', [$from, $to])->fetchAll(), []) as $row) {
    $salesPerWeek[(int) ceil((int) $row['d'] / 7)] += (float) $row['grand_total'];
}
$totalSales = array_sum($salesPerWeek);
$chart = [
    'sales' => $money($totalSales), 'purchase' => $money(array_sum($perWeek)),
    'weeks' => array_map(static fn ($week) => ['label' => "W$week", 'sales' => $money($salesPerWeek[$week]), 'purchase' => $money($perWeek[$week])], array_keys($perWeek)),
];

// Quotations of the month: converted into a sales order, open (30 days old or less) or expired.
$quotations = $safe(static function () use ($from, $to, $money) {
    $row = query("SELECT COUNT(*) AS total, COALESCE(SUM(q.grand_total), 0) AS value,
                         SUM(EXISTS (SELECT 1 FROM sales_orders so WHERE so.quotation_id = q.id)) AS converted,
                         SUM(NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.quotation_id = q.id) AND q.qt_date >= CURDATE() - INTERVAL 30 DAY) AS open_count
                  FROM quotations q WHERE q.qt_date BETWEEN ? AND ?", [$from, $to])->fetch();
    $total = (int) $row['total'];
    $converted = (int) $row['converted'];
    $open = (int) $row['open_count'];
    return ['total' => $total, 'totalValue' => $money($row['value']), 'pending' => $open, 'approved' => $converted, 'rejected' => max(0, $total - $converted - $open)];
}, ['total' => 0, 'totalValue' => $money(0), 'pending' => 0, 'approved' => 0, 'rejected' => 0]);

// Returns of the month: how many (sales and purchase), and their commonest reason with how many had it.
$reasons = $safe(static fn () => query("SELECT reason, COUNT(*) AS n FROM (
        SELECT TRIM(return_reason) AS reason FROM sales_returns WHERE sr_date BETWEEN ? AND ?
        UNION ALL SELECT TRIM(return_reason) FROM purchase_returns WHERE prt_date BETWEEN ? AND ?) r
    GROUP BY reason ORDER BY n DESC, reason", [$from, $to, $from, $to])->fetchAll(), []);
$returnCount = array_sum(array_map(static fn ($row) => (int) $row['n'], $reasons));
$topReason = array_values(array_filter($reasons, static fn ($row) => $row['reason'] !== ''))[0] ?? null;
$returns = ['purchaseReturn' => $money($purchaseReturn), 'salesReturn' => $money($salesReturn), 'rmaCount' => $returnCount,
    'topReason' => $topReason ? $topReason['reason'] : '', 'topReasonCount' => $topReason ? (int) $topReason['n'] : 0];

// Profit & Loss: the sales orders' Total Profit over their selling value (subtotal), in %. Proforma invoices left out.
$margin = static fn (string $where, array $params) => $safe(static function () use ($where, $params) {
    $row = query("SELECT COALESCE(SUM(subtotal), 0) AS sold, COALESCE(SUM(total_profit), 0) AS profit FROM sales_orders
                  WHERE document_title = 'Sales Order'$where", $params)->fetch();
    return (float) $row['sold'] > 0 ? number_format((float) $row['profit'] / (float) $row['sold'] * 100, 1, '.', '') : '0.0';
}, '0.0');
$lastFrom = date('Y-m-01', strtotime('first day of last month'));
$lastTo = date('Y-m-t', strtotime($lastFrom));

// Recent activity: [table, code, detail, noun, module, the column naming who made it (Requested By / Created By /
// Salesman), or null where the record keeps nobody: then "Not recorded", never a guess].
$sources = [
    ['purchase_requests', 'pr_code', "CONCAT(purchase_type, ' purchase request')", 'Purchase Request', 'Purchase Book', 'requested_by'],
    ['quotation_requests', 'rfq_code', "'Quotation request to suppliers'", 'Quotation Request', 'Purchase Book', 'created_by'],
    ['purchase_orders', 'po_code', "CONCAT('Purchase order, ', status)", 'Purchase Order', 'Purchase Book', 'salesman'],
    ['grns', 'grn_code', "'Goods received'", 'Goods Receipt Note', 'Purchase Book', null],
    ['quotations', 'qt_code', "'Quotation to a customer'", 'Quotation', 'Trade', 'salesman'],
    ['sales_orders', 'so_code', "CONCAT(document_title, ', ', status)", 'Sales Order', 'Trade', 'salesman'],
    ['delivery_notes', 'dn_code', "'Goods delivered'", 'Delivery Note', 'Trade', 'salesman'],
    ['tax_invoices', 'ti_code', 'document_title', 'Tax Invoice', 'Transaction Entry', 'salesman'],
    ['purchase_entries', 'pe_code', "'Supplier bill recorded'", 'Purchase Entry', 'Transaction Entry', null],
    ['sales_entries', 'se_code', "'Customer sale recorded'", 'Sales Entry', 'Transaction Entry', null],
    ['sales_returns', 'sr_code', 'return_reason', 'Sales Return', 'Returns', null],
    ['purchase_returns', 'prt_code', 'return_reason', 'Purchase Return', 'Returns', 'created_by'],
    ['items', 'item_code', 'item_name', 'Item', 'Item Master', null],
    ['suppliers', 'supplier_code', 'supplier_name', 'Supplier', 'Supplier Master', null],
    ['customers', 'customer_code', 'customer_name', 'Customer', 'Customer Master', null],
];
$activities = [];
foreach ($sources as [$table, $codeColumn, $detail, $noun, $module, $byColumn]) {
    try {
        // The dashboard needs only the newest few of each table; the Audit Trail page lists them all.
        $limit = $auditPage ? '' : ' LIMIT 5';
        $by = $byColumn ? "TRIM($byColumn)" : "''";
        $rows = query("SELECT $codeColumn AS code, $detail AS detail, $by AS who, created_at, updated_at FROM $table ORDER BY GREATEST(created_at, updated_at) DESC$limit")->fetchAll();
    } catch (PDOException) {
        continue;                                 // a table this company's database does not have yet
    }
    foreach ($rows as $row) {
        $edited = strtotime((string) $row['updated_at']) - strtotime((string) $row['created_at']) > 2;
        $activities[] = [
            'at' => date('c', strtotime((string) ($edited ? $row['updated_at'] : $row['created_at']))),
            'user' => (string) $row['who'] !== '' ? (string) $row['who'] : 'Not recorded', 'role' => $byColumn === 'requested_by' ? 'Requested By' : ((string) $row['who'] !== '' ? 'Created By' : ''),
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

// A manager (not an admin) sees the sales, purchase, items, chart, returns and quotations: no audit trail, profit & loss,
// creditors, debtors or employees, which are the admins' alone.
if (!(current_access()['admin'] ?? false)) {
    json_out([
        'kpis' => [
            'totalSales' => $money($totalSales), 'totalPurchase' => $money($totalPurchase), 'pendingPurchase' => $money($pendingPurchase),
            'totalItems' => (int) $scalar('SELECT COUNT(*) FROM items'),
        ],
        'chart' => $chart,
        'returns' => $returns,
        'quotations' => $quotations,
        'insights' => dashboard_insights($from, $to, $safe, $money),
    ]);
}

json_out([
    'kpis' => [
        'totalSales' => $money($totalSales), 'totalPurchase' => $money($totalPurchase), 'pendingPurchase' => $money($pendingPurchase),
        'totalItems' => (int) $scalar('SELECT COUNT(*) FROM items'),
        'totalEmployees' => (int) $safe(static fn () => $scalar('SELECT COUNT(*) FROM employees'), $scalar('SELECT COUNT(*) FROM users')),
        'creditors' => (int) $scalar('SELECT COUNT(*) FROM suppliers'),
        'debtors' => (int) $scalar('SELECT COUNT(*) FROM customers'),
    ],
    'profitLoss' => ['overall' => ['margin' => $margin('', [])], 'lastMonth' => ['margin' => $margin(' AND so_date BETWEEN ? AND ?', [$lastFrom, $lastTo])]],
    'chart' => $chart,
    'returns' => $returns,
    'quotations' => $quotations,
    'activities' => array_slice($activities, 0, 5),
    'activityTotal' => $activityTotal,
]);

/*
 * A manager's dashboard, besides the figures:
 *   items       the month's top 5 selling items by sales order value (quantity and how many orders)
 *   customers   the month's top 5 customers by sales order value; suppliers: top 5 suppliers by purchase order value
 */
function dashboard_insights(string $from, string $to, callable $safe, callable $money): array
{
    $top = static fn (string $sql) => array_map(static fn ($row) => ['name' => $row['name'], 'count' => (int) $row['n'], 'value' => $money($row['v'])],
        $safe(static fn () => query($sql, [$from, $to])->fetchAll(), []));
    $customers = $top('SELECT c.customer_name AS name, COUNT(*) AS n, SUM(so.grand_total) AS v FROM sales_orders so JOIN customers c ON c.id = so.customer_id
                       WHERE so.so_date BETWEEN ? AND ? GROUP BY c.id, c.customer_name ORDER BY v DESC LIMIT 5');
    $suppliers = $top("SELECT s.supplier_name AS name, COUNT(*) AS n, SUM(po.grand_total) AS v FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
                       WHERE po.po_date BETWEEN ? AND ? AND po.status <> 'Cancelled' GROUP BY s.id, s.supplier_name ORDER BY v DESC LIMIT 5");

    // The month's best-selling items by sales order value (an item picked from the master counted once; a typed one by name).
    $items = array_map(static fn ($row) => ['name' => $row['name'], 'count' => (int) $row['n'], 'value' => $money($row['v']),
        'qty' => rtrim(rtrim((string) $row['qty'], '0'), '.'), 'unit' => (string) $row['unit']],
        $safe(static fn () => query('SELECT MAX(i.item_name) AS name, MAX(i.unit) AS unit, SUM(i.quantity) AS qty, COUNT(DISTINCT so.id) AS n, SUM(i.line_total) AS v
                                     FROM sales_order_items i JOIN sales_orders so ON so.id = i.sales_order_id
                                     WHERE so.so_date BETWEEN ? AND ? GROUP BY COALESCE(CAST(i.item_id AS CHAR), i.item_name) ORDER BY v DESC LIMIT 5', [$from, $to])->fetchAll(), []));

    return [
        'items' => $items,
        'customers' => $customers,
        'suppliers' => $suppliers,
    ];
}
