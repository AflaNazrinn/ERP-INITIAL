-- Sales Order: the fields of the sales order screen. Document title (Sales Order or Proforma Invoice), supplier mode
-- (one supplier for the order, or a supplier per line), the supplier and its currency, purchase category, the costs
-- (custom duty, business promotion) and Send For Approval; per line the buying cost and, in multi-supplier mode, the
-- line's supplier. The buying total and the profit are worked out on save and stored with the order.
-- Payment terms on a sales order are free text ("50% Advance, 50% on Delivery").

ALTER TABLE sales_orders
  ADD COLUMN document_title     VARCHAR(30)   NOT NULL DEFAULT 'Sales Order' AFTER so_date,
  ADD COLUMN supplier_mode      VARCHAR(10)   NOT NULL DEFAULT 'single' AFTER document_title,
  ADD COLUMN supplier_id        INT UNSIGNED  NULL AFTER supplier_mode,
  ADD COLUMN supplier_currency  VARCHAR(10)   NOT NULL DEFAULT 'OMR' AFTER supplier_id,
  ADD COLUMN purchase_category  VARCHAR(100)  NOT NULL DEFAULT '' AFTER customer_po,
  ADD COLUMN custom_duty        DECIMAL(14,3) NOT NULL DEFAULT 0 AFTER shipping,
  ADD COLUMN business_promotion DECIMAL(14,3) NOT NULL DEFAULT 0 AFTER custom_duty,
  ADD COLUMN items_buying       DECIMAL(14,3) NOT NULL DEFAULT 0 AFTER business_promotion,
  ADD COLUMN total_buying       DECIMAL(14,3) NOT NULL DEFAULT 0 AFTER items_buying,
  ADD COLUMN total_profit       DECIMAL(14,3) NOT NULL DEFAULT 0 AFTER total_buying,
  ADD COLUMN send_for_approval  TINYINT(1)    NOT NULL DEFAULT 0 AFTER advance_payment,
  ADD COLUMN status             VARCHAR(20)   NOT NULL DEFAULT 'Draft' AFTER send_for_approval,
  MODIFY COLUMN payment_mode    VARCHAR(100)  NOT NULL DEFAULT '',
  ADD CONSTRAINT fk_sales_orders_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE RESTRICT;

ALTER TABLE sales_order_items
  ADD COLUMN supplier_id       INT UNSIGNED  NULL AFTER delivery_term,
  ADD COLUMN supplier_currency VARCHAR(10)   NOT NULL DEFAULT '' AFTER supplier_id,
  ADD COLUMN buying_cost       DECIMAL(14,3) NOT NULL DEFAULT 0 AFTER line_total,
  ADD CONSTRAINT fk_sales_order_items_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE RESTRICT;
