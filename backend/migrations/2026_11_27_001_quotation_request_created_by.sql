-- Quotation requests record who made them (November 2026): created_by is the signed-in user's login (username),
-- set by the server when the request is created and never changed by an edit. The Purchase Book Filter's Employee
-- list counts a request under the employee with that login (src/purchase_book.php, pb_people()).
-- Requests saved before this have no creator (empty).
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE quotation_requests ADD COLUMN created_by VARCHAR(100) NOT NULL DEFAULT '' AFTER submission_deadline;
