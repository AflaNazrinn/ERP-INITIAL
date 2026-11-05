<?php
declare(strict_types=1);

/*
 * Called once on page load. Returns the CSRF token the page sends back in the
 * X-CSRF-Token header on every write. There is no login yet, so user is null.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';

allow_methods('GET');
json_out(['csrfToken' => csrf_token(), 'user' => current_user()]);
