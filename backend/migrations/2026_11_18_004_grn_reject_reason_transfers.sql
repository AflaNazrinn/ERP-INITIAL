-- GRN lines: why the rejected quantity was rejected, and the accepted stock sent on to other stock points.
-- transfers: JSON list of { warehouseId, quantity }, at most the line's accepted quantity in all.
ALTER TABLE grn_items
  ADD COLUMN reject_reason VARCHAR(300) NOT NULL DEFAULT '' AFTER rejected_qty,
  ADD COLUMN transfers     TEXT         NULL AFTER line_total;
