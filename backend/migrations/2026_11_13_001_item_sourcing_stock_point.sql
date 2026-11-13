-- Item sourcing lines get a stock point (November 2026).
-- The Item page's sourcing line now picks Stock Point where it picked Brand. Sourcing lines are the
-- item_brands rows, so they take a warehouse_id; brand_id stays (older lines keep their brand, and the
-- Quick Item popup still sets one). A stock point used by a line cannot be deleted (409 in use).
-- It only adds a column. Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE item_brands
  ADD COLUMN warehouse_id INT UNSIGNED NULL AFTER supplier_id,
  ADD KEY idx_item_brands_warehouse (warehouse_id),
  ADD CONSTRAINT fk_item_brands_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT;
