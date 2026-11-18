-- Delivery Note: the fields of the delivery note screen. Ref Num (SO / Quote) is typed, or picked from the sales
-- orders and quotations (then the document is linked too); each line has a Branch (a stock point; none means
-- Auto, the stock point with the most stock).

ALTER TABLE delivery_notes
  ADD COLUMN reference_no VARCHAR(60)  NOT NULL DEFAULT '' AFTER dn_date,
  ADD COLUMN quotation_id INT UNSIGNED NULL AFTER sales_order_id,
  ADD CONSTRAINT fk_delivery_notes_quotation FOREIGN KEY (quotation_id) REFERENCES quotations (id) ON DELETE RESTRICT;

ALTER TABLE delivery_note_items
  ADD COLUMN warehouse_id INT UNSIGNED NULL AFTER delivery_term,
  ADD CONSTRAINT fk_delivery_note_items_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT;
