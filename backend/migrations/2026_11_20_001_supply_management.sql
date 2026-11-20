-- Supply Management (November 2026): Stock Adjustment (ADJ000001), Stock Transfer (ST-0001) and Stock Reservation (SR000001).
-- Each document has a header and item lines like the Purchase Book documents (item, brand, unit, quantity), remarks,
-- signatory slots and the seal.
-- - Stock Adjustment: a stock point's counted (physical) quantities against the system quantities; an Approved
--   adjustment moves the stock by the difference.
-- - Stock Transfer: stock sent from one stock point to another, at a unit cost.
-- - Stock Reservation: stock held for a customer until the required date (it lowers the available quantity).
-- It only adds tables. Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

CREATE TABLE stock_adjustments (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  sa_code             VARCHAR(20)   NOT NULL,
  sa_date             DATE          NOT NULL,
  warehouse_id        INT UNSIGNED  NULL,
  adjustment_type     VARCHAR(20)   NOT NULL DEFAULT '',
  status              VARCHAR(20)   NOT NULL DEFAULT 'Draft',
  reason              VARCHAR(150)  NOT NULL DEFAULT '',
  requested_by        VARCHAR(120)  NOT NULL DEFAULT '',
  approved_by         VARCHAR(120)  NOT NULL DEFAULT '',
  net_quantity        DECIMAL(14,3) NOT NULL DEFAULT 0,
  total_value         DECIMAL(14,3) NOT NULL DEFAULT 0,
  remarks             TEXT          NULL,
  include_signatory   TINYINT(1)    NOT NULL DEFAULT 0,
  extra_signatories   TEXT          NULL,
  attach_seal         TINYINT(1)    NOT NULL DEFAULT 0,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_stock_adjustments_code (sa_code),
  CONSTRAINT fk_stock_adjustments_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_adjustment_items (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  stock_adjustment_id   INT UNSIGNED  NOT NULL,
  sort_order            INT           NOT NULL DEFAULT 0,
  item_id               INT UNSIGNED  NULL,
  item_code             VARCHAR(30)   NOT NULL DEFAULT '',
  item_name             VARCHAR(200)  NOT NULL,
  item_name_html        TEXT          NULL,
  brand_id              INT UNSIGNED  NULL,
  brand_name            VARCHAR(150)  NOT NULL DEFAULT '',
  uom_id                INT UNSIGNED  NULL,
  unit                  VARCHAR(80)   NOT NULL DEFAULT '',
  system_qty            DECIMAL(14,3) NOT NULL DEFAULT 0,
  quantity              DECIMAL(14,3) NOT NULL DEFAULT 0,
  unit_cost             DECIMAL(14,3) NOT NULL DEFAULT 0,
  line_reason           VARCHAR(200)  NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_stock_adjustment_items_doc (stock_adjustment_id),
  CONSTRAINT fk_stock_adjustment_items_doc   FOREIGN KEY (stock_adjustment_id) REFERENCES stock_adjustments (id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_adjustment_items_item  FOREIGN KEY (item_id)  REFERENCES items (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_stock_adjustment_items_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_adjustment_items_uom   FOREIGN KEY (uom_id)   REFERENCES uoms (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_transfers (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  st_code             VARCHAR(20)   NOT NULL,
  st_date             DATE          NOT NULL,
  expected_date       DATE          NULL,
  from_warehouse_id   INT UNSIGNED  NULL,
  to_warehouse_id     INT UNSIGNED  NULL,
  transfer_reason     VARCHAR(200)  NOT NULL DEFAULT '',
  grand_total         DECIMAL(14,3) NOT NULL DEFAULT 0,
  remarks             TEXT          NULL,
  include_signatory   TINYINT(1)    NOT NULL DEFAULT 0,
  extra_signatories   TEXT          NULL,
  attach_seal         TINYINT(1)    NOT NULL DEFAULT 0,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_stock_transfers_code (st_code),
  CONSTRAINT fk_stock_transfers_from FOREIGN KEY (from_warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_transfers_to   FOREIGN KEY (to_warehouse_id)   REFERENCES warehouses (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_transfer_items (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  stock_transfer_id   INT UNSIGNED  NOT NULL,
  sort_order          INT           NOT NULL DEFAULT 0,
  item_id             INT UNSIGNED  NULL,
  item_code           VARCHAR(30)   NOT NULL DEFAULT '',
  item_name           VARCHAR(200)  NOT NULL,
  item_name_html      TEXT          NULL,
  brand_id            INT UNSIGNED  NULL,
  brand_name          VARCHAR(150)  NOT NULL DEFAULT '',
  uom_id              INT UNSIGNED  NULL,
  unit                VARCHAR(80)   NOT NULL DEFAULT '',
  quantity            DECIMAL(14,3) NOT NULL DEFAULT 0,
  unit_cost           DECIMAL(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_stock_transfer_items_doc (stock_transfer_id),
  CONSTRAINT fk_stock_transfer_items_doc   FOREIGN KEY (stock_transfer_id) REFERENCES stock_transfers (id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_transfer_items_item  FOREIGN KEY (item_id)  REFERENCES items (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_stock_transfer_items_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_transfer_items_uom   FOREIGN KEY (uom_id)   REFERENCES uoms (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_reservations (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  sr_code             VARCHAR(20)   NOT NULL,
  sr_date             DATE          NOT NULL,
  reservation_type    VARCHAR(40)   NOT NULL DEFAULT 'Sales Order',
  reference_no        VARCHAR(60)   NOT NULL DEFAULT '',
  customer_id         INT UNSIGNED  NULL,
  warehouse_id        INT UNSIGNED  NULL,
  required_date       DATE          NOT NULL,
  priority            VARCHAR(20)   NOT NULL DEFAULT 'Normal',
  created_by          VARCHAR(120)  NOT NULL DEFAULT '',
  remarks             TEXT          NULL,
  include_signatory   TINYINT(1)    NOT NULL DEFAULT 0,
  extra_signatories   TEXT          NULL,
  attach_seal         TINYINT(1)    NOT NULL DEFAULT 0,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_stock_reservations_code (sr_code),
  CONSTRAINT fk_stock_reservations_customer  FOREIGN KEY (customer_id)  REFERENCES customers (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_stock_reservations_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_reservation_items (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  stock_reservation_id  INT UNSIGNED  NOT NULL,
  sort_order            INT           NOT NULL DEFAULT 0,
  item_id               INT UNSIGNED  NULL,
  item_code             VARCHAR(30)   NOT NULL DEFAULT '',
  item_name             VARCHAR(200)  NOT NULL,
  item_name_html        TEXT          NULL,
  brand_id              INT UNSIGNED  NULL,
  brand_name            VARCHAR(150)  NOT NULL DEFAULT '',
  uom_id                INT UNSIGNED  NULL,
  unit                  VARCHAR(80)   NOT NULL DEFAULT '',
  quantity              DECIMAL(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_stock_reservation_items_doc (stock_reservation_id),
  CONSTRAINT fk_stock_reservation_items_doc   FOREIGN KEY (stock_reservation_id) REFERENCES stock_reservations (id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_reservation_items_item  FOREIGN KEY (item_id)  REFERENCES items (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_stock_reservation_items_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_reservation_items_uom   FOREIGN KEY (uom_id)   REFERENCES uoms (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
