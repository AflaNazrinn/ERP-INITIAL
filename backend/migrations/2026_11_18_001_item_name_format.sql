-- The item name's formatting (November 2026): bold and colour set in the Full Item Description popup.
-- item_name stays the plain name (lists, searches, documents); item_name_html is the same text with
-- <b> and <span style="color: …"> around parts of it, or NULL when the name has no formatting.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE items ADD COLUMN item_name_html TEXT NULL AFTER item_name;
