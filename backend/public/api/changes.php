<?php
declare(strict_types=1);

/*
 * Live updates: GET → { "versions": { "uoms": 42, "items": 7, … } }, the change count of every endpoint
 * (data_versions). Open dashboards poll this every few seconds and reload only what moved.
 * One small primary-key table: cheap enough to be asked often by many browsers.
 */

require_once __DIR__ . '/../../src/api_bootstrap.php';

allow_methods('GET');
header('Cache-Control: no-store');
$versions = [];
foreach (query('SELECT name, version FROM data_versions')->fetchAll() as $row) {
    $versions[$row['name']] = (int) $row['version'];
}
json_out(['versions' => (object) $versions]);
