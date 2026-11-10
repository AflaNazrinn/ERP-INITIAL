-- Purchase Book: purchase requests, quotation requests (RFQ), purchase orders and goods receipt notes (GRN).
-- Each document has a header row and its item lines. Lines keep the item code, name, brand and unit as text
-- too, so a document still reads the same after the item master changes.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

CREATE TABLE purchase_requests (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  pr_code           VARCHAR(20)   NOT NULL,
  reference_no      VARCHAR(60)   NOT NULL DEFAULT '',
  purchase_type     VARCHAR(40)   NOT NULL DEFAULT 'Against Order',
  requested_date    DATE          NOT NULL,
  required_date     DATE          NULL,
  requested_by      VARCHAR(100)  NOT NULL DEFAULT '',
  delivery_location VARCHAR(200)  NOT NULL DEFAULT '',
  remarks           TEXT          NULL,
  include_signatory TINYINT(1)    NOT NULL DEFAULT 0,
  attach_seal       TINYINT(1)    NOT NULL DEFAULT 0,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_purchase_requests_code (pr_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE purchase_request_items (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  purchase_request_id INT UNSIGNED  NOT NULL,
  sort_order          INT           NOT NULL DEFAULT 0,
  item_id             INT UNSIGNED  NULL,
  item_code           VARCHAR(30)   NOT NULL DEFAULT '',
  item_name           VARCHAR(200)  NOT NULL,
  brand_id            INT UNSIGNED  NULL,
  brand_name          VARCHAR(150)  NOT NULL DEFAULT '',
  quantity            DECIMAL(14,3) NOT NULL,
  uom_id              INT UNSIGNED  NULL,
  unit                VARCHAR(80)   NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_purchase_request_items_doc (purchase_request_id),
  CONSTRAINT fk_purchase_request_items_doc   FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_request_items_item  FOREIGN KEY (item_id)  REFERENCES items (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_request_items_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_request_items_uom   FOREIGN KEY (uom_id)   REFERENCES uoms (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quotation_requests (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  rfq_code            VARCHAR(20)   NOT NULL,
  purchase_request_id INT UNSIGNED  NULL,
  request_date        DATE          NOT NULL,
  submission_deadline DATE          NULL,
  remarks             TEXT          NULL,
  include_signatory   TINYINT(1)    NOT NULL DEFAULT 0,
  attach_seal         TINYINT(1)    NOT NULL DEFAULT 0,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_quotation_requests_code (rfq_code),
  CONSTRAINT fk_quotation_requests_pr FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quotation_request_suppliers (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  quotation_request_id INT UNSIGNED NOT NULL,
  supplier_id          INT UNSIGNED NOT NULL,
  sort_order           INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_quotation_request_suppliers (quotation_request_id, supplier_id),
  CONSTRAINT fk_quotation_request_suppliers_doc      FOREIGN KEY (quotation_request_id) REFERENCES quotation_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_quotation_request_suppliers_supplier FOREIGN KEY (supplier_id)          REFERENCES suppliers (id)          ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quotation_request_items (
  id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  quotation_request_id INT UNSIGNED  NOT NULL,
  sort_order           INT           NOT NULL DEFAULT 0,
  item_id              INT UNSIGNED  NULL,
  item_code            VARCHAR(30)   NOT NULL DEFAULT '',
  item_name            VARCHAR(200)  NOT NULL,
  brand_id             INT UNSIGNED  NULL,
  brand_name           VARCHAR(150)  NOT NULL DEFAULT '',
  quantity             DECIMAL(14,3) NOT NULL,
  uom_id               INT UNSIGNED  NULL,
  unit                 VARCHAR(80)   NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_quotation_request_items_doc (quotation_request_id),
  CONSTRAINT fk_quotation_request_items_doc   FOREIGN KEY (quotation_request_id) REFERENCES quotation_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_quotation_request_items_item  FOREIGN KEY (item_id)  REFERENCES items (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_quotation_request_items_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE RESTRICT,
  CONSTRAINT fk_quotation_request_items_uom   FOREIGN KEY (uom_id)   REFERENCES uoms (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- vat_mode: 'include' when the prices already contain VAT, 'exclude' when VAT is added on top.
CREATE TABLE purchase_orders (
  id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  po_code              VARCHAR(20)   NOT NULL,
  po_date              DATE          NOT NULL,
  purchase_request_id  INT UNSIGNED  NULL,
  quotation_request_id INT UNSIGNED  NULL,
  quotation_number     VARCHAR(60)   NOT NULL DEFAULT '',
  status               VARCHAR(20)   NOT NULL DEFAULT 'Draft',
  delivery_date        DATE          NULL,
  delivery_location    VARCHAR(200)  NOT NULL DEFAULT '',
  delivery_terms       VARCHAR(200)  NOT NULL DEFAULT '',
  payment_mode         VARCHAR(40)   NOT NULL DEFAULT '',
  supplier_id          INT UNSIGNED  NULL,
  contact_name         VARCHAR(100)  NOT NULL DEFAULT '',
  email                VARCHAR(150)  NOT NULL DEFAULT '',
  currency             VARCHAR(10)   NOT NULL DEFAULT 'OMR',
  vat_mode             VARCHAR(10)   NOT NULL DEFAULT 'include',
  subtotal             DECIMAL(14,3) NOT NULL DEFAULT 0,
  vat_amount           DECIMAL(14,3) NOT NULL DEFAULT 0,
  discount_amount      DECIMAL(14,3) NOT NULL DEFAULT 0,
  shipping             DECIMAL(14,3) NOT NULL DEFAULT 0,
  grand_total          DECIMAL(14,3) NOT NULL DEFAULT 0,
  remarks              TEXT          NULL,
  include_signatory    TINYINT(1)    NOT NULL DEFAULT 0,
  attach_seal          TINYINT(1)    NOT NULL DEFAULT 0,
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_purchase_orders_code (po_code),
  CONSTRAINT fk_purchase_orders_pr       FOREIGN KEY (purchase_request_id)  REFERENCES purchase_requests (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_orders_rfq      FOREIGN KEY (quotation_request_id) REFERENCES quotation_requests (id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_orders_supplier FOREIGN KEY (supplier_id)          REFERENCES suppliers (id)          ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE purchase_order_items (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  purchase_order_id INT UNSIGNED  NOT NULL,
  sort_order        INT           NOT NULL DEFAULT 0,
  item_id           INT UNSIGNED  NULL,
  item_code         VARCHAR(30)   NOT NULL DEFAULT '',
  item_name         VARCHAR(200)  NOT NULL,
  brand_id          INT UNSIGNED  NULL,
  brand_name        VARCHAR(150)  NOT NULL DEFAULT '',
  quantity          DECIMAL(14,3) NOT NULL,
  uom_id            INT UNSIGNED  NULL,
  unit              VARCHAR(80)   NOT NULL DEFAULT '',
  price             DECIMAL(14,3) NOT NULL DEFAULT 0,
  vat_rate          DECIMAL(5,2)  NOT NULL DEFAULT 5,
  discount_pct      DECIMAL(5,2)  NOT NULL DEFAULT 0,
  discount_amount   DECIMAL(14,3) NOT NULL DEFAULT 0,
  foc               TINYINT(1)    NOT NULL DEFAULT 0,
  line_total        DECIMAL(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_purchase_order_items_doc (purchase_order_id),
  CONSTRAINT fk_purchase_order_items_doc   FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_order_items_item  FOREIGN KEY (item_id)  REFERENCES items (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_order_items_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_order_items_uom   FOREIGN KEY (uom_id)   REFERENCES uoms (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE grns (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  grn_code          VARCHAR(20)   NOT NULL,
  grn_date          DATE          NOT NULL,
  supplier_id       INT UNSIGNED  NULL,
  warehouse_id      INT UNSIGNED  NULL,
  purchase_order_id INT UNSIGNED  NULL,
  po_number         VARCHAR(60)   NOT NULL DEFAULT '',
  vat_mode          VARCHAR(10)   NOT NULL DEFAULT 'include',
  subtotal          DECIMAL(14,3) NOT NULL DEFAULT 0,
  vat_amount        DECIMAL(14,3) NOT NULL DEFAULT 0,
  discount_amount   DECIMAL(14,3) NOT NULL DEFAULT 0,
  shipping          DECIMAL(14,3) NOT NULL DEFAULT 0,
  grand_total       DECIMAL(14,3) NOT NULL DEFAULT 0,
  remarks           TEXT          NULL,
  include_signatory TINYINT(1)    NOT NULL DEFAULT 0,
  attach_seal       TINYINT(1)    NOT NULL DEFAULT 0,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_grns_code (grn_code),
  CONSTRAINT fk_grns_supplier  FOREIGN KEY (supplier_id)       REFERENCES suppliers (id)       ON DELETE RESTRICT,
  CONSTRAINT fk_grns_warehouse FOREIGN KEY (warehouse_id)      REFERENCES warehouses (id)      ON DELETE RESTRICT,
  CONSTRAINT fk_grns_po        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE grn_items (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  grn_id        INT UNSIGNED  NOT NULL,
  sort_order    INT           NOT NULL DEFAULT 0,
  item_id       INT UNSIGNED  NULL,
  item_code     VARCHAR(30)   NOT NULL DEFAULT '',
  item_name     VARCHAR(200)  NOT NULL,
  brand_id      INT UNSIGNED  NULL,
  brand_name    VARCHAR(150)  NOT NULL DEFAULT '',
  received_qty  DECIMAL(14,3) NOT NULL DEFAULT 0,
  accepted_qty  DECIMAL(14,3) NOT NULL DEFAULT 0,
  rejected_qty  DECIMAL(14,3) NOT NULL DEFAULT 0,
  uom_id        INT UNSIGNED  NULL,
  unit          VARCHAR(80)   NOT NULL DEFAULT '',
  expiry_date   DATE          NULL,
  rack_id       INT UNSIGNED  NULL,
  unit_cost     DECIMAL(14,3) NOT NULL DEFAULT 0,
  vat_rate      DECIMAL(5,2)  NOT NULL DEFAULT 5,
  discount_pct  DECIMAL(5,2)  NOT NULL DEFAULT 0,
  line_total    DECIMAL(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_grn_items_doc (grn_id),
  CONSTRAINT fk_grn_items_doc   FOREIGN KEY (grn_id)   REFERENCES grns (id)      ON DELETE CASCADE,
  CONSTRAINT fk_grn_items_item  FOREIGN KEY (item_id)  REFERENCES items (id)     ON DELETE RESTRICT,
  CONSTRAINT fk_grn_items_brand FOREIGN KEY (brand_id) REFERENCES brands (id)    ON DELETE RESTRICT,
  CONSTRAINT fk_grn_items_uom   FOREIGN KEY (uom_id)   REFERENCES uoms (id)      ON DELETE RESTRICT,
  CONSTRAINT fk_grn_items_rack  FOREIGN KEY (rack_id)  REFERENCES rack_bins (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
