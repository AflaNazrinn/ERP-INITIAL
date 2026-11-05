# Growth Engine backend

Plain PHP JSON endpoints over MySQL, served with the static frontend from one origin by Caddy.

```
Caddyfile                      frontend/ as static files, everything else → PHP-FPM (root backend/public/)
frontend/dashboard.html, .js   the whole UI; calls /api/*.php
backend/
  public/api/<name>.php        thin endpoints: api_bootstrap.php + one module
  src/api_bootstrap.php        JSON headers, session, CSRF check, errors → JSON
  src/security.php             secure session (__Host-auth), CSRF token
  src/master_validation.php    Input checks, next_code(), ValidationError / NotFound
  src/<module>.php             business rules and SQL per master
  config.php, db.php           .env settings, PDO connection
  migrations/*.sql             schema, applied by bin/migrate.php
  bin/                         CLI: migrate.php, seed-demo-data.php
  storage/                     uploaded documents (outside the web root, not committed)
```

The schema follows `database model/Growth-Engine-Masters-HD (1).png`: 19 tables, every foreign key
in the diagram. There is no login yet; `current_user()` in `src/security.php` is where it goes.

## Endpoints

All answer `{ "data": … }`, or `{ "error": "…", "fields": { key: message } }` with 4xx/5xx.
Writes need the `X-CSRF-Token` header from `GET /api/session.php`.

| Endpoint | GET | POST |
|---|---|---|
| `session.php` | CSRF token | |
| `uoms.php`, `categories.php`, `brands.php`, `warehouses.php`, `suppliers.php`, `customers.php`, `items.php` | list (`?q=`), one (`?id=`), next code (`?nextCode`) | create (JSON) |
| `sub-categories.php` | list, `?categoryId=` | |
| `rack-bins.php` | list, `?warehouseId=` | |
| `supplier-documents.php`, `customer-documents.php` | list (`?supplierId=` / `?customerId=`), download (`?id=`) | upload (multipart: owner id + `files[]`) |

## Run it locally

Needs PHP 8.2+ with `pdo_mysql` and `mbstring`, PHP-FPM, MySQL 8 or MariaDB 10.6+, and Caddy 2.

```sh
# 1. Database and user
mysql -u root -p -e "CREATE DATABASE growth_engine CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'growth_engine'@'localhost' IDENTIFIED BY 'change-me';
  GRANT ALL ON growth_engine.* TO 'growth_engine'@'localhost';"

# 2. Settings
cp backend/.env.example backend/.env      # then set DB_PASS

# 3. Schema and demo data
php backend/bin/migrate.php
php backend/bin/seed-demo-data.php        # optional: units, categories, brands, warehouses, racks, items

# 4. Start PHP-FPM (listening on 127.0.0.1:9000), then Caddy from the repository root
APP_ROOT=$PWD caddy run --config Caddyfile
```

Open https://localhost. Caddy creates a local certificate on first run (`caddy trust` installs its root).
