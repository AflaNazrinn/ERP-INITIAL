-- Purchase Request, Quotation Request and GRN lines: the item name's formatting (November 2026).
-- As purchase_order_items (2026_11_18_002): the Full Item Description popup's editing mode can make parts of a
-- line's item name bold or red / blue / black, saved on the document's own line (never on the item).
-- item_name_html keeps that formatted name (only <b>, <strong> and <span style="color: #rrggbb">); the PDF prints
-- it. Its text is always the line's item name: when the item is renamed, the formatting no longer matches and the
-- plain name is used. NULL: no formatting.
-- It only adds columns. Applied by backend/bin/migrate.php (to every company). MySQL 8 / MariaDB 10.6+.

ALTER TABLE purchase_request_items
  ADD COLUMN item_name_html TEXT NULL AFTER item_name;

ALTER TABLE quotation_request_items
  ADD COLUMN item_name_html TEXT NULL AFTER item_name;

ALTER TABLE grn_items
  ADD COLUMN item_name_html TEXT NULL AFTER item_name;
