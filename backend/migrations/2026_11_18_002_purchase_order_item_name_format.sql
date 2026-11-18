-- Purchase Order lines: the item name's formatting (November 2026).
-- The Full Item Description popup's editing mode can make parts of a line's item name bold or red / blue / black.
-- item_name_html keeps that formatted name (only <b>, <strong> and <span style="color: #rrggbb">); the PDF prints
-- it. Its text is always the line's item name: when the item is renamed, the formatting no longer matches and the
-- plain name is used. NULL: no formatting.
-- It only adds a column. Applied by backend/bin/migrate.php (to every company). MySQL 8 / MariaDB 10.6+.

ALTER TABLE purchase_order_items
  ADD COLUMN item_name_html TEXT NULL AFTER item_name;
