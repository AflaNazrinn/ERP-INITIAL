-- Return & Replacement › Sales Return: goods a customer sends back (SR-0001).
-- The delivery note the goods went out on (Ref ID) and / or the sales entry they were sold on, the buyer,
-- their PO number and contact, the currency, the return reason, the stock point the goods go back to, the refund
-- mode; priced lines with the quantity sold and returned and the condition the goods came back in; a discount and a
-- restocking fee taken off the refund; remarks, signatory slots and the seal.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

CREATE TABLE sales_returns (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  sr_code             VARCHAR(20)   NOT NULL,
  sr_date             DATE          NOT NULL,
  delivery_note_id    INT UNSIGNED  NULL,
  sales_entry_id      INT UNSIGNED  NULL,
  customer_id         INT UNSIGNED  NULL,
  customer_po         VARCHAR(60)   NOT NULL DEFAULT '',
  currency            VARCHAR(10)   NOT NULL DEFAULT 'OMR',
  return_reason       VARCHAR(60)   NOT NULL DEFAULT '',
  warehouse_id        INT UNSIGNED  NULL,
  refund_mode         VARCHAR(40)   NOT NULL DEFAULT 'Credit Note',
  contact_name        VARCHAR(100)  NOT NULL DEFAULT '',
  contact_number      VARCHAR(40)   NOT NULL DEFAULT '',
  vat_mode            VARCHAR(10)   NOT NULL DEFAULT 'include',
  subtotal            DECIMAL(14,3) NOT NULL DEFAULT 0,
  vat_amount          DECIMAL(14,3) NOT NULL DEFAULT 0,
  discount_amount     DECIMAL(14,3) NOT NULL DEFAULT 0,
  restocking_fee      DECIMAL(14,3) NOT NULL DEFAULT 0,
  grand_total         DECIMAL(14,3) NOT NULL DEFAULT 0,
  remarks             TEXT          NULL,
  include_signatory   TINYINT(1)    NOT NULL DEFAULT 0,
  extra_signatories   TEXT          NULL,
  attach_seal         TINYINT(1)    NOT NULL DEFAULT 0,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sales_returns_code (sr_code),
  CONSTRAINT fk_sales_returns_customer  FOREIGN KEY (customer_id)    REFERENCES customers (id)    ON DELETE RESTRICT,
  CONSTRAINT fk_sales_returns_dn        FOREIGN KEY (delivery_note_id) REFERENCES delivery_notes (id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_returns_se        FOREIGN KEY (sales_entry_id)   REFERENCES sales_entries (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_sales_returns_warehouse FOREIGN KEY (warehouse_id)   REFERENCES warehouses (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sales_return_items (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  sales_return_id   INT UNSIGNED  NOT NULL,
  sort_order        INT           NOT NULL DEFAULT 0,
  item_id           INT UNSIGNED  NULL,
  item_code         VARCHAR(30)   NOT NULL DEFAULT '',
  item_name         VARCHAR(200)  NOT NULL,
  item_name_html    TEXT          NULL,
  brand_id          INT UNSIGNED  NULL,
  brand_name        VARCHAR(150)  NOT NULL DEFAULT '',
  sold_qty          DECIMAL(14,3) NOT NULL DEFAULT 0,
  quantity          DECIMAL(14,3) NOT NULL,
  uom_id            INT UNSIGNED  NULL,
  unit              VARCHAR(80)   NOT NULL DEFAULT '',
  item_condition    VARCHAR(40)   NOT NULL DEFAULT 'Good – Restock',
  price             DECIMAL(14,3) NOT NULL DEFAULT 0,
  vat_rate          DECIMAL(5,2)  NOT NULL DEFAULT 0,
  discount_pct      DECIMAL(5,2)  NOT NULL DEFAULT 0,
  discount_amount   DECIMAL(14,3) NOT NULL DEFAULT 0,
  foc               TINYINT(1)    NOT NULL DEFAULT 0,
  line_total        DECIMAL(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_sales_return_items_doc (sales_return_id),
  CONSTRAINT fk_sales_return_items_doc   FOREIGN KEY (sales_return_id) REFERENCES sales_returns (id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_return_items_item  FOREIGN KEY (item_id)  REFERENCES items (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_sales_return_items_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_return_items_uom   FOREIGN KEY (uom_id)   REFERENCES uoms (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
