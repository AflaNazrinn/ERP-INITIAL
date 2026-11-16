<?php
declare(strict_types=1);

/*
 * Create a Company (frontend/company.html). Public: the page opens from the sign-in page, before anyone
 * is signed in. Each company gets a database of its own (src/company_setup.php).
 *   GET               → { enabled, keyRequired, nextCode }  may companies be created here; is an access key
 *                       asked for; the automatic code the next company gets (CMP0001 …)
 *   POST (multipart)  → 201 { code, name }; 422 with field errors; 409 when creation is turned off or too
 *                       many were made from this browser; 500 "Server setup: …" names what to set up in
 *                       companyconfig.php. Needs X-CSRF-Token (from api/session.php), like every write.
 * Fields: companyName, companyCode (or codeAuto=1: the server assigns the next CMP code), companyType, businessType, crNumber, crExpiry, vatNumber, legalStructure,
 * baseCurrency, financialYearStart, vatApplicable (1/0), vatPercentage, building, street, area, city, country,
 * poBox, postalCode, bankName, accountHolder, accountNumber, iban, swiftCode, username, password,
 * confirmPassword, accessKey; files logo, letterhead, crCertificate, vatCertificate.
 */

const PUBLIC_ENDPOINT = true;
require_once __DIR__ . '/../../src/api_bootstrap.php';
require_once __DIR__ . '/../../src/company_setup.php';

$method = allow_methods('GET', 'POST');
if ($method === 'GET') {
    json_out(company_creation_settings());
}
set_time_limit(120);
json_out(company_create($_POST, $_FILES), 201);
