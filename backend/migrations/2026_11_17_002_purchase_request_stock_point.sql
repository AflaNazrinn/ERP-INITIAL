-- A purchase request's Stock Point (November 2026): picked from the Stock Point list (warehouses) in place of a
-- typed delivery location. delivery_location keeps the stock point's name (and older requests' typed text).
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE purchase_requests
  ADD COLUMN warehouse_id INT UNSIGNED NULL AFTER requested_by,
  ADD CONSTRAINT fk_purchase_requests_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE SET NULL;
