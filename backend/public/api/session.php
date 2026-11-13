<?php
declare(strict_types=1);

/*
 * Called once on page load, signed in or not. Returns the CSRF token the page sends back in the
 * X-CSRF-Token header on every write, and the signed-in user (null before sign-in).
 */

const PUBLIC_ENDPOINT = true;
require_once __DIR__ . '/../../src/api_bootstrap.php';

allow_methods('GET');
json_out(['csrfToken' => csrf_token(), 'user' => current_user()]);
