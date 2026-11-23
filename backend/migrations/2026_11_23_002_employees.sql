-- Employee Management › Employee: staff records (EMP-0001, employee number 1001).
-- Identity & photo (first / last name, gender, date of birth, marital status, nationality, a profile photo);
-- contact & employment (email, phone, address, city, country, the assigned company, department, designation, joining
-- date, status, employment type, work location, the stock point they work at, board team member); finance & identity
-- (salary, HRA, other allowance, bank, account, IBAN, national ID, passport and visa with expiry dates); an emergency
-- contact, remarks and uploaded documents (employee_documents).
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

CREATE TABLE employees (
  id                     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  emp_no                 INT UNSIGNED  NOT NULL,
  emp_code               VARCHAR(20)   NOT NULL,
  first_name             VARCHAR(60)   NOT NULL,
  last_name              VARCHAR(60)   NOT NULL DEFAULT '',
  photo_path             VARCHAR(255)  NULL,
  gender                 VARCHAR(20)   NOT NULL DEFAULT '',
  date_of_birth          DATE          NULL,
  marital_status         VARCHAR(20)   NOT NULL DEFAULT '',
  nationality            VARCHAR(80)   NOT NULL DEFAULT '',
  email                  VARCHAR(150)  NOT NULL DEFAULT '',
  phone                  VARCHAR(40)   NOT NULL DEFAULT '',
  address                VARCHAR(255)  NOT NULL DEFAULT '',
  city                   VARCHAR(80)   NOT NULL DEFAULT '',
  country                VARCHAR(80)   NOT NULL DEFAULT '',
  company_code           VARCHAR(12)   NOT NULL DEFAULT '',
  company_name           VARCHAR(150)  NOT NULL DEFAULT '',
  department             VARCHAR(80)   NOT NULL DEFAULT '',
  designation            VARCHAR(100)  NOT NULL DEFAULT '',
  join_date              DATE          NULL,
  status                 VARCHAR(20)   NOT NULL DEFAULT 'Active',
  employment_type        VARCHAR(20)   NOT NULL DEFAULT 'Full-time',
  work_location          VARCHAR(100)  NOT NULL DEFAULT '',
  warehouse_id           INT UNSIGNED  NULL,
  board_member           TINYINT(1)    NOT NULL DEFAULT 0,
  basic_salary           DECIMAL(14,3) NULL,
  hra                    DECIMAL(14,3) NULL,
  other_allowance        DECIMAL(14,3) NULL,
  bank_name              VARCHAR(120)  NOT NULL DEFAULT '',
  bank_account_no        VARCHAR(40)   NOT NULL DEFAULT '',
  iban                   VARCHAR(40)   NOT NULL DEFAULT '',
  national_id            VARCHAR(40)   NOT NULL DEFAULT '',
  passport_no            VARCHAR(40)   NOT NULL DEFAULT '',
  passport_expiry        DATE          NULL,
  visa_no                VARCHAR(40)   NOT NULL DEFAULT '',
  visa_expiry            DATE          NULL,
  emergency_name         VARCHAR(120)  NOT NULL DEFAULT '',
  emergency_relationship VARCHAR(60)   NOT NULL DEFAULT '',
  emergency_phone        VARCHAR(40)   NOT NULL DEFAULT '',
  remarks                TEXT          NULL,
  created_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_employees_code (emp_code),
  UNIQUE KEY uk_employees_no (emp_no),
  KEY idx_employees_name (first_name, last_name),
  CONSTRAINT fk_employees_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employee_documents (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id   INT UNSIGNED NOT NULL,
  doc_type      VARCHAR(60)  NOT NULL DEFAULT '',
  file_path     VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  uploaded_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_employee_documents_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
