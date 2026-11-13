-- Account head for suppliers and customers (November 2026).
-- Party Creation shows a typed Account Head on both sides (Creditors and Debtors); until now the
-- Debtors page had a one-option dropdown (Sundry Debtors) that was not stored. Existing rows take the
-- usual head for their side.
-- It only adds a column. Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE suppliers
  ADD COLUMN account_head VARCHAR(100) NOT NULL DEFAULT 'Sundry Creditors' AFTER supplier_name;

ALTER TABLE customers
  ADD COLUMN account_head VARCHAR(100) NOT NULL DEFAULT 'Sundry Debtors' AFTER organization_name;
