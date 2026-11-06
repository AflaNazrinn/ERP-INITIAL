# Builds the Hostinger upload: dist/hostinger/ and dist/growth-engine-hostinger.zip.
#
#   powershell -ExecutionPolicy Bypass -File deploy/hostinger/build.ps1      (from the repository root)
#
# The zip unpacks into your domain folder (domains/<your-domain>/ in hPanel's File Manager):
#   public_html/        frontend files + backend/public/api, with .htaccess   (the only part on the web)
#   src/, config.php, db.php, migrations/, bin/, storage/, .env.example        (outside the web root)
# public_html/api/*.php reach ../../src, exactly as backend/public/api does in the repository.
# backend/.env is never packed: create it on the server from .env.example.

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$dist = Join-Path $root 'dist'
$out = Join-Path $dist 'hostinger'
$zip = Join-Path $dist 'growth-engine-hostinger.zip'

if (Test-Path $out) { Remove-Item $out -Recurse -Force -Confirm:$false }
if (Test-Path $zip) { Remove-Item $zip -Force -Confirm:$false }
New-Item -ItemType Directory -Force (Join-Path $out 'public_html') | Out-Null

# Web root: the frontend (index.html is the local-dev redirect; .htaccess serves dashboard.html instead) and the API.
Copy-Item (Join-Path $root 'frontend\*') (Join-Path $out 'public_html') -Recurse -Exclude 'index.html'
Copy-Item (Join-Path $root 'backend\public\*') (Join-Path $out 'public_html') -Recurse
Copy-Item (Join-Path $PSScriptRoot 'public_html.htaccess') (Join-Path $out 'public_html\.htaccess')

# Application code, outside the web root.
foreach ($item in 'src', 'migrations', 'bin', 'config.php', 'db.php', '.env.example') {
    Copy-Item (Join-Path $root "backend\$item") $out -Recurse
}
foreach ($dir in 'storage', 'src', 'migrations', 'bin') {
    New-Item -ItemType Directory -Force (Join-Path $out $dir) | Out-Null
    Copy-Item (Join-Path $PSScriptRoot 'deny-all.htaccess') (Join-Path $out "$dir\.htaccess")
}

# Production defaults in the example settings.
$example = Join-Path $out '.env.example'
$text = (Get-Content $example -Raw) `
    -replace '(?m)^# Copy to backend/\.env.*$', '# Copy to .env in this folder (next to config.php) and fill in from hPanel > Databases.' `
    -replace 'APP_ENV=development', 'APP_ENV=production' -replace 'DB_HOST=127.0.0.1', 'DB_HOST=localhost' `
    -replace 'Defaults to backend/storage\.', 'Defaults to storage/ in this folder.'
[System.IO.File]::WriteAllText($example, $text)   # UTF-8 without a BOM

# The local dev-router is not needed on the server.
Remove-Item (Join-Path $out 'bin\dev-router.php') -ErrorAction SilentlyContinue

if (Test-Path (Join-Path $out '.env')) { throw 'A .env file ended up in the package; stop and check.' }

# Zip with forward-slash entry names (Compress-Archive in Windows PowerShell 5.1 writes backslashes,
# which Linux unpacks as file names like "public_html\api\items.php").
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
try {
    foreach ($file in Get-ChildItem $out -Recurse -File -Force) {
        $entry = $file.FullName.Substring($out.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entry, 'Optimal') | Out-Null
    }
} finally {
    $archive.Dispose()
}
Write-Host "Built $out"
Write-Host "Zip   $zip"
