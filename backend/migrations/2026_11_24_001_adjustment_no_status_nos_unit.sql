-- Stock Adjustment without a status; NOS as a predefined unit (November 2026).
-- - Stock adjustments no longer carry a status: every saved adjustment moves the stock by its counted difference
--   (src/stock_report.php). The status column is dropped.
-- - NOS (numbers) joins the predefined units: it cannot be deleted, renamed or made inactive (src/uoms.php).
--   A unit already saved as NOS is kept and marked; otherwise it is added with the next UOM-#### code.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE stock_adjustments DROP COLUMN status;

INSERT INTO uoms (uom_code, uom_name, decimal_allowed, conversion_factor, status, is_system)
SELECT CONCAT('UOM-', LPAD(COALESCE(MAX(CAST(SUBSTRING(uom_code, 5) AS UNSIGNED)), 0) + 1, 4, '0')), 'NOS', 0, 1, 'active', 1
FROM uoms
WHERE uom_code LIKE 'UOM-%'
HAVING NOT EXISTS (SELECT 1 FROM uoms u WHERE u.uom_name = 'NOS');

UPDATE uoms SET is_system = 1, status = 'active' WHERE uom_name = 'NOS';
