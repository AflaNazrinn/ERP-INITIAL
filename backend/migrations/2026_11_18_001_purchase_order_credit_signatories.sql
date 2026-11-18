-- Purchase Order: credit period (November 2026).
-- credit_period: shown and required when the payment mode is Credit (e.g. "30 Days"); empty otherwise.
-- (Signatory slots are kept in extra_signatories, migration 2026_11_17_001. An earlier copy of this file also
-- added an unused purchase_orders.signatories column; where it ran, that column is simply ignored.)
-- It only adds a column. Applied by backend/bin/migrate.php (to every company). MySQL 8 / MariaDB 10.6+.

ALTER TABLE purchase_orders
  ADD COLUMN credit_period VARCHAR(40) NOT NULL DEFAULT '' AFTER payment_mode;
