-- Return & Replacement: who made each sales return, sales replacement, purchase return and purchase replacement
-- (the signed-in user when it was created), for the lists' Filter › Employee. Older documents stay NULL.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE sales_returns         ADD COLUMN created_user_id INT UNSIGNED NULL;
ALTER TABLE sales_replacements    ADD COLUMN created_user_id INT UNSIGNED NULL;
ALTER TABLE purchase_returns      ADD COLUMN created_user_id INT UNSIGNED NULL;
ALTER TABLE purchase_replacements ADD COLUMN created_user_id INT UNSIGNED NULL;
