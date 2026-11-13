-- Predefined units of measure (November 2026).
-- Fourteen standard units every company starts with: PCS, BOX, PACKET, CARTON, SET, ROLL, DOZEN, KG,
-- METER, LITER, BAG, BUNDLE, UNIT, PAIRS. is_system marks them: they cannot be deleted, renamed or
-- made inactive (src/uoms.php), but their description, decimals and conversion can still be edited.
-- A unit already saved under one of these names is kept and marked; the missing ones are added with
-- the next UOM-#### codes. Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE uoms
  ADD COLUMN is_system TINYINT(1) NOT NULL DEFAULT 0 AFTER status;

INSERT INTO uoms (uom_code, uom_name, decimal_allowed, conversion_factor, status, is_system)
SELECT CONCAT('UOM-', LPAD(base.last_no + ROW_NUMBER() OVER (ORDER BY p.sort_order), 4, '0')), p.unit_name, p.decimals, 1, 'active', 1
FROM (
  SELECT 1 AS sort_order, 'PCS' AS unit_name, 0 AS decimals
  UNION ALL SELECT 2, 'BOX', 0
  UNION ALL SELECT 3, 'PACKET', 0
  UNION ALL SELECT 4, 'CARTON', 0
  UNION ALL SELECT 5, 'SET', 0
  UNION ALL SELECT 6, 'ROLL', 0
  UNION ALL SELECT 7, 'DOZEN', 0
  UNION ALL SELECT 8, 'KG', 3
  UNION ALL SELECT 9, 'METER', 2
  UNION ALL SELECT 10, 'LITER', 3
  UNION ALL SELECT 11, 'BAG', 0
  UNION ALL SELECT 12, 'BUNDLE', 0
  UNION ALL SELECT 13, 'UNIT', 0
  UNION ALL SELECT 14, 'PAIRS', 0
) p
CROSS JOIN (
  SELECT COALESCE(MAX(CAST(SUBSTRING(uom_code, 5) AS UNSIGNED)), 0) AS last_no FROM uoms WHERE uom_code LIKE 'UOM-%'
) base
WHERE NOT EXISTS (SELECT 1 FROM uoms u WHERE u.uom_name = p.unit_name)
ORDER BY p.sort_order;

UPDATE uoms SET is_system = 1, status = 'active'
WHERE uom_name IN ('PCS', 'BOX', 'PACKET', 'CARTON', 'SET', 'ROLL', 'DOZEN', 'KG', 'METER', 'LITER', 'BAG', 'BUNDLE', 'UNIT', 'PAIRS');
