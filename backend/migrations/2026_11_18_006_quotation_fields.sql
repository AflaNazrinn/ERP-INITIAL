-- Quotation: the fields of the quotation screen. Loyalty Member ID, and Round Off (added to the grand total,
-- may be negative).

ALTER TABLE quotations
  ADD COLUMN loyalty_member_id VARCHAR(40)   NOT NULL DEFAULT '' AFTER reference_no,
  ADD COLUMN round_off         DECIMAL(14,3) NOT NULL DEFAULT 0 AFTER shipping;
