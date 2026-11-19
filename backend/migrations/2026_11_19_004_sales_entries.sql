-- Transaction Entry › Sales Entry: customer sales recorded in the books (SAL-0001).
-- The Purchase Entry's twin for a customer: the customer and their PO / reference number, the tax invoice and / or
-- delivery note it is for, the currency, priced item lines (quantity × rate; no VAT or line discount on this screen),
-- a discount on the total, remarks, signatory slots and the seal.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

CREATE TABLE sales_entries (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  se_code             VARCHAR(20)   NOT NULL,
  se_date             DATE          NOT NULL,
  customer_id         INT UNSIGNED  NULL,
  customer_ref_no     VARCHAR(60)   NOT NULL DEFAULT '',
  tax_invoice_id      INT UNSIGNED  NULL,
  delivery_note_id    INT UNSIGNED  NULL,
  currency            VARCHAR(10)   NOT NULL DEFAULT 'OMR',
  vat_mode            VARCHAR(10)   NOT NULL DEFAULT 'exclude',
  subtotal            DECIMAL(14,3) NOT NULL DEFAULT 0,
  vat_amount          DECIMAL(14,3) NOT NULL DEFAULT 0,
  discount_amount     DECIMAL(14,3) NOT NULL DEFAULT 0,
  shipping            DECIMAL(14,3) NOT NULL DEFAULT 0,
  grand_total         DECIMAL(14,3) NOT NULL DEFAULT 0,
  remarks             TEXT          NULL,
  include_signatory   TINYINT(1)    NOT NULL DEFAULT 0,
  extra_signatories   TEXT          NULL,
  attach_seal         TINYINT(1)    NOT NULL DEFAULT 0,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sales_entries_code (se_code),
  CONSTRAINT fk_sales_entries_customer FOREIGN KEY (customer_id)      REFERENCES customers (id)      ON DELETE RESTRICT,
  CONSTRAINT fk_sales_entries_invoice  FOREIGN KEY (tax_invoice_id)   REFERENCES tax_invoices (id)   ON DELETE RESTRICT,
  CONSTRAINT fk_sales_entries_dn       FOREIGN KEY (delivery_note_id) REFERENCES delivery_notes (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sales_entry_items (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  sales_entry_id    INT UNSIGNED  NOT NULL,
  sort_order        INT           NOT NULL DEFAULT 0,
  item_id           INT UNSIGNED  NULL,
  item_code         VARCHAR(30)   NOT NULL DEFAULT '',
  item_name         VARCHAR(200)  NOT NULL,
  item_name_html    TEXT          NULL,
  brand_id          INT UNSIGNED  NULL,
  brand_name        VARCHAR(150)  NOT NULL DEFAULT '',
  quantity          DECIMAL(14,3) NOT NULL,
  uom_id            INT UNSIGNED  NULL,
  unit              VARCHAR(80)   NOT NULL DEFAULT '',
  price             DECIMAL(14,3) NOT NULL DEFAULT 0,
  vat_rate          DECIMAL(5,2)  NOT NULL DEFAULT 0,
  discount_pct      DECIMAL(5,2)  NOT NULL DEFAULT 0,
  discount_amount   DECIMAL(14,3) NOT NULL DEFAULT 0,
  foc               TINYINT(1)    NOT NULL DEFAULT 0,
  line_total        DECIMAL(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_sales_entry_items_doc (sales_entry_id),
  CONSTRAINT fk_sales_entry_items_doc   FOREIGN KEY (sales_entry_id) REFERENCES sales_entries (id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_entry_items_item  FOREIGN KEY (item_id)  REFERENCES items (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_sales_entry_items_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_entry_items_uom   FOREIGN KEY (uom_id)   REFERENCES uoms (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
