<?php
// Dev stand-in for the Caddyfile: serve frontend/ files, otherwise run backend/public/.
// From the project root: php -S localhost:8080 backend/bin/dev-router.php
$root = dirname(__DIR__, 2);   // project root, wherever it is checked out
$path = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if ($path === '/') $path = '/index.html';
$front = realpath("$root/frontend$path");
if ($front && is_file($front) && str_starts_with($front, realpath("$root/frontend"))) {
    $types = ['html'=>'text/html','css'=>'text/css','js'=>'text/javascript','svg'=>'image/svg+xml','png'=>'image/png','woff2'=>'font/woff2','woff'=>'font/woff','ttf'=>'font/ttf','json'=>'application/json'];
    header('Content-Type: ' . ($types[strtolower(pathinfo($front, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
    readfile($front);
    return true;
}
$back = realpath("$root/backend/public$path");
if ($back && is_file($back) && str_ends_with($back, '.php') && str_starts_with($back, realpath("$root/backend/public"))) {
    chdir(dirname($back));
    $_SERVER['SCRIPT_FILENAME'] = $back;
    require $back;
    return true;
}
http_response_code(404);
echo 'Not found';
