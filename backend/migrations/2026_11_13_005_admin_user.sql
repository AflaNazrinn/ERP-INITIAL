-- The first user (November 2026): username admin, password admin@1234.
-- Only a bcrypt hash of the password is stored (PHP password_hash, cost 12; checked with password_verify).
-- Change this password after the first sign-in on a live server. INSERT IGNORE: an existing admin is kept as it is.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

INSERT IGNORE INTO users (username, full_name, password_hash)
VALUES ('admin', 'Administrator', '$2y$12$Hqoh9eIqEH3Y.QW9MquBWub0.C9Zo8BJ/q4EH9cXiu8VcAWtW9ECC');
