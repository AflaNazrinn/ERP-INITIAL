-- Extra signatory slots on Purchase Book documents (November 2026): "Add Signatory" in the PDF print box adds
-- named slots (e.g. Store Keeper) that print after Prepared By / Checked By / Approved By. Kept as a JSON list.
-- Applied by backend/bin/migrate.php. MySQL 8 / MariaDB 10.6+.

ALTER TABLE purchase_requests  ADD COLUMN extra_signatories TEXT NULL AFTER include_signatory;
ALTER TABLE quotation_requests ADD COLUMN extra_signatories TEXT NULL AFTER include_signatory;
ALTER TABLE purchase_orders    ADD COLUMN extra_signatories TEXT NULL AFTER include_signatory;
ALTER TABLE grns               ADD COLUMN extra_signatories TEXT NULL AFTER include_signatory;
