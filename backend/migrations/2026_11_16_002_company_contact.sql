-- The company's contact details (November 2026): phone, email and website, entered on the Create a Company page
-- and printed on the letterhead it generates.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE company_profile
  ADD COLUMN phone   VARCHAR(40)  NULL AFTER postal_code,
  ADD COLUMN email   VARCHAR(150) NULL AFTER phone,
  ADD COLUMN website VARCHAR(150) NULL AFTER email;
