<?php
declare(strict_types=1);

/*
 * Who may open and do what (Employee Management › User Setting).
 * The modules and their submodules are the Quick Menu's: a permission key is "module/submodule", the page's route
 * (#/purchase-book/purchase-order). Each submodule has view (open its list and records), create, edit and delete.
 * An admin (users.is_admin: the company's own sign-in) may do everything; other users only what User Setting allows.
 *
 * The API checks every write against the endpoint's submodule (permission_enforce, run by api_bootstrap.php):
 * POST is a create (an upload, a bulk import, or a POST on ?id= is a create or an edit), PUT an edit, DELETE a delete
 * (removing an uploaded file is an edit). Reads are open to every signed-in user, because forms read other modules'
 * lists for their popups (a purchase order lists the suppliers and items), except the dashboard figures, which need
 * their own view permission. Employee Management › Employee (the employees and their files) is for managers, as far as
 * User Setting allows, to read as well as to change; staff never reach it. User Setting (the user accounts) is the
 * admins' alone: it is hidden from managers too. The audit log is the admins' alone; a manager's dashboard
 * leaves out the audit trail, profit & loss, creditors, debtors and employees (api/dashboard.php). The page hides what is not allowed and says so.
 */

const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete'];
const USER_ROLES = ['staff', 'manager'];   // staff never see the dashboard; managers and admins open on it

/* Modules for managers only: staff are never granted them (a save drops their ticks, can() refuses them). */
const PERMISSION_MANAGER_MODULES = ['dashboard', 'employee'];

const PERMISSION_MODULES = [
    ['key' => 'dashboard', 'name' => 'Dashboard', 'subs' => [
        ['key' => 'overview', 'name' => 'Dashboard Figures'],   // managers; the full dashboard and audit log are the admins'
    ]],
    ['key' => 'masters', 'name' => 'Masters', 'subs' => [
        ['key' => 'supplier', 'name' => 'Supplier'],
        ['key' => 'customer', 'name' => 'Customer'],
        ['key' => 'item', 'name' => 'Item'],
        ['key' => 'uom', 'name' => 'UOM'],
        ['key' => 'brand', 'name' => 'Brand'],
        ['key' => 'category', 'name' => 'Category'],
        ['key' => 'stock-point', 'name' => 'Stock Point'],
    ]],
    ['key' => 'purchase-book', 'name' => 'Purchase Book', 'subs' => [
        ['key' => 'purchase-request', 'name' => 'Purchase Request'],
        ['key' => 'quotation-request', 'name' => 'Quotation Request'],
        ['key' => 'purchase-order', 'name' => 'Purchase Order'],
        ['key' => 'grn', 'name' => 'Goods Receipt Note'],
    ]],
    ['key' => 'trade', 'name' => 'Trade Management', 'subs' => [
        ['key' => 'quotation', 'name' => 'Quotation'],
        ['key' => 'sales-order', 'name' => 'Sales Order'],
        ['key' => 'delivery-note', 'name' => 'Delivery Note'],
    ]],
    ['key' => 'entry', 'name' => 'Transaction Entry', 'subs' => [
        ['key' => 'tax-invoice', 'name' => 'Tax Invoice'],
        ['key' => 'purchase-entry', 'name' => 'Purchase Entry'],
        ['key' => 'sales-entry', 'name' => 'Sales Entry'],
    ]],
    ['key' => 'returns', 'name' => 'Return & Replacement', 'subs' => [
        ['key' => 'sales-return', 'name' => 'Sales Return'],
        ['key' => 'sales-replacement', 'name' => 'Sales Replacement'],
        ['key' => 'purchase-return', 'name' => 'Purchase Return'],
        ['key' => 'purchase-replacement', 'name' => 'Purchase Replacement'],
    ]],
    ['key' => 'supply', 'name' => 'Supply Management', 'subs' => [
        ['key' => 'stock-transfer', 'name' => 'Stock Transfer'],
        ['key' => 'stock-adjustment', 'name' => 'Stock Adjustment'],
        ['key' => 'stock-reservation', 'name' => 'Stock Reservation'],
        ['key' => 'stock-report', 'name' => 'Stock Ledger'],
    ]],
    // Employee Management: Employee is for managers; User Setting is the admins' alone, so it is not offered here.
    ['key' => 'employee', 'name' => 'Employee Management', 'subs' => [
        ['key' => 'employee', 'name' => 'Employee'],
    ]],
];

/* API endpoint (file name) → the submodule its writes belong to. */
const PERMISSION_ENDPOINTS = [
    'dashboard'             => 'dashboard/overview',
    'suppliers'             => 'masters/supplier',
    'supplier-documents'    => 'masters/supplier',
    'customers'             => 'masters/customer',
    'customer-documents'    => 'masters/customer',
    'items'                 => 'masters/item',
    'item-documents'        => 'masters/item',
    'uoms'                  => 'masters/uom',
    'brands'                => 'masters/brand',
    'categories'            => 'masters/category',
    'sub-categories'        => 'masters/category',
    'warehouses'            => 'masters/stock-point',
    'rack-bins'             => 'masters/stock-point',
    'purchase-requests'     => 'purchase-book/purchase-request',
    'quotation-requests'    => 'purchase-book/quotation-request',
    'purchase-orders'       => 'purchase-book/purchase-order',
    'grns'                  => 'purchase-book/grn',
    'quotations'            => 'trade/quotation',
    'sales-orders'          => 'trade/sales-order',
    'delivery-notes'        => 'trade/delivery-note',
    'tax-invoices'          => 'entry/tax-invoice',
    'purchase-entries'      => 'entry/purchase-entry',
    'sales-entries'         => 'entry/sales-entry',
    'sales-returns'         => 'returns/sales-return',
    'sales-replacements'    => 'returns/sales-replacement',
    'purchase-returns'      => 'returns/purchase-return',
    'purchase-replacements' => 'returns/purchase-replacement',
    'stock-transfers'       => 'supply/stock-transfer',
    'stock-adjustments'     => 'supply/stock-adjustment',
    'stock-reservations'    => 'supply/stock-reservation',
    'stock-report'          => 'supply/stock-report',
    'damage-restock'        => 'supply/stock-report',      // Stock Ledger › Damaged Stock › Move to Stock (a create)
    'employees'             => 'employee/employee',
    'employee-files'        => 'employee/employee',
];

/* Endpoints that hold uploaded files: adding or removing one changes the record (create or edit). */
const PERMISSION_FILE_ENDPOINTS = ['supplier-documents', 'customer-documents', 'item-documents', 'employee-files'];

/* Company settings (logo, seal): admins only. */
const PERMISSION_ADMIN_WRITES = ['company-icon', 'company-seal'];

/* User Setting (the user accounts): admins only, to read as well as to change. */
const PERMISSION_ADMIN_ONLY = ['users'];

/* Endpoints whose reads need the view permission too (personal records no other form reads). */
const PERMISSION_GUARDED_READS = ['employees', 'employee-files'];

const PERMISSION_DENIED = "You don't have permission to do this. Please contact your manager or admin.";

/* Every permission key: ["dashboard/overview", …]. */
function permission_keys(): array
{
    $keys = [];
    foreach (PERMISSION_MODULES as $module) {
        foreach ($module['subs'] as $sub) {
            $keys[] = $module['key'] . '/' . $sub['key'];
        }
    }
    return $keys;
}

/* Cleans a permissions payload: only known keys, only the four actions, booleans; create, edit or delete give view. */
function permission_clean(mixed $raw): array
{
    $clean = [];
    if (!is_array($raw)) {
        return $clean;
    }
    foreach (permission_keys() as $key) {
        $entry = $raw[$key] ?? null;
        if (!is_array($entry)) {
            continue;
        }
        $flags = [];
        foreach (PERMISSION_ACTIONS as $action) {
            $value = $entry[$action] ?? false;
            $flags[$action] = $value === true || $value === 1 || $value === '1' || $value === 'true';
        }
        if ($flags['create'] || $flags['edit'] || $flags['delete']) {
            $flags['view'] = true;
        }
        if (in_array(true, $flags, true)) {
            $clean[$key] = $flags;
        }
    }
    return $clean;
}

/*
 * The signed-in user's access, read from the database on every request (a change on User Setting applies at once):
 * { admin: bool, active: bool, permissions: [...] }. null when the user no longer exists.
 * A database without the user-access columns yet (migration not run) treats every user as an admin, as before.
 */
function current_access(): ?array
{
    static $access = false;
    if ($access !== false) {
        return $access;
    }
    $userId = (int) ($_SESSION['user']['id'] ?? 0);
    if ($userId < 1) {
        return $access = null;
    }
    try {
        $row = query('SELECT * FROM users WHERE id = ?', [$userId])->fetch();
    } catch (PDOException $e) {
        if ((int) ($e->errorInfo[1] ?? 0) === 1054) {
            return $access = ['admin' => true, 'role' => 'manager', 'active' => true, 'permissions' => []];
        }
        throw $e;
    }
    if ($row === false) {
        return $access = null;
    }
    return $access = [
        'admin'       => (bool) ($row['is_admin'] ?? true),
        'role'        => in_array($row['role'] ?? '', USER_ROLES, true) ? $row['role'] : 'staff',
        'active'      => (bool) ($row['active'] ?? true),
        'permissions' => permission_clean(json_decode((string) ($row['permissions'] ?? ''), true)),
    ];
}

function can(string $key, string $action): bool
{
    $access = current_access();
    if ($access === null || !$access['active']) {
        return false;
    }
    if ($access['admin']) {
        return true;
    }
    if (in_array(strtok($key, '/'), PERMISSION_MANAGER_MODULES, true) && $access['role'] !== 'manager') {
        return false;                            // staff have no dashboard and no Employee Management
    }
    return !empty($access['permissions'][$key][$action]);
}

/* 403 unless the signed-in user may do this request on this endpoint. */
function permission_enforce(string $endpoint, string $method): void
{
    $access = current_access();
    if ($access === null || !$access['active']) {
        logout();
        json_error('Please sign in.', 401);
    }
    if ($access['admin']) {
        return;
    }
    $read = in_array($method, ['GET', 'HEAD'], true);
    if (in_array($endpoint, PERMISSION_ADMIN_ONLY, true)) {
        json_error(PERMISSION_DENIED, 403);
    }
    if (in_array($endpoint, PERMISSION_ADMIN_WRITES, true)) {
        if (!$read) {
            json_error(PERMISSION_DENIED, 403);
        }
        return;
    }
    $key = PERMISSION_ENDPOINTS[$endpoint] ?? null;
    if ($key === null) {
        return;
    }
    if ($read) {
        $allowed = match ($endpoint) {
            'dashboard'                   => !isset($_GET['audit']) && can('dashboard/overview', 'view'),   // the audit log: admins only
            default                       => !in_array($endpoint, PERMISSION_GUARDED_READS, true) || can($key, 'view'),
        };
    } elseif (in_array($endpoint, PERMISSION_FILE_ENDPOINTS, true)) {
        $allowed = can($key, 'create') || can($key, 'edit') || ($method === 'DELETE' && can($key, 'delete'));
    } elseif ($method === 'DELETE') {
        $allowed = can($key, 'delete');
    } elseif ($method === 'POST' && !isset($_GET['bulk']) && !isset($_GET['id'])) {
        $allowed = can($key, 'create');
    } elseif ($method === 'POST') {
        $allowed = can($key, 'create') || can($key, 'edit');
    } else {
        $allowed = can($key, 'edit');
    }
    if (!$allowed) {
        json_error(PERMISSION_DENIED, 403);
    }
}
