-- Party › Debtors › Purchase Orders: the customer's purchase order (its number, dates and item lines),
-- read from the customer's PO file or typed in.
ALTER TABLE customers
  ADD COLUMN po_number        VARCHAR(60) NOT NULL DEFAULT '' AFTER comments,
  ADD COLUMN po_date          DATE        NULL AFTER po_number,
  ADD COLUMN po_delivery_date DATE        NULL AFTER po_date;

CREATE TABLE customer_po_items (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED  NOT NULL,
  item_name   VARCHAR(200)  NOT NULL DEFAULT '',
  description VARCHAR(255)  NOT NULL DEFAULT '',
  unit        VARCHAR(40)   NOT NULL DEFAULT '',
  qty         DECIMAL(15,3) NULL,
  rate        DECIMAL(15,3) NULL,
  sort_order  INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_customer_po_items_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
