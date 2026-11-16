-- The company's own details (November 2026): one row, filled by the Create a Company page.
-- Every company has its own database, so this table only ever describes the company the database belongs to.
-- Files (logo, letterhead, CR and VAT certificates) are under that company's storage folder; the row keeps
-- their stored paths and original names.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

CREATE TABLE IF NOT EXISTS company_profile (
  id                    TINYINT UNSIGNED NOT NULL DEFAULT 1,
  company_code          VARCHAR(12)   NOT NULL,
  company_name          VARCHAR(150)  NOT NULL,
  company_type          VARCHAR(30)   NOT NULL DEFAULT 'Main Company',
  business_type         VARCHAR(30)   NOT NULL DEFAULT 'Trading',
  cr_number             VARCHAR(30)   NULL,
  cr_expiry_date        DATE          NULL,
  vat_reg_number        VARCHAR(30)   NULL,
  legal_structure       VARCHAR(60)   NULL,
  base_currency         CHAR(3)       NOT NULL DEFAULT 'OMR',
  financial_year_start  DATE          NULL,
  vat_applicable        TINYINT(1)    NOT NULL DEFAULT 1,
  vat_percentage        DECIMAL(5,2)  NULL,
  building              VARCHAR(100)  NULL,
  street                VARCHAR(150)  NULL,
  area                  VARCHAR(100)  NULL,
  city                  VARCHAR(100)  NULL,
  country               VARCHAR(80)   NULL,
  po_box                VARCHAR(20)   NULL,
  postal_code           VARCHAR(20)   NULL,
  bank_name             VARCHAR(100)  NULL,
  account_holder        VARCHAR(150)  NULL,
  account_number        VARCHAR(40)   NULL,
  iban                  VARCHAR(40)   NULL,
  swift_code            VARCHAR(11)   NULL,
  logo_path             VARCHAR(255)  NULL,
  logo_name             VARCHAR(255)  NULL,
  letterhead_path       VARCHAR(255)  NULL,
  letterhead_name       VARCHAR(255)  NULL,
  cr_certificate_path   VARCHAR(255)  NULL,
  cr_certificate_name   VARCHAR(255)  NULL,
  vat_certificate_path  VARCHAR(255)  NULL,
  vat_certificate_name  VARCHAR(255)  NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
