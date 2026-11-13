-- Payment terms for customers (November 2026).
-- The Debtors side of Party Creation now has the same Financial Terms as Creditors: Credit Limit,
-- Credit Period, Payment Terms and Opening Balance. customers already has opening_balance; this adds
-- payment_terms (one of Cash, Advance, Net 15 … Net 90, or blank), as suppliers.payment_terms.
-- It only adds a column. Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE customers
  ADD COLUMN payment_terms VARCHAR(30) NOT NULL DEFAULT '' AFTER credit_days;
