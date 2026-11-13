-- Previous sales orders (debtors) carry the quotation they came from, and a sales order is
-- Pending, Delivered or Invoiced (purchase orders stay Pending or Fulfilled).
ALTER TABLE customer_orders
  ADD COLUMN quotation_ref VARCHAR(40) NOT NULL DEFAULT '' AFTER order_date;

UPDATE customer_orders SET status = 'Delivered' WHERE status = 'Fulfilled';
