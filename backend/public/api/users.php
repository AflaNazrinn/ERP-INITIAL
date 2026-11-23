<?php
declare(strict_types=1);

/*
 * User Setting (Employee Management › User Setting): sign-ins for employees and their module permissions.
 * GET list / one / POST create / PUT update / DELETE (removes the login, not the employee): see serve_master() in
 * src/api_bootstrap.php. GET ?employees=1 → the User popup: every employee with its login (userId, username, active)
 * when it has one. GET ?modules=1 → the modules and submodules a permission can name.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/users.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && isset($_GET['employees'])) {
    json_out(users_employees());
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && isset($_GET['modules'])) {
    json_out(PERMISSION_MODULES);
}
serve_master('users_list', 'user_find', 'user_next_code', 'user_save', 'user_delete');
