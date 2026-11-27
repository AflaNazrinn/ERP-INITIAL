-- Supply Management: who made each stock adjustment, stock transfer and stock reservation (the signed-in user when it
-- was created), for the lists' Filter › Employee. Older documents stay NULL.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE stock_adjustments  ADD COLUMN created_user_id INT UNSIGNED NULL;
ALTER TABLE stock_transfers    ADD COLUMN created_user_id INT UNSIGNED NULL;
ALTER TABLE stock_reservations ADD COLUMN created_user_id INT UNSIGNED NULL;
