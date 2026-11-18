-- Purchase Request types (November 2026): only Against Order and Against Stock.
-- Stock Replenishment becomes Against Stock; Direct Purchase and Urgent become Against Order.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

UPDATE purchase_requests SET purchase_type = 'Against Stock' WHERE purchase_type = 'Stock Replenishment';
UPDATE purchase_requests SET purchase_type = 'Against Order' WHERE purchase_type NOT IN ('Against Order', 'Against Stock');
