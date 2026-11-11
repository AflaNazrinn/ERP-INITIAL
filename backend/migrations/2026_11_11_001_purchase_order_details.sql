-- Purchase Order page redesign (November 2026).
--  * Document Details: Salesman / Created By, Salesman Contact and Certification Required
--    (a comma list of N/A, Pressure Test, COC Certificate, MTC Certificate, TPI Certificate).
--  * Supplier Details: the contact person's number.
--  * Remarks are formatted (bold, italic, underline, colour, lists) and stored as cleaned HTML,
--    so they get more room. Older plain-text remarks still show as they were.
-- It only adds columns. Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE purchase_orders
  ADD COLUMN salesman         VARCHAR(100) NOT NULL DEFAULT '' AFTER payment_mode,
  ADD COLUMN salesman_contact VARCHAR(40)  NOT NULL DEFAULT '' AFTER salesman,
  ADD COLUMN certifications   VARCHAR(200) NOT NULL DEFAULT '' AFTER salesman_contact,
  ADD COLUMN contact_number   VARCHAR(40)  NOT NULL DEFAULT '' AFTER contact_name;
