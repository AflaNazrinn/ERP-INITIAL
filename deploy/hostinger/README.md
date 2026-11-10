# Hosting Growth Engine on Hostinger

Hostinger runs LiteSpeed (Apache-compatible) with PHP and MySQL, so the `Caddyfile` is not used there:
`public_html/.htaccess` applies the same HTTPS redirect, security headers and caching rules.

The app must sit at the root of a domain or subdomain (for example `erp.example.com`), not in a
subfolder, because the page calls `/api/...`.

## 1. Build the upload (on your PC)

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/hostinger/build.ps1
```

This makes `dist/growth-engine-hostinger.zip`:

```
public_html/      dashboard.html/.js/.css, fonts/, api/*.php, .htaccess   <- the only part on the web
src/  config.php  db.php  migrations/  bin/  storage/  .env.example      <- outside the web root
```

Your `backend/.env` is never put in the zip.

## 2. Prepare hPanel

1. **Websites → Manage → Advanced → PHP Configuration**: choose **PHP 8.2 or newer**. Under
   PHP extensions, make sure `pdo_mysql` and `mbstring` are ticked (they are by default).
2. **Databases → Management**: create a database and a user. Hostinger adds a prefix, so note the
   full names, for example `u123456789_growth` and `u123456789_growthuser`, and the password.
3. **Security → SSL**: install the free SSL certificate for the domain. The site only works over
   HTTPS, because the session cookie is HTTPS-only.

## 3. Upload

1. Open **File Manager** and go to `domains/<your-domain>/`, the folder that **contains** `public_html`.
2. Delete Hostinger's placeholder `public_html/default.php` (and any `index.html` / `index.php` there).
3. Upload `growth-engine-hostinger.zip` into `domains/<your-domain>/` and **Extract** it there.
   `public_html/` merges with the existing one; `src/`, `config.php` and the rest land next to it.
4. In the same folder, **rename** `.env.example` to **`.env`** (exactly that name: a dot, then `env`) and edit it.
   Use the full database name and user from hPanel → Databases → Management, **with** the `u…_` prefix:

   ```
   APP_ENV=production
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=u123456789_growth
   DB_USER=u123456789_growthuser
   DB_PASS=the password from step 2
   ```

5. Check that the `storage/` folder is writable (permissions 755 is enough on Hostinger). Uploaded
   supplier and customer documents are saved there.

The program only reads `.env` from this folder (next to `config.php`). Without it, or with a wrong name,
user or password, every page that needs the database fails; the API then answers
`{"error":"Server setup: …"}` with what to fix (see **5. Check it**).

## 4. Create the tables

**With SSH** (hPanel → Advanced → SSH Access; on Premium plans and above):

```sh
cd ~/domains/<your-domain>
php bin/migrate.php
php bin/seed-demo-data.php     # optional: sample units, categories, brands, warehouses, items
```

**Without SSH**: open **phpMyAdmin** for the database, choose **Import**, and upload every file in
`migrations/` from the zip, **in name order** (oldest first):

1. `migrations/2026_11_05_001_masters.sql`
2. `migrations/2026_11_09_001_master_fixes.sql`

Then run this in the **SQL** tab, so a later `php bin/migrate.php` knows the files are already applied:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  migration  VARCHAR(190) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO schema_migrations (migration) VALUES ('2026_11_05_001_masters.sql'), ('2026_11_09_001_master_fixes.sql');
```

A database that already has the first file only needs the second one (and its name in `schema_migrations`).
Back the database up first (phpMyAdmin → Export): `2026_11_09_001_master_fixes.sql` changes data, it puts
all record names in capitals and turns old stock point types into "Warehouse".

## 5. Check it

- `https://<your-domain>/` opens the dashboard.
- `https://<your-domain>/api/session.php` shows `{"data":{"csrfToken":"...","user":null}}`.
- `https://<your-domain>/api/uoms.php` shows `{"data":[...]}`. An error names the fix:

  | `{"error": "Server setup: …"}` says | Fix |
  |---|---|
  | the .env file … is missing or incomplete | Rename `.env.example` to `.env` next to `config.php` and fill it in |
  | this database user may not open that database | `DB_NAME` / `DB_USER` are wrong: use the full names with the `u…_` prefix |
  | the database refused the login | `DB_USER` / `DB_PASS` are wrong |
  | a database table is missing / the database is not up to date | Import the files in `migrations/` (section 4) |

- `http://` redirects to `https://`.

**Still stuck?** Upload `deploy/hostinger/check-install.php` (from the repository, not the zip) to
`public_html/api/`, open `https://<your-domain>/api/check-install.php`, and read the `FAIL` lines: it checks the
PHP version, every backend file (missing or an old copy), the database login, the tables and columns,
and the `storage/` folder, without showing any password. **Delete it afterwards.**

## Updating later

Run the build again, upload the new zip to the same folder and extract it, overwriting files. It never
contains `.env` or uploaded documents, so both are kept. If the release adds a file to `migrations/`,
run `php bin/migrate.php` again (or import that file in phpMyAdmin and add its name to
`schema_migrations`).

## Before real data goes in

There is **no login yet** (`current_user()` in `src/security.php` returns nobody), so anyone who finds
the address can read and change the data. Until login is built, protect the whole site in
**hPanel → Advanced → Password Protect Directories** on `public_html`.
