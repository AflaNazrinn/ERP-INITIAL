-- Employee Management › User Setting: a sign-in for an employee, and what that user may open and do.
-- employee_id: the employee this login belongs to (one login per employee; deleting the employee deletes the login).
-- is_admin: full access to everything, never limited by permissions; every user from before this file is an admin
-- (the company's own sign-in), users made on User Setting are not.
-- active: 0 = may not sign in (and is signed out on the next request).
-- permissions: JSON { "purchase-book/purchase-order": { "view": true, "create": true, "edit": false, "delete": false }, … }
-- keyed by module/submodule (backend/src/permissions.php).
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE users
  ADD COLUMN employee_id INT UNSIGNED NULL AFTER id,
  ADD COLUMN is_admin    TINYINT(1)   NOT NULL DEFAULT 0 AFTER password_hash,
  ADD COLUMN active      TINYINT(1)   NOT NULL DEFAULT 1 AFTER is_admin,
  ADD COLUMN permissions TEXT         NULL AFTER active,
  ADD COLUMN updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD UNIQUE KEY uk_users_employee (employee_id),
  ADD CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE;

UPDATE users SET is_admin = 1;
