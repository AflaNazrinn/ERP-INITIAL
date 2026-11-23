-- Stock Ledger › Damaged Stock › Move to Stock: damaged goods (from a sales return, purchase return or a
-- replacement's returned goods) repaired / found fit for sale and put back into stock. Each row adds its quantity
-- to the stock on hand at the stock point (history type "Damage Restock") and takes it off the damaged line.
-- source_doc / source_id: the return or replacement the damaged line belongs to ('sr', 'prt', 'srp', 'prp').
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

CREATE TABLE damage_restocks (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  restock_date  DATE          NOT NULL,
  source_doc    VARCHAR(10)   NOT NULL,
  source_id     INT UNSIGNED  NOT NULL,
  source_ref    VARCHAR(30)   NOT NULL DEFAULT '',
  item_id       INT UNSIGNED  NOT NULL,
  warehouse_id  INT UNSIGNED  NULL,
  quantity      DECIMAL(14,3) NOT NULL,
  rate          DECIMAL(14,3) NOT NULL DEFAULT 0,
  description   VARCHAR(300)  NOT NULL DEFAULT '',
  created_by    VARCHAR(100)  NOT NULL DEFAULT '',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_damage_restocks_source (source_doc, source_id, item_id),
  CONSTRAINT fk_damage_restocks_item      FOREIGN KEY (item_id)      REFERENCES items (id)      ON DELETE RESTRICT,
  CONSTRAINT fk_damage_restocks_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
