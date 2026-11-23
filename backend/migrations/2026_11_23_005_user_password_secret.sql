-- User Setting: the password of a login made or changed there, kept encrypted (libsodium secretbox; the key is a file in
-- the storage folder or PASSWORD_KEY, never in the database) so the Edit page can show it to users allowed to edit
-- logins. Signing in still checks password_hash. NULL for passwords set before this file (or elsewhere): those show
-- once a new password is saved.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE users
  ADD COLUMN password_secret TEXT NULL AFTER password_hash;
