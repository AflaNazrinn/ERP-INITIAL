-- Purchase Order: credit period and named signatories (November 2026).
-- credit_period: shown and required when the payment mode is Credit (e.g. "30 Days"); empty otherwise.
-- signatories: the signature slots printed when "Include Signatory Slots" is ticked, as JSON
-- [{"name": "...", "title": "..."}, …]; NULL prints the standard Prepared / Checked / Approved By boxes.
-- It only adds columns. Applied by backend/bin/migrate.php (to every company). MySQL 8 / MariaDB 10.6+.

ALTER TABLE purchase_orders
  ADD COLUMN credit_period VARCHAR(40) NOT NULL DEFAULT '' AFTER payment_mode,
  ADD COLUMN signatories   TEXT        NULL AFTER include_signatory;
