-- Master fixes (November 2026 test round).
--  * Stock points: warehouse_type becomes Office / Warehouse / Shop (the table keeps its name, warehouses).
--  * Record names are stored in capitals (items, customers, suppliers, units, brands, categories,
--    sub-categories, stock points), as the forms now save them.
--  * Party records keep what their form shows: contact designation and email, document type and
--    expiry, quotation lines and previous purchase / sales orders.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

-- Stock point type: every old type (Finished Goods, Spare Parts, ...) was a kind of warehouse.
UPDATE warehouses SET warehouse_type = 'Warehouse' WHERE warehouse_type NOT IN ('Office', 'Warehouse', 'Shop');
ALTER TABLE warehouses MODIFY warehouse_type VARCHAR(60) NOT NULL DEFAULT 'Warehouse';

-- Names in capitals. The text copies of category, sub-category and brand names on items follow.
-- The collation is case-insensitive, so the unique keys on names cannot clash.
UPDATE items          SET item_name = UPPER(item_name), category = UPPER(category), sub_category = UPPER(sub_category), brand_name = UPPER(brand_name);
UPDATE item_brands    SET brand_name = UPPER(brand_name);
UPDATE customers      SET customer_name = UPPER(customer_name);
UPDATE suppliers      SET supplier_name = UPPER(supplier_name);
UPDATE uoms           SET uom_name = UPPER(uom_name);
UPDATE brands         SET brand_name = UPPER(brand_name);
UPDATE categories     SET category_name = UPPER(category_name);
UPDATE sub_categories SET sub_category_name = UPPER(sub_category_name);
UPDATE warehouses     SET warehouse_name = UPPER(warehouse_name);

-- Contact rows: designation and email were shown on the form but not stored.
ALTER TABLE supplier_contacts
  ADD COLUMN designation VARCHAR(100) NOT NULL DEFAULT '' AFTER contact_name,
  ADD COLUMN email       VARCHAR(150) NOT NULL DEFAULT '' AFTER contact_number;
ALTER TABLE customer_contacts
  ADD COLUMN designation VARCHAR(100) NOT NULL DEFAULT '' AFTER contact_name,
  ADD COLUMN email       VARCHAR(150) NOT NULL DEFAULT '' AFTER contact_number;

-- Documents: type (Commercial Registration, VAT Certificate, ...) and expiry date.
ALTER TABLE supplier_documents
  ADD COLUMN doc_type    VARCHAR(60) NOT NULL DEFAULT '' AFTER original_name,
  ADD COLUMN expiry_date DATE        NULL AFTER doc_type;
ALTER TABLE customer_documents
  ADD COLUMN doc_type    VARCHAR(60) NOT NULL DEFAULT '' AFTER original_name,
  ADD COLUMN expiry_date DATE        NULL AFTER doc_type;

-- Quotation lines received from a supplier / sent to a customer (Party › Quotations tab).
CREATE TABLE supplier_quotation_items (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  supplier_id   INT UNSIGNED  NOT NULL,
  item_name     VARCHAR(200)  NOT NULL DEFAULT '',
  description   VARCHAR(255)  NOT NULL DEFAULT '',
  unit          VARCHAR(40)   NOT NULL DEFAULT '',
  rate          DECIMAL(15,3) NULL,
  delivery_time VARCHAR(60)   NOT NULL DEFAULT '',
  warranty      VARCHAR(60)   NOT NULL DEFAULT '',
  sort_order    INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_supplier_quotation_items_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_quotation_items (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  customer_id   INT UNSIGNED  NOT NULL,
  item_name     VARCHAR(200)  NOT NULL DEFAULT '',
  description   VARCHAR(255)  NOT NULL DEFAULT '',
  unit          VARCHAR(40)   NOT NULL DEFAULT '',
  rate          DECIMAL(15,3) NULL,
  delivery_time VARCHAR(60)   NOT NULL DEFAULT '',
  warranty      VARCHAR(60)   NOT NULL DEFAULT '',
  sort_order    INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_customer_quotation_items_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Previous purchase orders (suppliers) and sales orders (customers) entered on the party form.
CREATE TABLE supplier_orders (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  supplier_id  INT UNSIGNED  NOT NULL,
  order_number VARCHAR(40)   NOT NULL DEFAULT '',
  order_date   DATE          NULL,
  total_value  DECIMAL(15,3) NULL,
  total_items  INT UNSIGNED  NULL,
  status       VARCHAR(20)   NOT NULL DEFAULT 'Pending',
  sort_order   INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_supplier_orders_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_orders (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  customer_id  INT UNSIGNED  NOT NULL,
  order_number VARCHAR(40)   NOT NULL DEFAULT '',
  order_date   DATE          NULL,
  total_value  DECIMAL(15,3) NULL,
  total_items  INT UNSIGNED  NULL,
  status       VARCHAR(20)   NOT NULL DEFAULT 'Pending',
  sort_order   INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_customer_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
