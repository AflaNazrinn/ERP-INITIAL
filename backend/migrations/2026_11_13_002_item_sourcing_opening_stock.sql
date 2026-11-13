-- Opening stock per item sourcing line (November 2026).
-- Each line of the Item page's sourcing table (one stock point each) keeps its own opening stock,
-- so 22 at one stock point and 22 at another reopen as 22 and 22. items.available_stock stays the
-- total of the lines (44), shown in the Item list. Older lines have NULL here: the page then shows
-- the item's total on the first line, as before.
-- It only adds a column. Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE item_brands
  ADD COLUMN opening_stock DECIMAL(12,3) NULL AFTER price_per_unit;
