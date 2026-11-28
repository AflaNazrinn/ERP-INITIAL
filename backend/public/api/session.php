<?php
declare(strict_types=1);

/*
 * Called once on page load, signed in or not. Returns the CSRF token the page sends back in the
 * X-CSRF-Token header on every write, and the signed-in user (null before sign-in) with admin (bool) and
 * permissions ({ "module/submodule": { view, create, edit, delete } }; null for an admin, who may do everything).
 */

const PUBLIC_ENDPOINT = true;
require_once __DIR__ . '/../../src/api_bootstrap.php';

allow_methods('GET');
$user = current_user();
// What the signed-in user may open and do (User Setting): the page hides the rest and says so.
if ($user !== null) {
    $access = current_access();
    if ($access === null || !$access['active']) {
        logout();
        json_out(['csrfToken' => csrf_token(), 'user' => null]);
    }
    $user['admin'] = $access['admin'];
    $user['role'] = $access['admin'] ? 'admin' : $access['role'];
    // Where the app opens: the dashboard for admins and managers, the module cards for staff.
    $user['landing'] = $access['admin'] || $access['role'] === 'manager' ? 'dashboard' : 'modules';
    $user['permissions'] = $access['admin'] ? null : (object) $access['permissions'];
    $user['modules'] = PERMISSION_MODULES;
    // The company's base currency and VAT (Create a Company): the page prices, converts and labels in them.
    $user['baseCurrency'] = company_base_currency();
    $vat = company_vat();
    $user['vatApplicable'] = $vat['applicable'];
    $user['vatPercentage'] = $vat['percentage'];
}
json_out(['csrfToken' => csrf_token(), 'user' => $user]);
