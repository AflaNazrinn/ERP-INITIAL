-- Live updates between browsers (November 2026).
-- One row per API endpoint (uoms, items, suppliers …): version goes up by one on every successful
-- create, update, delete, upload or import through it (json_out in src/api_bootstrap.php).
-- Every open dashboard polls api/changes.php for these few numbers and reloads only the data that changed,
-- so a colleague's import shows up without a page refresh.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

CREATE TABLE IF NOT EXISTS data_versions (
  name       VARCHAR(60)     NOT NULL,
  version    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
