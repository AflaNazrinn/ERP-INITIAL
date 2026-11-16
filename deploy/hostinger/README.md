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
2. **Security → SSL**: install the free SSL certificate for the domain. The site only works over
   HTTPS, because the session cookie is HTTPS-only.
3. **Databases → Management**: every company gets a database of its own (see section 4). Hostinger's
   shared plans do not let a program create databases by itself, so make **one empty database per company
   you are going to create** now (you can add more later). Note each full name, user and password, for example
   `u123456789_company1` / `u123456789_company1` / its password. Hostinger adds the `u…_` prefix.

## 3. Upload

1. Open **File Manager** and go to `domains/<your-domain>/`, the folder that **contains** `public_html`.
2. Delete Hostinger's placeholder `public_html/default.php` (and any `index.html` / `index.php` there).
3. Upload `growth-engine-hostinger.zip` into `domains/<your-domain>/` and **Extract** it there.
   `public_html/` merges with the existing one; `src/`, `config.php` and the rest land next to it.
4. In the same folder, **rename** `.env.example` to **`.env`** and set `APP_ENV=production`. No database
   settings go in `.env` any more.
5. Still in that folder, **rename** `companyconfig.example.php` to **`companyconfig.php`** and edit it.
   Put the empty databases from step 2 under `spare_databases`:

   ```php
   'server' => [
       'host' => 'localhost',
       'port' => 3306,
       'user' => 'u123456789_company1',   // any one of your database users
       'pass' => 'its password',
       'prefix' => 'u123456789_',
   ],
   'spare_databases' => [
       ['name' => 'u123456789_company1', 'user' => 'u123456789_company1', 'pass' => 'its password'],
       ['name' => 'u123456789_company2', 'user' => 'u123456789_company2', 'pass' => 'its password'],
   ],
   ```

   You never type a company in here. When someone creates a company, the program first tries to create a
   new database; Hostinger refuses that, so it takes the first spare database instead, creates the tables in
   it, and moves it from `spare_databases` to `companies` with the company's code. When the spares run out, the
   Create a Company page says so: make another empty database in hPanel and add it to the list.
   On a VPS (or any MySQL login that may `CREATE DATABASE`) you need no spares: the program creates
   `<prefix>ge_<company_name>` itself (e.g. `ge_bluesun_international`) and, where allowed, a MySQL login of the same name that may open only that database.
6. Optional: set `'creation' => ['enabled' => true, 'key' => 'some secret']` so the Create a Company page asks
   for that key, or `'enabled' => false` once all your companies exist. Without it anyone who finds the page can
   create a company (and use up a spare database).
7. Check that the `storage/` folder is writable (permissions 755 is enough on Hostinger). Each company's
   uploaded files go to `storage/companies/<CODE>/`.

`companyconfig.php` holds every company's database password. It stays outside `public_html`, it is never put
in the zip (so an update never overwrites it) and `.gitignore` keeps it out of git. **Back it up** along with the
databases: without it nobody can sign in.

## 4. Create the companies

Open `https://<your-domain>/company.html` (or **Create a company** on the sign-in page), fill in the form and
press **Create Company**. The tables are created in the company's own database, with one user: the username and
password from the form (there is no `admin` / `admin@1234` in a new company). Then sign in with the
**company code**, that username and password. Company A's users only ever reach company A's database and files.

Updates that add a file to `migrations/` must reach every company's database:

- **With SSH**: `php bin/migrate.php` (every company) or `php bin/migrate.php --company=CODE`.
- **Without SSH**: in phpMyAdmin, import the new file into **each** company's database and add its name to that
  database's `schema_migrations` table.

**Upgrading an install from before companies** (one database named in `.env`): leave the old `DB_*` lines in
`.env` once. On the first request the program writes `companyconfig.php` itself, with that login as `server`
and the old database as company **`MAIN`** (its uploaded files stay where they are). Sign in with company code
`MAIN`. You may change its `name` in `companyconfig.php`; keep the code. Then import
`migrations/2026_11_16_001_company_profile.sql` into it (or run `php bin/migrate.php`).

## 5. Check it

- `https://<your-domain>/` opens the dashboard.
- `https://<your-domain>/api/session.php` shows `{"data":{"csrfToken":"...","user":null}}`.
- Creating a company or signing in may answer `{"error": "Server setup: …"}`; it names the fix:

  | It says | Fix |
  |---|---|
  | the database login is not set up yet | Fill in `server` in `companyconfig.php` |
  | this server's database login may not create databases | Add an empty database under `spare_databases` |
  | there is no free spare database left | Make another empty database in hPanel and add it |
  | the database refused the login | A `user` / `pass` in `companyconfig.php` is wrong (full names, with the `u…_` prefix) |
  | a database table is missing / the database is not up to date | Run `php bin/migrate.php`, or import the newest `migrations/` file into that company's database |

- `http://` redirects to `https://`.

**Still stuck?** Upload `deploy/hostinger/check-install.php` (from the repository, not the zip) to
`public_html/api/`, open `https://<your-domain>/api/check-install.php`, and read the `FAIL` lines: it checks the
PHP version, every backend file (missing or an old copy), `companyconfig.php`, each company's database and
tables, and the `storage/` folder, without showing any password. **Delete it afterwards.**

## Updating later

Run the build again, upload the new zip to the same folder and extract it, overwriting files. It never
contains `.env`, `companyconfig.php` or uploaded documents, so all three are kept. If the release adds a file to `migrations/`,
run `php bin/migrate.php` again (or import that file into each company's database in phpMyAdmin and add its
name to `schema_migrations`).

## Demo Purchase Book documents

To see the Purchase Book pages with something in them, add 3 demo documents to each one (Purchase
Request, Quotation Request, Purchase Order, GRN). They use the suppliers, items and stock points already
in the database (at least one supplier is needed; GRNs also need a stock point), and their remarks start
with "Demo data". The script adds them only once.

- **With SSH**: `php bin/seed-purchase-book.php --company=CODE`
- **Without SSH**: upload `backend/bin/seed-purchase-book.php` (from the repository) to `public_html/api/`,
  open `https://<your-domain>/api/seed-purchase-book.php?company=CODE` once, read the list of codes it added,
  then **delete the file**.

## Before real data goes in

- Set an access key under `creation` in `companyconfig.php` (or turn creation off) so strangers cannot create companies.
- Back up `companyconfig.php` together with the databases.
