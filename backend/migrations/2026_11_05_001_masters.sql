-- Masters: items, categories, brands, units, warehouses, suppliers, customers.
-- Follows database model/Growth-Engine-Masters-HD (1).png (19 tables, 23 foreign keys).
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+, InnoDB, utf8mb4.

CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL,
  full_name     VARCHAR(100) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_code VARCHAR(20)  NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  status        ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_categories_code (category_code),
  UNIQUE KEY uk_categories_name (category_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sub-category names are unique within their category.
CREATE TABLE sub_categories (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id       INT UNSIGNED NOT NULL,
  sub_category_name VARCHAR(100) NOT NULL,
  sort_order        INT          NOT NULL DEFAULT 0,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sub_categories_name (category_id, sub_category_name),
  CONSTRAINT fk_sub_categories_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE brands (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  brand_code VARCHAR(20)  NOT NULL,
  brand_name VARCHAR(150) NOT NULL,
  status     VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_brands_code (brand_code),
  UNIQUE KEY uk_brands_name (brand_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- conversion_base_id: the unit this one converts to; NULL for a base unit.
CREATE TABLE uoms (
  id                 INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  uom_code           VARCHAR(20)   NOT NULL,
  uom_name           VARCHAR(80)   NOT NULL,
  description        VARCHAR(255)  NOT NULL DEFAULT '',
  decimal_allowed    TINYINT(1)    NOT NULL DEFAULT 0,
  conversion_base_id INT UNSIGNED  NULL,
  conversion_factor  DECIMAL(14,4) NOT NULL DEFAULT 1.0000,
  status             ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_uoms_code (uom_code),
  CONSTRAINT fk_uoms_conversion_base FOREIGN KEY (conversion_base_id) REFERENCES uoms (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE warehouses (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  warehouse_code VARCHAR(20)  NOT NULL,
  warehouse_name VARCHAR(150) NOT NULL,
  warehouse_type VARCHAR(60)  NOT NULL DEFAULT '',
  address        VARCHAR(255) NOT NULL DEFAULT '',
  country        VARCHAR(80)  NOT NULL DEFAULT '',
  city           VARCHAR(80)  NOT NULL DEFAULT '',
  contact_person VARCHAR(120) NOT NULL DEFAULT '',
  phone          VARCHAR(40)  NOT NULL DEFAULT '',
  email          VARCHAR(150) NOT NULL DEFAULT '',
  manager        VARCHAR(120) NOT NULL DEFAULT '',
  capacity       INT UNSIGNED NULL,
  status         ENUM('active','inactive') NOT NULL DEFAULT 'active',
  remarks        TEXT         NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_warehouses_code (warehouse_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rack_bins (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  location_code VARCHAR(30)  NOT NULL,
  warehouse_id  INT UNSIGNED NOT NULL,
  rack          VARCHAR(40)  NOT NULL DEFAULT '',
  shelf         VARCHAR(40)  NOT NULL DEFAULT '',
  location_name VARCHAR(150) NOT NULL DEFAULT '',
  capacity      INT UNSIGNED NULL,
  status        ENUM('active','inactive') NOT NULL DEFAULT 'active',
  remarks       TEXT         NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_rack_bins_code (location_code),
  CONSTRAINT fk_rack_bins_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE suppliers (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  supplier_code     VARCHAR(20)   NOT NULL,
  supplier_name     VARCHAR(150)  NOT NULL,
  organization_name VARCHAR(150)  NOT NULL DEFAULT '',
  owner_details     VARCHAR(150)  NOT NULL DEFAULT '',
  currency          VARCHAR(10)   NOT NULL DEFAULT 'OMR',
  tax_reg_no        VARCHAR(50)   NOT NULL DEFAULT '',
  contact_person    VARCHAR(120)  NOT NULL DEFAULT '',
  contact_person2   VARCHAR(100)  NOT NULL DEFAULT '',
  contact_person3   VARCHAR(100)  NOT NULL DEFAULT '',
  location          VARCHAR(150)  NOT NULL DEFAULT '',
  address           VARCHAR(255)  NOT NULL DEFAULT '',
  city              VARCHAR(100)  NOT NULL DEFAULT '',
  zip_code          VARCHAR(20)   NOT NULL DEFAULT '',
  phone             VARCHAR(40)   NOT NULL DEFAULT '',
  telephone         VARCHAR(40)   NOT NULL DEFAULT '',
  email             VARCHAR(150)  NOT NULL DEFAULT '',
  payment_terms     VARCHAR(60)   NOT NULL DEFAULT '',
  lead_time_days    INT UNSIGNED  NULL,
  opening_balance   DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  debit_limit       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  debit_days        INT UNSIGNED  NULL,
  discount_percent  DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  account_details   TEXT          NULL,
  country           VARCHAR(80)   NOT NULL DEFAULT '',
  status            VARCHAR(20)   NOT NULL DEFAULT 'active',
  remarks           TEXT          NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_suppliers_code (supplier_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  customer_code         VARCHAR(20)   NOT NULL,
  customer_name         VARCHAR(150)  NOT NULL,
  organization_name     VARCHAR(150)  NOT NULL DEFAULT '',
  owner_details         VARCHAR(150)  NOT NULL DEFAULT '',
  tax_reg_no            VARCHAR(50)   NOT NULL DEFAULT '',
  email                 VARCHAR(150)  NOT NULL DEFAULT '',
  country               VARCHAR(80)   NOT NULL DEFAULT '',
  phone                 VARCHAR(40)   NOT NULL DEFAULT '',
  telephone             VARCHAR(40)   NOT NULL DEFAULT '',
  city                  VARCHAR(100)  NOT NULL DEFAULT '',
  zip_code              VARCHAR(20)   NOT NULL DEFAULT '',
  address               VARCHAR(255)  NOT NULL DEFAULT '',
  salesman              VARCHAR(100)  NOT NULL DEFAULT '',
  currency              VARCHAR(10)   NOT NULL DEFAULT 'OMR',
  opening_balance       DECIMAL(15,3) NOT NULL DEFAULT 0.000,
  credit_limit          DECIMAL(15,3) NOT NULL DEFAULT 0.000,
  approved_credit_limit DECIMAL(15,3) NOT NULL DEFAULT 0.000,
  credit_days           INT UNSIGNED  NULL,
  discount_percent      DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  account_details       TEXT          NULL,
  comments              TEXT          NULL,
  status                ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_customers_code (customer_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- category / sub_category / brand_name keep the names as text next to the new *_id keys (as in the model).
CREATE TABLE items (
  id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  item_code            VARCHAR(30)   NOT NULL,
  item_name            VARCHAR(200)  NOT NULL,
  uom_id               INT UNSIGNED  NULL,
  print_name           VARCHAR(150)  NOT NULL DEFAULT '',
  part_no              VARCHAR(50)   NOT NULL DEFAULT '',
  category             VARCHAR(100)  NOT NULL DEFAULT '',
  category_id          INT UNSIGNED  NULL,
  sub_category         VARCHAR(100)  NOT NULL DEFAULT '',
  sub_category_id      INT UNSIGNED  NULL,
  manufacturer_barcode VARCHAR(50)   NOT NULL DEFAULT '',
  other_code           VARCHAR(50)   NOT NULL DEFAULT '',
  origin               VARCHAR(100)  NOT NULL DEFAULT '',
  available_stock      VARCHAR(100)  NOT NULL DEFAULT '',
  brand_name           VARCHAR(150)  NOT NULL DEFAULT '',
  brand_id             INT UNSIGNED  NULL,
  buying_rate          DECIMAL(12,2) NULL,
  vat_percent          DECIMAL(5,2)  NULL,
  selling_price        DECIMAL(12,2) NULL,
  margin_percent       DECIMAL(5,2)  NULL,
  mrp                  DECIMAL(12,2) NULL,
  grouping_code        VARCHAR(50)   NOT NULL DEFAULT '',
  warehouse_id         INT UNSIGNED  NULL,
  rack_id              INT UNSIGNED  NULL,
  min_stock_level      INT           NULL,
  max_stock_level      INT           NULL,
  description          TEXT          NULL,
  web_link             VARCHAR(255)  NOT NULL DEFAULT '',
  status               VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE / RELEASED',
  system_barcode       VARCHAR(50)   NULL,
  image_path           VARCHAR(255)  NOT NULL DEFAULT '',
  warranty_period      VARCHAR(50)   NOT NULL DEFAULT '',
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_items_code (item_code),
  UNIQUE KEY uk_items_system_barcode (system_barcode),
  CONSTRAINT fk_items_uom          FOREIGN KEY (uom_id)          REFERENCES uoms (id)           ON DELETE RESTRICT,
  CONSTRAINT fk_items_category     FOREIGN KEY (category_id)     REFERENCES categories (id)     ON DELETE RESTRICT,
  CONSTRAINT fk_items_sub_category FOREIGN KEY (sub_category_id) REFERENCES sub_categories (id) ON DELETE RESTRICT,
  CONSTRAINT fk_items_brand        FOREIGN KEY (brand_id)        REFERENCES brands (id)         ON DELETE RESTRICT,
  CONSTRAINT fk_items_warehouse    FOREIGN KEY (warehouse_id)    REFERENCES warehouses (id)     ON DELETE RESTRICT,
  CONSTRAINT fk_items_rack         FOREIGN KEY (rack_id)         REFERENCES rack_bins (id)      ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per brand an item is sold under (item form sourcing rows, brand form items list).
CREATE TABLE item_brands (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  item_id        INT UNSIGNED  NOT NULL,
  brand_id       INT UNSIGNED  NULL,
  brand_name     VARCHAR(150)  NOT NULL DEFAULT '',
  supplier_id    INT UNSIGNED  NULL,
  price_per_unit DECIMAL(14,4) NULL,
  sort_order     INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_item_brands_item (item_id),
  CONSTRAINT fk_item_brands_item     FOREIGN KEY (item_id)     REFERENCES items (id)     ON DELETE CASCADE,
  CONSTRAINT fk_item_brands_brand    FOREIGN KEY (brand_id)    REFERENCES brands (id)    ON DELETE RESTRICT,
  CONSTRAINT fk_item_brands_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE item_brand_suppliers (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_brand_id INT UNSIGNED NOT NULL,
  supplier_id   INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_item_brand_suppliers (item_brand_id, supplier_id),
  CONSTRAINT fk_item_brand_suppliers_item_brand FOREIGN KEY (item_brand_id) REFERENCES item_brands (id) ON DELETE CASCADE,
  CONSTRAINT fk_item_brand_suppliers_supplier   FOREIGN KEY (supplier_id)   REFERENCES suppliers (id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE item_suppliers (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  item_id     INT UNSIGNED  NOT NULL,
  supplier_id INT UNSIGNED  NOT NULL,
  price       DECIMAL(12,2) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_item_suppliers (item_id, supplier_id),
  CONSTRAINT fk_item_suppliers_item     FOREIGN KEY (item_id)     REFERENCES items (id)     ON DELETE CASCADE,
  CONSTRAINT fk_item_suppliers_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE item_documents (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id       INT UNSIGNED NOT NULL,
  file_path     VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  uploaded_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_item_documents_item FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE supplier_brands (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_id INT UNSIGNED NOT NULL,
  brand_id    INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_supplier_brands (supplier_id, brand_id),
  CONSTRAINT fk_supplier_brands_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE,
  CONSTRAINT fk_supplier_brands_brand    FOREIGN KEY (brand_id)    REFERENCES brands (id)    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE supplier_contacts (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_id    INT UNSIGNED NOT NULL,
  contact_name   VARCHAR(100) NOT NULL DEFAULT '',
  contact_number VARCHAR(40)  NOT NULL DEFAULT '',
  sort_order     INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_supplier_contacts_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE supplier_documents (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_id   INT UNSIGNED NOT NULL,
  file_path     VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  uploaded_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_supplier_documents_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_contacts (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id    INT UNSIGNED NOT NULL,
  contact_name   VARCHAR(100) NOT NULL DEFAULT '',
  contact_number VARCHAR(40)  NOT NULL DEFAULT '',
  sort_order     INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_customer_contacts_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_documents (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id   INT UNSIGNED NOT NULL,
  file_path     VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  uploaded_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_customer_documents_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
