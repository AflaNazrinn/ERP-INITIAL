-- User Setting: a user's role. 'manager' opens on the dashboard (its figures and audit log, as User Setting allows);
-- 'staff' opens on the module cards and never sees the dashboard. Admins (is_admin) always open on the dashboard.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE users
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'staff' AFTER is_admin;
