-- The quotation's General Terms & Conditions (November 2026), entered on the Create a Company page and printed on
-- a page of their own at the end of every quotation PDF. NULL: the standard terms (frontend/terms.js).
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE company_profile
  ADD COLUMN terms_conditions TEXT NULL AFTER swift_code;
