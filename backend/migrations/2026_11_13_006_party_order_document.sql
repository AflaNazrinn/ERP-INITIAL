-- Previous purchase / sales orders can carry their PO / SO document (a PDF or image).
-- The file is stored as one of the party's documents; the order points at it.
ALTER TABLE supplier_orders
  ADD COLUMN document_id INT UNSIGNED NULL AFTER status,
  ADD CONSTRAINT fk_supplier_orders_document FOREIGN KEY (document_id) REFERENCES supplier_documents (id) ON DELETE SET NULL;

ALTER TABLE customer_orders
  ADD COLUMN document_id INT UNSIGNED NULL AFTER status,
  ADD CONSTRAINT fk_customer_orders_document FOREIGN KEY (document_id) REFERENCES customer_documents (id) ON DELETE SET NULL;
