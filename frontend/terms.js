/* =====================================================================
   terms.js — the quotation's General Terms & Conditions, shared by the Create a Company page (company.js:
   the Terms & Conditions box starts with these) and the dashboard (dashboard.js: the quotation PDF prints
   them on a page of their own).

   The text is plain, one item per line:
     "1. Quotation Validity: This quotation is valid for **{validity}** …"   a numbered item, its title in bold
     a line without a number                                                 a paragraph
     **text**                                                                bold
     {validity}                                                              the quotation's Offer Validity ("30 days")
     {currency}                                                              its currency ("Omani Rial (OMR)")
   ===================================================================== */

'use strict';

const QUOTATION_TERMS_DEFAULT = `1. Quotation Validity: This quotation is valid for **{validity}** from the date of issue unless otherwise stated.
2. Pricing: All prices are quoted in **{currency}** and are **exclusive of VAT**, unless specifically mentioned otherwise.
3. Payment Terms: Payment shall be made in accordance with the terms specified in this quotation or as mutually agreed in the Purchase Order.
4. Delivery: Delivery will be made within the agreed lead time, subject to stock availability and order confirmation.
5. Product Availability: All quoted items are subject to availability at the time of order confirmation.
6. Order Acceptance: Orders will be processed only upon receipt of an official Purchase Order (PO) and/or advance payment, where applicable.
7. Transportation: Unless otherwise specified, delivery is included only within **Muscat city limits**. Additional transportation, unloading, site handling, or special delivery requirements will be charged separately.
8. Returns: Customized, special-order, imported, fabricated, or cut-to-length items are non-returnable unless otherwise agreed in writing.
9. Warranty: Warranty, where applicable, shall be limited to the manufacturer's standard warranty terms and conditions.
10. Inspection & Claims: Any visible damage, shortages, or discrepancies must be reported in writing within **two (2) working days** from the date of delivery. Claims submitted thereafter may not be accepted.
11. Additional Scope: Any materials, accessories, labour, or services not specifically included in this quotation shall be considered additional and will be charged separately.
12. Price Revision: Quoted prices are based on current supplier costs and may be revised prior to order confirmation in the event of significant changes in raw material prices, freight charges, customs duties, taxes, currency exchange rates, or other factors beyond our control.
13. Force Majeure: The Company shall not be held liable for any delay or failure in performance resulting from circumstances beyond its reasonable control, including but not limited to natural disasters, acts of government, war, civil unrest, labour disputes, transportation interruptions, supplier delays, or other force majeure events.
14. Overdue Payments: The Company reserves the right to suspend deliveries, services, or order processing in the event of overdue payments until all outstanding amounts are settled.
15. Governing Law: This quotation and any resulting transaction shall be governed by and construed in accordance with the laws of the **Sultanate of Oman**.
16. Acceptance: Placement of a Purchase Order or written confirmation shall constitute acceptance of all the terms and conditions contained in this quotation unless otherwise agreed in writing.

We kindly request you to review this quotation carefully to ensure that the specifications, quantities, pricing, and commercial terms fully meet your requirements. This quotation has been prepared based on the information, scope of supply, and quantities specified herein. Any modification to the specifications, quantities, delivery requirements, or scope of work may result in a revision of the quoted prices and delivery schedule.
Unless otherwise agreed in writing, all goods supplied are non-returnable and non-refundable, except in cases of manufacturing defects or products delivered in damaged condition. We appreciate the opportunity to submit our quotation and look forward to serving your requirements. Should you require any further information, clarification, or technical assistance, please feel free to contact us.`;

// "Some **bold** text" → text and <strong> nodes (never HTML from the text itself).
function termsInline(text) {
  const fragment = document.createDocumentFragment();
  String(text).split(/(\*\*[^*]+\*\*)/).forEach(part => {
    if (!part) return;
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      fragment.append(strong);
    } else {
      fragment.append(document.createTextNode(part));
    }
  });
  return fragment;
}

// The terms as page content: a list of numbered items, then the paragraphs (a blank line adds space before the next).
// values: { validity: '30 days', currency: 'Omani Rial (OMR)' } fill the {validity} and {currency} places.
function renderQuotationTerms(text, values = {}) {
  const filled = String(text || '').replace(/\{(\w+)\}/g, (match, key) => (values[key] != null && values[key] !== '' ? values[key] : match));
  const box = document.createElement('div');
  box.className = 'ps-terms-list';
  let gap = false;
  for (const raw of filled.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { gap = true; continue; }
    const item = /^(\d+)[.)]\s*([^:]{1,60}):\s*(.*)$/.exec(line);
    const p = document.createElement('p');
    p.className = item ? 'ps-term' : 'ps-term-para';
    if (gap && box.childElementCount) p.classList.add('ps-term-gap');
    gap = false;
    if (item) {
      const title = document.createElement('strong');
      title.textContent = `${item[2].trim()}:`;
      p.append(`${item[1]}. `, title, ' ', termsInline(item[3]));
    } else {
      p.append(termsInline(line));
    }
    box.append(p);
  }
  return box;
}
