-- Return & Replacement › Purchase Return: the Return Reason "Sales Return" sends a customer's returned goods back to the
-- supplier. The sales return they came back on is kept here (its items are the return's lines, not a PO's or GRN's);
-- those goods never went back into stock, so the purchase return takes nothing out of it.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE purchase_returns
  ADD COLUMN sales_return_id INT UNSIGNED NULL AFTER grn_id,
  ADD CONSTRAINT fk_purchase_returns_sales_return FOREIGN KEY (sales_return_id) REFERENCES sales_returns (id) ON DELETE RESTRICT;
