-- Item Creation › Media & Specification Assets uploads (November 2026).
-- item_documents existed but nothing wrote to it. doc_kind says which box a file was uploaded in:
-- 'spec' (Doc / PDF Spec) or 'image' (CAD / Image). Files live under storage/item-documents/.
-- It only adds a column. Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE item_documents
  ADD COLUMN doc_kind VARCHAR(10) NOT NULL DEFAULT 'spec' AFTER item_id;
