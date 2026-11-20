-- Return & Replacement › Purchase Return: goods sent back to a supplier (PRT-0001).
-- The purchase order or GRN the goods came in on (Ref ID), who made the return and their contact, the supplier's
-- invoice number, the return reason, the stock point the goods leave from, the settlement mode; the supplier, its
-- contact and the currency; priced lines with the quantity received and returned and the condition of the goods;
-- a discount and a supplier deduction taken off the return amount; remarks, signatory slots and the seal.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

CREATE TABLE purchase_returns (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  prt_code            VARCHAR(20)   NOT NULL,
  prt_date            DATE          NOT NULL,
  purchase_order_id   INT UNSIGNED  NULL,
  grn_id              INT UNSIGNED  NULL,
  created_by          VARCHAR(100)  NOT NULL DEFAULT '',
  created_by_contact  VARCHAR(40)   NOT NULL DEFAULT '',
  supplier_invoice_no VARCHAR(60)   NOT NULL DEFAULT '',
  return_reason       VARCHAR(60)   NOT NULL DEFAULT '',
  warehouse_id        INT UNSIGNED  NULL,
  settlement_mode     VARCHAR(40)   NOT NULL DEFAULT 'Debit Note',
  supplier_id         INT UNSIGNED  NULL,
  contact_name        VARCHAR(100)  NOT NULL DEFAULT '',
  contact_number      VARCHAR(40)   NOT NULL DEFAULT '',
  currency            VARCHAR(10)   NOT NULL DEFAULT 'OMR',
  vat_mode            VARCHAR(10)   NOT NULL DEFAULT 'include',
  subtotal            DECIMAL(14,3) NOT NULL DEFAULT 0,
  vat_amount          DECIMAL(14,3) NOT NULL DEFAULT 0,
  discount_amount     DECIMAL(14,3) NOT NULL DEFAULT 0,
  supplier_deduction  DECIMAL(14,3) NOT NULL DEFAULT 0,
  grand_total         DECIMAL(14,3) NOT NULL DEFAULT 0,
  remarks             TEXT          NULL,
  include_signatory   TINYINT(1)    NOT NULL DEFAULT 0,
  extra_signatories   TEXT          NULL,
  attach_seal         TINYINT(1)    NOT NULL DEFAULT 0,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_purchase_returns_code (prt_code),
  CONSTRAINT fk_purchase_returns_supplier  FOREIGN KEY (supplier_id)       REFERENCES suppliers (id)       ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_returns_po        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_returns_grn       FOREIGN KEY (grn_id)            REFERENCES grns (id)            ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_returns_warehouse FOREIGN KEY (warehouse_id)      REFERENCES warehouses (id)      ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE purchase_return_items (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  purchase_return_id  INT UNSIGNED  NOT NULL,
  sort_order          INT           NOT NULL DEFAULT 0,
  item_id             INT UNSIGNED  NULL,
  item_code           VARCHAR(30)   NOT NULL DEFAULT '',
  item_name           VARCHAR(200)  NOT NULL,
  item_name_html      TEXT          NULL,
  brand_id            INT UNSIGNED  NULL,
  brand_name          VARCHAR(150)  NOT NULL DEFAULT '',
  received_qty        DECIMAL(14,3) NOT NULL DEFAULT 0,
  quantity            DECIMAL(14,3) NOT NULL,
  uom_id              INT UNSIGNED  NULL,
  unit                VARCHAR(80)   NOT NULL DEFAULT '',
  item_condition      VARCHAR(40)   NOT NULL DEFAULT 'Damaged',
  price               DECIMAL(14,3) NOT NULL DEFAULT 0,
  vat_rate            DECIMAL(5,2)  NOT NULL DEFAULT 0,
  discount_pct        DECIMAL(5,2)  NOT NULL DEFAULT 0,
  discount_amount     DECIMAL(14,3) NOT NULL DEFAULT 0,
  foc                 TINYINT(1)    NOT NULL DEFAULT 0,
  line_total          DECIMAL(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_purchase_return_items_doc (purchase_return_id),
  CONSTRAINT fk_purchase_return_items_doc   FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns (id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_return_items_item  FOREIGN KEY (item_id)  REFERENCES items (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_return_items_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_return_items_uom   FOREIGN KEY (uom_id)   REFERENCES uoms (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
