'use strict';

/* =====================================================================
   Formatting helpers
   ===================================================================== */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const omrNumber = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const countNumber = new Intl.NumberFormat('en-US');

// Money arrives from the API as DECIMAL strings ("1234.500"); only format here.
function formatOmr(value) {
  return `OMR ${omrNumber.format(Number(value) || 0)}`;
}
function formatAmount(value) {
  return omrNumber.format(Number(value) || 0);
}
function formatCount(value) {
  return countNumber.format(Number(value) || 0);
}
function formatDate(date) {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatTime(date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const byId = id => document.getElementById(id);

/* =====================================================================
   Data source
   Replace the body of fetchDashboard() with
     (await apiRequest(`api/dashboard.php?month=${month}&year=${year}&chartMonth=...`)).data
   once the backend exists. The shape below is the API contract.
   ===================================================================== */

async function fetchDashboard({ chartYear, chartMonth }) {
  const weeks = Math.ceil(new Date(chartYear, chartMonth, 0).getDate() / 7);
  return {
    kpis: {
      totalSales: '0.000',
      totalPurchase: '0.000',
      pendingPurchase: '0.000',
      totalItems: 0,
      totalEmployees: 0,
      creditors: '0.000',
      debtors: '0.000',
    },
    // Margin % = (sales - cost) / sales * 100, computed server-side. Negative = loss.
    profitLoss: {
      lastMonth: { ...shiftMonth(today.getFullYear(), today.getMonth() + 1, -1), margin: '0.0' },
      overall: { margin: '0.0' },
    },
    chart: {
      sales: '0.000',
      purchase: '0.000',
      weeks: Array.from({ length: weeks }, (_, i) => ({ label: `W${i + 1}`, sales: '0.000', purchase: '0.000' })),
    },
    returns: { purchaseReturn: '0.000', salesReturn: '0.000', rmaCount: 0, resolvedCount: 0 },
    quotations: { total: 0, totalValue: '0.000', pending: 0, approved: 0, rejected: 0 },
    // Sample rows from the design; the real list comes from the audit log table.
    activities: [
      { at: '2026-10-27T15:10:42', user: 'Anas', role: 'Sales Executive', title: 'Created a Quotation',
        detail: 'Quotation generated for customer review:', ref: '#QUO-2026-0041', module: 'Sales Portal', status: 'Completed' },
      { at: '2026-10-27T14:45:18', user: 'Justin', role: 'Operations Manager', title: 'Edited a Sales Order',
        detail: 'Modified line items and delivery schedule on', ref: '#SO-2026-0118', module: 'Sales Orders', status: 'Updated' },
      { at: '2026-10-27T13:20:05', user: 'Anas', role: 'Sales Executive', title: 'Created Delivery Note',
        detail: 'Dispatched items for warehouse transfer under', ref: '#DN-2026-0089', module: 'Logistics', status: 'Completed' },
      { at: '2026-10-27T11:05:33', user: 'Justin', role: 'Operations Manager', title: 'Updated Quotation Terms',
        detail: 'Revised payment terms and discounts on', ref: '#QUO-2026-0039', module: 'Sales Portal', status: 'Updated' },
    ],
  };
}

/* =====================================================================
   State
   ===================================================================== */

const today = new Date();
const state = {
  chartYear: today.getFullYear(),
  chartMonth: today.getMonth() + 1,        // 1..12
  activityPage: 1,
  data: null,
};
const ACTIVITY_PAGE_SIZE = 15;

/* =====================================================================
   Header
   ===================================================================== */

function renderRange() {
  const start = new Date(state.chartYear, state.chartMonth - 1, 1);
  const end = new Date(state.chartYear, state.chartMonth, 0);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  byId('dashboard-range-text').textContent = `${fmt(start)} — ${fmt(end)}`;
}

/* =====================================================================
   KPI tiles
   ===================================================================== */

const KPI_TILES = [
  { key: 'totalSales', label: 'Total Sales', money: true },
  { key: 'totalPurchase', label: 'Total Purchase', money: true },
  { key: 'pendingPurchase', label: 'Pending Purchase', money: true },
  { key: 'totalItems', label: 'Total Items', money: false },
  { key: 'totalEmployees', label: 'Total Employees', money: false },
  { key: 'creditors', label: 'Creditors', money: true },
  { key: 'debtors', label: 'Debtors', money: true },
];

function renderKpis(kpis) {
  const grid = byId('dashboard-kpis');
  grid.replaceChildren(...KPI_TILES.map(tile => {
    const card = el('div', 'metric-card');
    card.append(
      el('span', 'card-label', tile.label),
      el('div', 'kpi-value', tile.money ? formatOmr(kpis[tile.key]) : formatCount(kpis[tile.key])),
    );
    return card;
  }));
}

/* =====================================================================
   Profit & Loss
   ===================================================================== */

// A negative margin is a loss: label it "Loss", show the size without the sign, colour it red.
function renderMargin(prefix, labelId, valueId, margin) {
  const value = Number(margin) || 0;
  const isLoss = value < 0;
  byId(labelId).textContent = `${prefix} · ${isLoss ? 'Loss' : 'Profit'}`;
  const node = byId(valueId);
  node.textContent = `${Math.abs(value).toFixed(1)}%`;
  node.classList.toggle('is-profit', value > 0);
  node.classList.toggle('is-loss', isLoss);
}

function renderProfitLoss(pl) {
  const { year, month } = pl.lastMonth;
  const monthName = `${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`;
  renderMargin(`Last month (${monthName})`, 'pl-month-label', 'pl-month-value', pl.lastMonth.margin);
  renderMargin('Total overall', 'pl-overall-label', 'pl-overall-value', pl.overall.margin);
}

/* =====================================================================
   Monthly Purchase & Sales chart
   ===================================================================== */

function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function renderChartMonths() {
  const group = byId('chart-months');
  const hadFocus = group.contains(document.activeElement);
  group.replaceChildren(...[-2, -1, 0, 1].map(delta => {
    const { year, month } = shiftMonth(state.chartYear, state.chartMonth, delta);
    const short = MONTH_NAMES[month - 1].slice(0, 3);
    const active = delta === 0;
    const btn = el('button', 'segmented-btn', active ? `${short} ${year}` : short);
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(active));
    btn.setAttribute('aria-label', `${MONTH_NAMES[month - 1]} ${year}`);
    if (!active) {
      btn.addEventListener('click', () => {
        state.chartYear = year;
        state.chartMonth = month;
        loadDashboard();
      });
    }
    return btn;
  }));
  if (hadFocus) refocusWithin(group, '[aria-pressed="true"]');
}

function renderChart(chart) {
  byId('chart-sales-total').textContent = formatOmr(chart.sales);
  byId('chart-purchase-total').textContent = formatOmr(chart.purchase);
  byId('chart-legend-sales').textContent = `Sales (${formatOmr(chart.sales)})`;
  byId('chart-legend-purchase').textContent = `Purchase (${formatOmr(chart.purchase)})`;

  const max = Math.max(0, ...chart.weeks.flatMap(w => [Number(w.sales) || 0, Number(w.purchase) || 0]));
  const barHeight = value => {
    const n = Number(value) || 0;
    return max > 0 ? Math.max(4, Math.round((n / max) * 80)) : 4;
  };

  byId('chart-bars').replaceChildren(...chart.weeks.map(week => {
    const col = el('div', 'chart-week');
    const bars = el('div', 'chart-week-bars');
    const purchase = el('div', 'chart-bar chart-bar-purchase');
    const sales = el('div', 'chart-bar chart-bar-sales');
    purchase.title = `Purchase: ${formatOmr(week.purchase)}`;
    sales.title = `Sales: ${formatOmr(week.sales)}`;
    // CSSOM writes are allowed under the strict CSP; style="" attributes are not.
    purchase.style.height = `${barHeight(week.purchase)}px`;
    sales.style.height = `${barHeight(week.sales)}px`;
    bars.append(purchase, sales);
    const values = el('span', 'chart-week-values');
    values.title = `Sales ${formatOmr(week.sales)} / Purchase ${formatOmr(week.purchase)}`;
    values.append(
      el('span', 'chart-week-value-sales', formatAmount(week.sales)),
      el('span', 'chart-week-value-purchase', formatAmount(week.purchase)),
    );
    col.append(
      values,
      bars,
      el('span', 'chart-week-label', week.label),
    );
    return col;
  }));
}

/* =====================================================================
   Returns
   ===================================================================== */

function renderReturns(r) {
  byId('returns-purchase').textContent = formatOmr(r.purchaseReturn);
  byId('returns-sales').textContent = formatOmr(r.salesReturn);
  const count = Number(r.rmaCount) || 0;
  byId('returns-rma-count').textContent = `${formatCount(count)} RMA${count === 1 ? '' : 's'}`;
  const resolvedPct = count > 0 ? Math.min(100, ((Number(r.resolvedCount) || 0) / count) * 100) : 0;
  byId('returns-bar').style.width = `${resolvedPct}%`;
  byId('returns-note').textContent = count > 0
    ? `${formatCount(r.resolvedCount)} of ${formatCount(count)} returns resolved`
    : 'No returns recorded for this period';
}

/* =====================================================================
   Quotations
   ===================================================================== */

function renderQuotations(q) {
  const total = Number(q.total) || 0;
  const rate = total > 0 ? ((Number(q.approved) || 0) / total) * 100 : 0;
  byId('quotes-total').textContent = formatCount(total);
  byId('quotes-value').textContent = formatOmr(q.totalValue);
  byId('quotes-pending').textContent = formatCount(q.pending);
  byId('quotes-approved').textContent = formatCount(q.approved);
  byId('quotes-rejected').textContent = formatCount(q.rejected);
  byId('quotes-rate').textContent = `${rate.toFixed(1)}%`;
  byId('quotes-rate-bar').style.width = `${Math.min(100, rate)}%`;
}

/* =====================================================================
   Audit trail
   ===================================================================== */

const MODULE_TONES = { 'Sales Portal': 'blue', 'Sales Orders': 'green', 'Logistics': 'amber' };
const STATUS_TONES = { Completed: 'green', Updated: 'blue' };

function avatarClass(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `avatar avatar-${hash % 5}`;
}

function activityRow(a) {
  const at = new Date(a.at);
  const tr = document.createElement('tr');

  const when = el('td', 'col-edge nowrap');
  when.append(el('span', 'audit-date', formatDate(at)), el('span', 'audit-time', formatTime(at)));

  const who = el('td', 'nowrap');
  const userWrap = el('div', 'audit-user');
  const nameWrap = el('div');
  nameWrap.append(el('span', 'audit-user-name', a.user), el('span', 'audit-user-role', a.role));
  userWrap.append(el('div', avatarClass(a.user), a.user.charAt(0).toUpperCase()), nameWrap);
  who.append(userWrap);

  const what = el('td');
  const detail = el('span', 'audit-detail', `${a.detail} `);
  detail.append(el('span', 'audit-ref', a.ref));
  what.append(el('span', 'audit-activity', a.title), detail);

  const mod = el('td', 'nowrap');
  const moduleTone = MODULE_TONES[a.module];
  mod.append(el('span', moduleTone ? `pill pill-${moduleTone}` : 'pill', a.module));

  const status = el('td', 'col-edge col-right nowrap');
  const statusTone = STATUS_TONES[a.status];
  const statusText = a.status === 'Completed' ? `✓ ${a.status}` : a.status;
  status.append(el('span', `pill pill-mono${statusTone ? ` pill-${statusTone}` : ''}`, statusText));

  tr.append(when, who, what, mod, status);
  return tr;
}

function pagerButton(label, page, { disabled = false, current = false } = {}) {
  const btn = el('button', 'pager-btn', label);
  btn.type = 'button';
  btn.disabled = disabled;
  if (current) btn.setAttribute('aria-current', 'page');
  if (!disabled && !current) {
    btn.addEventListener('click', () => { state.activityPage = page; renderActivities(state.data.activities); });
  }
  return btn;
}

function renderActivities(rows) {
  const pages = Math.max(1, Math.ceil(rows.length / ACTIVITY_PAGE_SIZE));
  state.activityPage = Math.min(Math.max(1, state.activityPage), pages);
  const start = (state.activityPage - 1) * ACTIVITY_PAGE_SIZE;
  const visible = rows.slice(start, start + ACTIVITY_PAGE_SIZE);

  byId('audit-table-body').replaceChildren(...visible.map(activityRow));
  byId('audit-table-empty').hidden = rows.length > 0;

  const count = byId('audit-table-count');
  if (rows.length === 0) {
    count.textContent = 'No recent activities';
  } else {
    const range = el('strong', '', `${start + 1}–${start + visible.length}`);
    const total = el('strong', '', formatCount(rows.length));
    count.replaceChildren('Showing ', range, ' of ', total, ' recent activities');
  }

  const p = state.activityPage;
  const nav = byId('audit-pagination');
  const hadFocus = nav.contains(document.activeElement);
  nav.replaceChildren(
    pagerButton('Prev', p - 1, { disabled: p <= 1 }),
    ...Array.from({ length: pages }, (_, i) => pagerButton(String(i + 1), i + 1, { current: i + 1 === p })),
    pagerButton('Next', p + 1, { disabled: p >= pages }),
  );
  if (hadFocus) refocusWithin(nav, '[aria-current="page"]');
}

/* =====================================================================
   Keyboard navigation
   Tab / Shift+Tab cycle through the page's controls and wrap at either
   end, so focus never leaves for the browser toolbar. Arrow keys move
   focus to the nearest control in that direction. Only interactive
   controls take part: headings and plain text are never focus stops.
   ===================================================================== */

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'select:not([disabled])',
  'input:not([disabled]):not([type="hidden"])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// While a modal dialog is open, navigation is confined to it.
function navigationRoot() {
  return document.querySelector('dialog[open]') || document;
}

function focusableControls() {
  return [...navigationRoot().querySelectorAll(FOCUSABLE_SELECTOR)].filter(node =>
    !/^H[1-6]$/.test(node.tagName)
    && node.tabIndex >= 0                 // tabindex="-1" opts out, e.g. the read-only code fields
    && !node.closest('[hidden], [inert]')
    && node.getClientRects().length > 0);
}

function isTextEntry(node) {
  if (node.isContentEditable || node.tagName === 'TEXTAREA') return true;
  return node.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'submit', 'reset'].includes(node.type);
}

function moveFocusByTab(backwards) {
  const controls = focusableControls();
  if (controls.length === 0) return;
  const index = controls.indexOf(document.activeElement);
  let next;
  if (index === -1) next = backwards ? controls.length - 1 : 0;
  else next = (index + (backwards ? -1 : 1) + controls.length) % controls.length;
  controls[next].focus();
}

// True when ←/→ should leave this field rather than move its caret: the caret is at
// that end, or the whole text is selected (how a field looks on arriving by keyboard).
function caretAtEdge(field, key) {
  const { selectionStart: start, selectionEnd: end, value } = field;
  if (start == null) return true;         // dates: the browser exposes no caret
  if (start === 0 && end === value.length) return true;
  if (start !== end) return false;
  return key === 'ArrowLeft' ? start === 0 : end === value.length;
}

// Typed text that matches a suggestion may have the browser's list open, and ↑/↓ pick from it.
function mayHaveOpenSuggestions(input) {
  if (!input.list) return false;
  const typed = input.value.trim().toLowerCase();
  const options = [...input.list.options].map(option => option.value.toLowerCase());
  return typed !== '' && !options.includes(typed) && options.some(option => option.includes(typed));
}

// Should this arrow key leave the text field it was pressed in?
function arrowLeavesField(event) {
  const field = event.target;
  const key = event.key;
  if (key === 'ArrowLeft' || key === 'ArrowRight') return caretAtEdge(field, key);
  if (field.tagName === 'TEXTAREA') {
    // Only the browser knows the wrapped lines: if ↑/↓ did not move the caret, it was on the last line that way.
    const caret = field.selectionStart;
    setTimeout(() => {
      if (document.activeElement === field && field.selectionStart === caret && field.selectionEnd === caret) moveFocusByArrow(key);
    }, 0);
    return false;
  }
  return !mayHaveOpenSuggestions(field);
}

// Arrival by arrow: single-line text is selected, so typing replaces it and the next arrow moves on.
function focusByArrow(node) {
  if (node.tagName === 'TEXTAREA') node.focus(); else focusField(node);
}

// Gap from rect a to rect b along the arrow direction, or null if b is not in that direction.
function directionalGap(a, b, key) {
  const ax = (a.left + a.right) / 2, ay = (a.top + a.bottom) / 2;
  const bx = (b.left + b.right) / 2, by = (b.top + b.bottom) / 2;
  switch (key) {
    case 'ArrowRight': return bx > ax + 1 && b.right > a.right ? Math.max(0, b.left - a.right) : null;
    case 'ArrowLeft':  return bx < ax - 1 && b.left < a.left ? Math.max(0, a.left - b.right) : null;
    case 'ArrowDown':  return by > ay + 1 && b.bottom > a.bottom ? Math.max(0, b.top - a.bottom) : null;
    case 'ArrowUp':    return by < ay - 1 && b.top < a.top ? Math.max(0, a.top - b.bottom) : null;
    default: return null;
  }
}

// Distance across the arrow direction; 0 when the two boxes share a row (or column).
function crossGap(a, b, key) {
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const [aStart, aEnd, bStart, bEnd] = horizontal
    ? [a.top, a.bottom, b.top, b.bottom]
    : [a.left, a.right, b.left, b.right];
  return Math.max(0, bStart - aEnd, aStart - bEnd);
}

const ROW_TOLERANCE = 24;   // px: controls this close vertically count as one row

// Left/Right: nearest control on the same row; at a row's end, continue in reading order.
// Up/Down: nearest row above/below, then the control closest horizontally; stop at the edge.
function moveFocusByArrow(key) {
  const controls = focusableControls();
  if (controls.length === 0) return;
  const current = document.activeElement;
  if (!controls.includes(current)) { controls[0].focus(); return; }

  const from = current.getBoundingClientRect();
  const candidates = controls
    .filter(node => node !== current)
    .map(node => {
      const rect = node.getBoundingClientRect();
      return { node, rect, gap: directionalGap(from, rect, key) };
    })
    .filter(c => c.gap !== null);

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const sameRow = candidates.filter(c => crossGap(from, c.rect, key) === 0);
    if (sameRow.length) {
      sameRow.sort((a, b) => a.gap - b.gap);
      focusByArrow(sameRow[0].node);
    } else {
      moveFocusByTab(key === 'ArrowLeft');
    }
    return;
  }

  if (candidates.length === 0) return;  // top or bottom edge: stay put
  const nearestRow = Math.min(...candidates.map(c => c.gap));
  const centerX = r => (r.left + r.right) / 2;
  const row = candidates.filter(c => c.gap <= nearestRow + ROW_TOLERANCE);
  row.sort((a, b) => Math.abs(centerX(a.rect) - centerX(from)) - Math.abs(centerX(b.rect) - centerX(from)));
  focusByArrow(row[0].node);
}

// Pull keyboard focus from the browser toolbar into the page on load, so the
// first Tab lands on the first control. #app has tabindex="-1": it can hold
// focus but is never a Tab or arrow stop itself.
function focusPageAnchor() {
  const app = byId('app');
  if (app.contains(document.activeElement) && document.activeElement !== app) return;
  window.focus();
  app.focus({ preventScroll: true });
}

// Shortcuts belong to this page only: they act while this tab has keyboard focus,
// and every key the page uses has its browser action cancelled (preventDefault).
// They use Ctrl, never Cmd, so macOS keeps its own Cmd shortcuts (Cmd+M, Cmd+Q …).
// Browsers keep a few keys for themselves (Ctrl+T, Ctrl+N, Ctrl+W, Ctrl+Tab), so
// the page never uses those.
function initKeyboardNavigation() {
  focusPageAnchor();
  window.addEventListener('pageshow', focusPageAnchor);   // back/forward cache restores
  // Coming back to the window with nothing focused: give the keyboard to the page again.
  window.addEventListener('focus', () => {
    if (document.activeElement === document.body || !document.activeElement) focusPageAnchor();
  });

  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing) return;   // IME composition: not a shortcut

    // An open "Select …" popup takes every key; a lookup field's own keys come before the page's.
    if (byId('lookup').open) {
      handleLookupDialogKeys(event);
      event.stopPropagation();
      return;
    }
    if (handleLookupFieldKeys(event)) {
      event.stopPropagation();
      return;
    }

    // The open form's own keys (Esc, Ctrl+S, Enter …) come first, unless the menu is over it.
    const pageKeys = FORM_KEY_HANDLERS[currentPage];
    if (pageKeys && !byId('quick-menu').open && pageKeys(event)) {
      event.stopPropagation();
      return;
    }

    // Ctrl+D, dashboard letters M/P/T/E/R/S, and Esc / letter keys inside the quick menu.
    if (handleQuickMenuKeys(event)) {
      event.stopPropagation();
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (event.key === 'Tab') {
      event.preventDefault();
      moveFocusByTab(event.shiftKey);
      return;
    }

    if (event.shiftKey || !event.key.startsWith('Arrow')) {
      // Enter opens a focused dropdown (Space and Alt+Down already do natively).
      if (event.key === 'Enter' && event.target.tagName === 'SELECT') {
        event.preventDefault();
        try { event.target.showPicker(); } catch { /* unsupported: Space still works */ }
      }
      return;
    }
    if (event.target.closest('.fp-row') && ['INPUT', 'SELECT'].includes(event.target.tagName)) return;  // handleTableArrows
    if (isTextEntry(event.target) && !arrowLeavesField(event)) return;  // the arrow moves the caret instead
    event.preventDefault();                 // also stops a closed <select> changing value
    moveFocusByArrow(event.key);
  }, true);
}

// Re-rendering replaces buttons; keep focus on the equivalent control.
function refocusWithin(container, selector) {
  const target = container.querySelector(selector);
  if (target) target.focus();
}

/* =====================================================================
   Quick menu (Ctrl+D) and its sub-menus
   One <dialog>: the main view plus one view per card (and nested views
   such as Masters › Create). Esc / ← step back one level; from the main
   menu they close it.
   The bold letter on each entry is its shortcut. On the dashboard, a
   main-menu letter alone (M P T E R S L) opens that sub-menu.
   Inside an open view, the plain letter or Alt + letter picks the entry.
   ===================================================================== */

let quickMenuReturnFocus = null;
let quickMenuView = 'main';
let quickMenuAltArmed = false;            // Alt is down and no other key has been pressed with it
// Either Alt key: on Linux and most non-US layouts the right one reports itself as AltGraph.
const isAltKey = key => key === 'Alt' || key === 'AltGraph';

function quickMenuViewEl(view) {
  return byId('quick-menu').querySelector(`.qm-view[data-view="${view}"]`);
}

function showQuickMenuView(view, focusSelector) {
  const menu = byId('quick-menu');
  quickMenuView = view;
  menu.dataset.view = view;               // lets CSS size the panel per view
  for (const section of menu.querySelectorAll('.qm-view')) section.hidden = section.dataset.view !== view;
  const current = quickMenuViewEl(view);
  menu.setAttribute('aria-labelledby', current.querySelector('.qm-title').id);
  current.querySelector('.qm-list').scrollTop = 0;
  if (!menu.open) return;
  const target = (focusSelector && current.querySelector(focusSelector)) || current.querySelector('.qm-list .qm-item');
  if (target) target.focus();
}

function openQuickMenu(view = 'main', focusSelector) {
  const menu = byId('quick-menu');
  if (!menu.open) {
    quickMenuReturnFocus = document.activeElement;
    document.documentElement.classList.add('has-modal');
    menu.showModal();
  }
  // Every view opens on its top entry (Create in sub-menus), unless told otherwise.
  showQuickMenuView(view, focusSelector);
}

function closeQuickMenu() {
  const menu = byId('quick-menu');
  if (menu.open) menu.close();            // 'close' handler restores focus
}

// One level up: a view's data-parent (e.g. Create Masters → Masters), else the main menu.
function quickMenuBack() {
  if (quickMenuView === 'main') { closeQuickMenu(); return; }
  const from = quickMenuView;
  const parent = quickMenuViewEl(from).dataset.parent || 'main';
  showQuickMenuView(parent, `[data-qm-open="${from}"]`);   // land on the entry we came from
}

// Shortcuts that work on the page (Ctrl+D, dashboard letters) or only
// while the menu is open (Esc, letters, Alt + letter). Returns true when handled.
function handleQuickMenuKeys(event) {
  const menu = byId('quick-menu');
  const plainCtrl = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!isAltKey(key)) quickMenuAltArmed = false;   // Alt + another key is a different shortcut

  if (plainCtrl && key === 'd') {          // replaces the browser's "bookmark page"
    event.preventDefault();
    if (event.repeat) return true;         // held down: act once, swallow the repeats
    if (menu.open) closeQuickMenu(); else openQuickMenu('main');
    return true;
  }
  // On the dashboard, a main-menu letter on its own (M P T E R S L) opens that sub-menu.
  // Not while typing in a field, and not on form pages, where letters are text.
  const noModifiers = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  const opener = !menu.open && currentPage === 'dashboard' && noModifiers && key.length === 1
    && !isTextEntry(event.target)
    && quickMenuViewEl('main').querySelector(`[data-qm-open][data-key="${CSS.escape(key)}"]`);
  if (opener) {
    event.preventDefault();
    if (!event.repeat) openQuickMenu(opener.dataset.qmOpen);
    return true;
  }
  // Alt on its own (pressed and released) opens this sub-menu's Create; see handleQuickMenuAltUp.
  // Checked before the Ctrl test: on Windows the right Alt (AltGr) arrives with ctrlKey set.
  if (menu.open && isAltKey(key) && !event.shiftKey && quickMenuViewEl(quickMenuView).querySelector('[aria-keyshortcuts="Alt"]')) {
    event.preventDefault();
    if (!event.repeat) quickMenuAltArmed = true;
    return true;
  }
  if (!menu.open || event.ctrlKey || event.metaKey) return false;
  if (key === 'Escape' && !event.altKey && quickMenuView !== 'main') {
    event.preventDefault();                // stop the dialog closing; step back instead
    if (!event.repeat) quickMenuBack();    // holding Esc must not run through every level
    return true;
  }
  // A plain letter, or Alt + letter ("Create (Alt)"), picks the entry with that bold letter.
  // Alt uses the physical key, since Option+letter on a Mac types a symbol.
  const letter = event.altKey
    ? (/^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : '')
    : (key.length === 1 ? key : '');
  if (letter && !event.shiftKey) {
    const item = quickMenuViewEl(quickMenuView).querySelector(`[data-key="${CSS.escape(letter)}"]`);
    if (item) {
      event.preventDefault();
      item.focus();
      item.click();
      return true;
    }
  }
  return false;
}

// Fires on Alt release, so Alt + letter (the "Create (Alt)" entries) still works.
// preventDefault stops Firefox showing its menu bar.
function handleQuickMenuAltUp(event) {
  if (!isAltKey(event.key) || !quickMenuAltArmed) return;
  quickMenuAltArmed = false;
  event.preventDefault();
  const create = byId('quick-menu').open && quickMenuViewEl(quickMenuView).querySelector('[aria-keyshortcuts="Alt"]');
  if (create) create.click();
}

function initQuickMenu() {
  const menu = byId('quick-menu');
  window.addEventListener('keyup', handleQuickMenuAltUp, true);
  window.addEventListener('blur', () => { quickMenuAltArmed = false; });
  menu.addEventListener('close', () => {
    // Chromium can deliver 'close' (after Esc) late; if a shortcut has already
    // reopened the menu, this event is stale and must not reset it.
    if (menu.open) return;
    document.documentElement.classList.remove('has-modal');
    showQuickMenuView('main');             // next Ctrl+D starts on the main menu
    const target = quickMenuReturnFocus && document.contains(quickMenuReturnFocus) ? quickMenuReturnFocus : byId('app');
    target.focus({ preventScroll: true });
    quickMenuReturnFocus = null;
  });

  menu.addEventListener('click', event => {
    // A click on the backdrop lands on the <dialog> itself, outside its box.
    if (event.target === menu) {
      const r = menu.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) closeQuickMenu();
      return;
    }
    const action = event.target.closest('[data-qm]')?.dataset.qm;
    if (action === 'close') { closeQuickMenu(); return; }
    if (action === 'back') { quickMenuBack(); return; }

    const opener = event.target.closest('[data-qm-open]');
    if (opener) { showQuickMenuView(opener.dataset.qmOpen); return; }

    // Module screens don't exist yet; the hash records where the user is heading.
    if (event.target.closest('a.qm-item')) {
      pageOriginView = quickMenuView;      // Esc on the page comes back to this view
      closeQuickMenu();
    }
  });
}

/* =====================================================================
   Toast (shared by every screen)
   ===================================================================== */

let toastTimer = 0;
function showToast(title, message, isError = false) {
  const toast = byId('toast');
  byId('toast-title').textContent = title;
  byId('toast-message').textContent = message;
  byId('toast-icon').textContent = isError ? '!' : '✓';
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

/* =====================================================================
   Shared by form pages
   ===================================================================== */

function clearFieldError(node) {
  node.classList.remove('is-invalid');
  node.removeAttribute('aria-invalid');
  node.removeAttribute('title');
}

function clearFormErrors(form) {
  for (const node of form.querySelectorAll('.is-invalid')) clearFieldError(node);
}

// Marks every failed field, then focuses and announces the first. errors: [{ node, message }]
function showFormErrors(errors, reveal) {
  for (const { node, message } of errors) {
    node.classList.add('is-invalid');
    node.setAttribute('aria-invalid', 'true');
    node.title = message;
  }
  reveal?.(errors[0].node);                // the field may be on another tab
  errors[0].node.focus();
  showToast('Check the highlighted fields', errors[0].message, true);
}

// Fields Enter walks through, in page order, ending on the Save button.
function formEnterOrder(form, saveButton) {
  const fields = [...form.querySelectorAll('input:not([readonly]):not([disabled]):not([type="file"]), select, textarea')]
    .filter(node => node.getClientRects().length > 0);
  return [...fields, saveButton];
}

// Today as a date input holds it (YYYY-MM-DD), in local time.
function todayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// A table cell counts as filled once it holds something other than its starting value.
const isCellFilled = cell => cell.value.trim() !== '' && cell.value !== cell.defaultValue;

function focusField(node) {
  node.focus();
  if (node.select && node.type !== 'date') node.select();
}

/* =====================================================================
   API client  (backend/public/api/*.php, behind Caddy on the same origin)
   Success: { data }. Errors: { error, fields? } with 4xx/5xx. Writes send
   the session's CSRF token (from api/session.php) in X-CSRF-Token.
   ===================================================================== */

class ApiError extends Error {
  constructor(message, status = 0, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

let csrfToken = null;
async function loadCsrfToken() {
  csrfToken = (await apiRequest('api/session.php')).csrfToken;
  return csrfToken;
}

// options: { method, json (body to send as JSON), body (e.g. FormData) }. Resolves to the response's data.
async function apiRequest(url, { method = 'GET', json, body } = {}, retried = false) {
  const headers = { Accept: 'application/json' };
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken ?? await loadCsrfToken();
  let response;
  try {
    response = await fetch(url, { method, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError('The server could not be reached. Check that the backend is running.');
  }
  let result = null;
  try { result = await response.json(); } catch { /* not JSON: handled below */ }
  // An expired session has a new token: fetch it and try once more.
  if (response.status === 403 && method !== 'GET' && !retried) {
    await loadCsrfToken();
    return apiRequest(url, { method, json, body: json === undefined ? body : undefined }, true);
  }
  if (!response.ok || !result || !('data' in result)) {
    throw new ApiError(result?.error || `The server answered ${response.status}. Check that the backend is running.`, response.status, result?.fields || {});
  }
  return result.data;
}

/* =====================================================================
   Lookup popups ("Select UOM", "Select Warehouse" …), one per foreign key
   in the data model (database model/Growth-Engine-Masters-HD.png):
     items.uom_id → uoms, items.category_id → categories,
     items.sub_category_id → sub_categories, items.brand_id → brands,
     items.warehouse_id → warehouses, items.rack_id → rack_bins,
     item_brands / item_brand_suppliers → brands, suppliers,
     uoms.conversion_base_id → uoms, supplier_brands → brands,
     and the country pickers on the supplier, customer and warehouse forms.

   A lookup field is <input data-lookup="KIND"> inside .fp-lookup-wrap; the
   chosen record's id goes into the hidden input beside it. The field
   cannot be typed into: a letter, Space, F4, Alt+↓, a click, or Enter while
   it is empty opens the popup (the letter starts the search). Backspace or
   Delete clears it. In the popup, type to search, ↑/↓ move, Enter picks,
   Esc closes. A field with data-lookup-parent (sub-category, rack) lists
   only the rows under the parent's choice.
   ===================================================================== */

// Countries are a fixed list, not a table; the record keeps the name (customers.country).
const COUNTRIES = [
  ['OM', 'Oman'], ['AE', 'United Arab Emirates'], ['SA', 'Saudi Arabia'], ['QA', 'Qatar'], ['KW', 'Kuwait'], ['BH', 'Bahrain'],
  ['IN', 'India'], ['PK', 'Pakistan'], ['EG', 'Egypt'], ['JO', 'Jordan'], ['TR', 'Türkiye'], ['CN', 'China'], ['JP', 'Japan'],
  ['KR', 'South Korea'], ['DE', 'Germany'], ['IT', 'Italy'], ['GB', 'United Kingdom'], ['US', 'United States'],
].map(([code, name]) => ({ id: name, code, name }));

// title and list name the popup; plural counts its rows; columns are [rowKey, heading], the first shown as the code.
const codeAndName = row => `${row.code} · ${row.name}`;
const LOOKUPS = {
  uom: { title: 'Select UOM', letter: 'U', list: 'UOM List', plural: 'units', api: 'api/uoms.php',
    columns: [['code', 'Code'], ['name', 'UOM Name']], display: row => row.name },
  category: { title: 'Select Category', letter: 'C', list: 'Category List', plural: 'categories', api: 'api/categories.php',
    columns: [['code', 'Code'], ['name', 'Category Name']], display: row => row.name },
  subcategory: { title: 'Select Sub-category', letter: 'S', list: 'Sub-category List', plural: 'sub-categories', api: 'api/sub-categories.php',
    columns: [['name', 'Sub-category Name'], ['categoryName', 'Category']], plainFirst: true, display: row => row.name, parentKey: 'categoryId' },
  brand: { title: 'Select Brand', letter: 'B', list: 'Brand List', plural: 'brands', api: 'api/brands.php',
    columns: [['code', 'Code'], ['name', 'Brand Name']], display: row => row.name },
  supplier: { title: 'Select Supplier', letter: 'S', list: 'Supplier List', plural: 'suppliers', api: 'api/suppliers.php',
    columns: [['code', 'Code'], ['name', 'Supplier Name'], ['city', 'City']], display: row => row.name },
  warehouse: { title: 'Select Warehouse', letter: 'W', list: 'Warehouse List', plural: 'warehouses', api: 'api/warehouses.php',
    columns: [['code', 'Code'], ['name', 'Warehouse Name'], ['type', 'Type']], display: codeAndName },
  rack: { title: 'Select Rack / Bin', letter: 'R', list: 'Rack / Bin List', plural: 'locations', api: 'api/rack-bins.php',
    columns: [['code', 'Location Code'], ['name', 'Location'], ['warehouseName', 'Warehouse']], display: row => row.code, parentKey: 'warehouseId' },
  item: { title: 'Select Item', letter: 'I', list: 'Item List', plural: 'items', api: 'api/items.php',
    columns: [['code', 'Code'], ['name', 'Item Name'], ['unit', 'Unit']], display: row => row.name },
  country: { title: 'Select Country', letter: 'C', list: 'Country List', plural: 'countries',
    columns: [['code', 'Code'], ['name', 'Country Name']], display: row => row.name },
};

// Each list is fetched once per page load; forgetLookups() drops lists after a save changes them.
const lookupCache = {};
async function loadLookup(kind) {
  if (kind === 'country') return COUNTRIES;
  if (!lookupCache[kind]) {
    try {
      lookupCache[kind] = await apiRequest(LOOKUPS[kind].api);
    } catch (error) {
      showToast(`Could not load ${LOOKUPS[kind].plural}`, error.message, true);
      return [];
    }
  }
  return lookupCache[kind];
}

function forgetLookups(...kinds) {
  for (const kind of kinds) delete lookupCache[kind];
}

// Shows the code the next save will get. Only a preview: the server assigns the code on save.
async function showNextCode(input, api) {
  try {
    input.value = (await apiRequest(`${api}?nextCode=1`)).code;
  } catch {
    input.value = '';                          // no backend: leave it blank rather than guess
  }
}

// Marks the fields a 422 response named; fieldNode(key) maps a payload key to its input.
function showServerErrors(error, fieldNode, reveal) {
  const errors = Object.entries(error.fields || {})
    .map(([key, message]) => ({ node: fieldNode?.(key), message }))
    .filter(entry => entry.node);
  if (errors.length) showFormErrors(errors, reveal);
  showToast('Could not save', error.message, true);
}

// Fields that pick into a list (chips) instead of holding one value: entry → { exclude, isEmpty, onPick, onClear }.
const lookupChipFields = new WeakMap();
const lookup = { field: null, kind: '', rows: [], shown: [], active: 0, byKeyboard: false };
const lookupIdInput = field => field.parentElement.querySelector('input[type="hidden"]');
const lookupParentField = field => (field.dataset.lookupParent ? byId(field.dataset.lookupParent) : null);
const isLookupField = node => node instanceof HTMLInputElement && node.dataset.lookup !== undefined;

// Shows the record in the field and keeps its id beside it. A child field (sub-category under
// category) whose choice no longer belongs to the new parent is cleared. silent: no input event.
function setLookupValue(field, row, { silent = false } = {}) {
  const hidden = lookupIdInput(field);
  const before = hidden ? hidden.value : field.value;
  field.value = row ? LOOKUPS[field.dataset.lookup].display(row) : '';
  if (hidden) hidden.value = row ? String(row.id) : '';
  if ((hidden ? hidden.value : field.value) === before) return;
  for (const child of document.querySelectorAll(`[data-lookup-parent="${CSS.escape(field.id)}"]`)) {
    const childId = lookupIdInput(child).value;
    const childRow = lookupCache[child.dataset.lookup]?.find(other => String(other.id) === childId);
    if (childId && (!row || String(childRow?.[LOOKUPS[child.dataset.lookup].parentKey]) !== String(row.id))) setLookupValue(child, null, { silent: true });
  }
  if (!silent) field.dispatchEvent(new Event('input', { bubbles: true }));
}

async function openLookup(field, { query = '', byKeyboard = false } = {}) {
  const dialog = byId('lookup');
  if (dialog.open) return;
  const kind = field.dataset.lookup;
  const config = LOOKUPS[kind];
  let rows = await loadLookup(kind);
  const parent = lookupParentField(field);
  const parentId = parent ? lookupIdInput(parent).value : '';
  if (parentId) rows = rows.filter(row => String(row[config.parentKey]) === parentId);
  const excluded = lookupChipFields.get(field)?.exclude() || [];
  rows = rows.filter(row => !excluded.includes(row.id));

  Object.assign(lookup, { field, kind, rows, byKeyboard });
  const currentId = lookupIdInput(field)?.value ?? field.value;
  lookup.active = Math.max(0, rows.findIndex(row => String(row.id) === currentId));
  byId('lookup-letter').textContent = config.letter;
  byId('lookup-title').textContent = config.title;
  byId('lookup-list-title').textContent = parentId ? `${config.list} · ${parent.value}` : config.list;
  byId('lookup-select-label').textContent = config.title;
  byId('lookup-head').replaceChildren(...config.columns.map(([, heading]) => el('th', '', heading)));
  const search = byId('lookup-search');
  search.value = query;
  search.placeholder = `Search ${config.columns.map(([, heading]) => heading.toLowerCase()).slice(0, 2).join(' or ')}...`;
  renderLookupRows();
  document.documentElement.classList.add('has-modal');
  dialog.showModal();
  search.focus();
  search.setSelectionRange(query.length, query.length);
  byId(`lookup-row-${lookup.active}`)?.scrollIntoView({ block: 'nearest' });
}

function renderLookupRows() {
  const config = LOOKUPS[lookup.kind];
  const query = byId('lookup-search').value.trim().toLowerCase();
  // Rows where a column starts with the search come first ("k" → KG before PKT).
  const texts = row => config.columns.map(([key]) => String(row[key] ?? '').toLowerCase());
  lookup.shown = query
    ? [...lookup.rows.filter(row => texts(row).some(text => text.startsWith(query))),
       ...lookup.rows.filter(row => !texts(row).some(text => text.startsWith(query)) && texts(row).some(text => text.includes(query)))]
    : lookup.rows;
  lookup.active = Math.min(lookup.active, Math.max(0, lookup.shown.length - 1));
  const rows = lookup.shown.map((row, index) => {
    const tr = el('tr');
    tr.id = `lookup-row-${index}`;
    tr.dataset.index = String(index);
    tr.setAttribute('role', 'option');
    config.columns.forEach(([key], column) => tr.append(el('td', column === 0 && !config.plainFirst ? 'lk-code' : '', String(row[key] ?? ''))));
    return tr;
  });
  if (rows.length === 0) {
    const tr = el('tr');
    const td = el('td', 'lk-empty', query ? `No ${config.plural} match “${query}”.` : `No ${config.plural} to choose from.`);
    td.colSpan = config.columns.length;
    tr.append(td);
    rows.push(tr);
  }
  byId('lookup-rows').replaceChildren(...rows);
  byId('lookup-count').textContent = query
    ? `${lookup.shown.length} of ${lookup.rows.length} ${config.plural}`
    : `${lookup.rows.length} ${config.plural}`;
  byId('lookup-select').disabled = lookup.shown.length === 0;
  syncLookupActive();
}

function syncLookupActive() {
  const search = byId('lookup-search');
  for (const tr of byId('lookup-rows').querySelectorAll('tr[data-index]')) {
    const active = Number(tr.dataset.index) === lookup.active;
    tr.classList.toggle('is-active', active);
    tr.setAttribute('aria-selected', String(active));
  }
  const activeRow = byId(`lookup-row-${lookup.active}`);
  if (activeRow) {
    search.setAttribute('aria-activedescendant', activeRow.id);
    activeRow.scrollIntoView({ block: 'nearest' });
  } else {
    search.removeAttribute('aria-activedescendant');
  }
}

function moveLookupActive(delta) {
  if (lookup.shown.length === 0) return;
  lookup.active = Math.min(lookup.shown.length - 1, Math.max(0, lookup.active + delta));
  syncLookupActive();
}

function closeLookup() {
  const dialog = byId('lookup');
  if (!dialog.open) return;
  dialog.close();
  if (!byId('quick-menu').open) document.documentElement.classList.remove('has-modal');
  if (document.contains(lookup.field)) lookup.field.focus();
}

// Picks the highlighted row. Keyboard use moves on to the next field, like Enter does.
async function pickLookupRow() {
  const row = lookup.shown[lookup.active];
  if (!row) return;
  const { field, byKeyboard } = lookup;
  closeLookup();
  const chips = lookupChipFields.get(field);
  if (chips) { chips.onPick(row); return; }
  const parent = lookupParentField(field);
  if (parent && !lookupIdInput(parent).value) {   // picked a child first: fill in its parent too
    const parentRows = await loadLookup(parent.dataset.lookup);
    const parentRow = parentRows.find(other => other.id === row[LOOKUPS[field.dataset.lookup].parentKey]);
    if (parentRow) setLookupValue(parent, parentRow, { silent: true });
  }
  setLookupValue(field, row);
  if (byKeyboard) focusNextField(field);
}

function focusNextField(field) {
  const form = field.closest('form');
  const order = formEnterOrder(form, form.querySelector('.fp-footer .fp-btn-primary'));
  focusField(order[order.indexOf(field) + 1] || field);
}

// Keys on a lookup field. Returns true when handled.
function handleLookupFieldKeys(event) {
  const field = event.target;
  if (!isLookupField(field)) return false;
  const { key } = event;
  const chips = lookupChipFields.get(field);
  const isEmpty = chips ? chips.isEmpty() : field.value === '';
  const open = query => { event.preventDefault(); if (!event.repeat) openLookup(field, { query, byKeyboard: true }); return true; };
  if (key === 'F4' || (event.altKey && key === 'ArrowDown')) return open('');
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (key === 'Backspace' || key === 'Delete') {
    event.preventDefault();
    if (chips) chips.onClear(); else if (field.value !== '') setLookupValue(field, null);
    return true;
  }
  if (key === 'Enter' && !event.shiftKey && isEmpty) return open('');
  if (key === ' ') return open('');
  // Shift+X stays the Add Row shortcut on forms with rows.
  if (key.length === 1 && !(event.shiftKey && key.toLowerCase() === 'x')) return open(key);
  return false;
}

// Keys while the popup is open; it takes every key, so nothing reaches the page behind it.
function handleLookupDialogKeys(event) {
  const { key, target } = event;
  const ctrl = event.ctrlKey || event.metaKey;
  if (key === 'Escape') { event.preventDefault(); if (!event.repeat) closeLookup(); return; }
  if (key === 'Tab' && !ctrl && !event.altKey) { event.preventDefault(); moveFocusByTab(event.shiftKey); return; }
  if (ctrl && ['s', 'd', 'z'].includes(key.toLowerCase())) { event.preventDefault(); return; }   // page shortcuts wait until it closes
  if (target !== byId('lookup-search') || ctrl || event.altKey) return;
  const steps = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };
  if (steps[key]) { event.preventDefault(); moveLookupActive(steps[key]); return; }
  if (key === 'Enter') { event.preventDefault(); if (!event.repeat) pickLookupRow(); }
}

// A list of records picked one at a time (Brand → items, Supplier → brands, Warehouse → items).
// The entry box opens the popup; Backspace in it removes the last chip. onChange runs after every change.
function createLookupChips({ container, entry, onChange }) {
  const box = byId(container);
  const input = byId(entry);
  const config = LOOKUPS[input.dataset.lookup];
  let picked = [];
  const render = () => {
    for (const old of box.querySelectorAll('.fp-chip')) old.remove();
    input.before(...picked.map((row, index) => {
      const chip = el('span', 'fp-chip');
      chip.append(el('span', '', config.display(row)));
      const remove = el('button', 'fp-chip-del', '×');
      remove.type = 'button';
      remove.dataset.chip = String(index);
      remove.setAttribute('aria-label', `Remove ${config.display(row)}`);
      chip.append(remove);
      return chip;
    }));
  };
  const change = next => { picked = next; render(); onChange(); };
  lookupChipFields.set(input, {
    exclude: () => picked.map(row => row.id),
    isEmpty: () => picked.length === 0,
    onPick(row) { clearFieldError(input); change([...picked, row]); input.focus(); },
    onClear() { if (picked.length) change(picked.slice(0, -1)); },
  });
  box.addEventListener('click', event => {
    const remove = event.target.closest('[data-chip]');
    if (remove) { change(picked.filter((_, index) => index !== Number(remove.dataset.chip))); input.focus(); }
    else if (event.target === box) input.focus();
  });
  return {
    get: () => [...picked],
    set(rows) { picked = [...rows]; render(); },
    ids: () => picked.map(row => row.id),
    input,
  };
}

// Hidden ids are not cleared by form.reset() (their value is their default), so forms call this too.
function clearLookupIds(form) {
  for (const hidden of form.querySelectorAll('.fp-lookup-wrap input[type="hidden"]')) hidden.value = '';
}

function initLookups() {
  const dialog = byId('lookup');
  // Lookup fields hold only picked records: block typed, pasted and dropped text.
  document.addEventListener('beforeinput', event => { if (isLookupField(event.target)) event.preventDefault(); });
  document.addEventListener('paste', event => {
    if (!isLookupField(event.target)) return;
    event.preventDefault();
    openLookup(event.target, { query: event.clipboardData.getData('text').trim(), byKeyboard: true });
  });
  document.addEventListener('click', event => { if (isLookupField(event.target)) openLookup(event.target); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeLookup(); });
  byId('lookup-search').addEventListener('input', () => { lookup.active = 0; renderLookupRows(); });
  // Rows are not focusable: keep focus (and typing) in the search box while clicking them.
  byId('lookup-rows').addEventListener('mousedown', event => event.preventDefault());
  byId('lookup-rows').addEventListener('click', event => {
    const tr = event.target.closest('tr[data-index]');
    if (!tr) return;
    lookup.active = Number(tr.dataset.index);
    syncLookupActive();
    if (event.detail >= 2) pickLookupRow();   // double-click picks
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {           // the backdrop, outside the panel
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeLookup();
      return;
    }
    const action = event.target.closest('[data-lookup-action]')?.dataset.lookupAction;
    if (action === 'cancel') closeLookup();
    else if (action === 'select') pickLookupRow();
  });
}

/* =====================================================================
   Item Creation  (#/masters/item/new · Masters › Create › Item)
   Enter moves to the next field; Enter on a row's Batch Expiry adds a
   row. Shift+X (outside text fields) or Alt+A adds a row, Ctrl+S saves,
   Esc returns to the popup that opened the page. Arrow keys move between table cells.
   ===================================================================== */

const ITEM_ROUTE = 'masters/item/new';
const DECIMAL_3 = /^\d{1,9}(\.\d{1,3})?$/;   // money and quantities: up to 3 decimals (OMR baisa)
const itemEl = suffix => byId(`item-${suffix}`);

function addSourceRow({ focus = true } = {}) {
  const row = byId('item-source-row-template').content.firstElementChild.cloneNode(true);
  itemEl('source-body').append(row);
  if (focus) row.querySelector('input').focus();
  return row;
}

function removeSourceRow(row) {
  const body = itemEl('source-body');
  if (body.rows.length <= 1) {
    showToast('Action denied', 'At least one sourcing row is required.', true);
    return;
  }
  const neighbour = row.nextElementSibling || row.previousElementSibling;
  row.remove();
  neighbour.querySelector('input').focus();
}

function resetItemForm() {
  itemEl('form').reset();
  clearLookupIds(itemEl('form'));
  clearFormErrors(itemEl('form'));
  showNextCode(itemEl('code'), 'api/items.php');
  itemEl('source-body').replaceChildren();
  addSourceRow({ focus: false });
}

function isHttpUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

// Reads the form into the API payload (camelCase) and collects field errors.
function readItemForm() {
  const errors = [];
  const fail = (node, message) => errors.push({ node, message });
  const text = suffix => itemEl(suffix).value.trim();
  const id = suffix => (text(suffix) === '' ? null : Number(text(suffix)));   // a lookup's hidden id

  const payload = {
    itemName: text('name'),
    uomId: id('uom-id'),
    categoryId: id('category-id'),
    subCategoryId: id('subcategory-id'),
    brandId: id('brand-id'),
    comments: text('comments'),
    sourcing: [],
    warehouseId: id('warehouse-id'),
    rackId: id('rack-id'),
    status: text('status'),
    docLink: text('doc-link'),
    imageLink: text('image-link'),
    supplierUrl: text('supplier-url'),
  };
  if (payload.itemName === '') fail(itemEl('name'), 'Item designation is required.');

  for (const row of itemEl('source-body').rows) {
    const cell = field => row.querySelector(`[data-field="${field}"]`);
    const line = Object.fromEntries(['brandId', 'supplierId', 'cost', 'openingStock', 'sellingPrice', 'batchExpiry']
      .map(field => [field, cell(field).value.trim()]));
    if (Object.values(line).every(v => v === '')) continue;     // blank rows are ignored
    for (const field of ['cost', 'openingStock', 'sellingPrice']) {
      if (line[field] !== '' && !DECIMAL_3.test(line[field])) fail(cell(field), 'Enter a number with up to 3 decimals.');
    }
    for (const field of ['brandId', 'supplierId']) line[field] = line[field] === '' ? null : Number(line[field]);
    payload.sourcing.push(line);
  }

  for (const [suffix, label] of [['doc-link', 'PDF spec link'], ['image-link', 'CAD / image URL'], ['supplier-url', 'Supplier URL']]) {
    if (text(suffix) !== '' && !isHttpUrl(text(suffix))) fail(itemEl(suffix), `${label} must start with http:// or https://`);
  }
  return { payload, errors };
}

const ITEM_FIELD_NODES = {
  itemName: 'name', uomId: 'uom', categoryId: 'category', subCategoryId: 'subcategory', brandId: 'brand',
  warehouseId: 'warehouse', rackId: 'rack', status: 'status', comments: 'comments', imageLink: 'image-link', supplierUrl: 'supplier-url',
};
let itemSaving = false;

async function saveItem() {
  if (itemSaving) return;
  clearFormErrors(itemEl('form'));
  const { payload, errors } = readItemForm();
  if (errors.length) {
    showFormErrors(errors);
    return;
  }
  itemSaving = true;
  itemEl('save').disabled = true;
  try {
    const item = await apiRequest('api/items.php', { method: 'POST', json: payload });
    forgetLookups('item');
    showToast('Item saved', `${item.code} · ${item.name}`);
    resetItemForm();
    itemEl('name').focus();
  } catch (error) {
    showServerErrors(error, key => (ITEM_FIELD_NODES[key] ? itemEl(ITEM_FIELD_NODES[key]) : null));
  } finally {
    itemSaving = false;
    itemEl('save').disabled = false;
  }
}

// Keys for the item page. Returns true when handled.
function handleItemPageKeys(event) {
  const target = event.target;
  const key = event.key;
  const ctrl = event.ctrlKey && !event.metaKey;

  if (key === 'Escape' && !ctrl && !event.altKey) {
    event.preventDefault();
    if (event.repeat) return true;
    leavePageToMenu();
    return true;
  }
  if (ctrl && !event.altKey && !event.shiftKey && key.toLowerCase() === 's') {
    event.preventDefault();
    if (event.repeat) return true;
    saveItem();
    return true;
  }
  // Shift+X adds a row, except where X is something you'd type (text fields).
  const typingText = target.tagName === 'INPUT' && target.type === 'text' && !target.inputMode;
  if ((event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && key.toLowerCase() === 'x' && !typingText)
      || (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyA')) {
    event.preventDefault();
    addSourceRow();
    return true;
  }
  if (key === 'Enter' && !ctrl && !event.altKey && !event.shiftKey
      && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
    event.preventDefault();
    if (target.type === 'date' && target.closest('.fp-source-row')) { addSourceRow(); return true; }
    const order = formEnterOrder(itemEl('form'), itemEl('save'));
    const next = order[order.indexOf(target) + 1];
    if (next) focusField(next); else saveItem();
    return true;
  }
  return false;
}

// Arrow keys inside a form table: ↑/↓ same column in the row above/below (↓ on a filled
// last row calls addRow); ←/→ move cells once the caret is at the edge. Past the table's
// edges (or ↓ on a blank last row) the arrow leaves the table.
function handleTableArrows(event, addRow) {
  const input = event.target;
  const row = input.closest('.fp-row');
  if (!row || !['INPUT', 'SELECT'].includes(input.tagName) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const rows = [...row.parentElement.rows].filter(other => other.matches('.fp-row'));
  const columnCells = r => [...r.querySelectorAll('input:not([readonly]):not([type="hidden"]), select')];
  const col = columnCells(row).indexOf(input);
  const cells = columnCells(row).filter(cell => !cell.disabled);
  const cellAt = r => {
    const cell = columnCells(r)[col];
    return cell && !cell.disabled ? cell : columnCells(r).find(other => !other.disabled);
  };
  const index = rows.indexOf(row);
  const isLastRow = index === rows.length - 1;
  // Dropdowns always hold a value, so only typed cells count as filling the row.
  const isFilled = cells.some(cell => cell.tagName === 'INPUT' && isCellFilled(cell));

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (index > 0) focusField(cellAt(rows[index - 1])); else moveFocusByArrow(event.key);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!isLastRow) focusField(cellAt(rows[index + 1]));
    else if (isFilled && addRow) focusField(cellAt(addRow()));
    else moveFocusByArrow(event.key);
  } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && caretAtEdge(input, event.key)) {
    event.preventDefault();
    const neighbour = cells[cells.indexOf(input) + (event.key === 'ArrowLeft' ? -1 : 1)];
    if (neighbour) focusField(neighbour); else moveFocusByArrow(event.key);
  }
}

function initItemPage() {
  itemEl('add-row').addEventListener('click', () => addSourceRow());
  itemEl('save').addEventListener('click', saveItem);
  itemEl('back').addEventListener('click', () => { location.hash = '#/home'; });
  itemEl('form').addEventListener('submit', event => event.preventDefault());
  itemEl('form').addEventListener('input', event => {
    if (event.target.classList.contains('is-invalid')) clearFieldError(event.target);
  });
  const body = itemEl('source-body');
  body.addEventListener('click', event => {
    const del = event.target.closest('[data-action="delete-row"]');
    if (del) removeSourceRow(del.closest('tr'));
  });
  body.addEventListener('keydown', event => handleTableArrows(event, () => addSourceRow({ focus: false })));
}

/* =====================================================================
   Form page engine (UOM, Party, Brand, Category, Warehouse)
   Each page is <section id="KEY-page"> holding #KEY-form, #KEY-undo,
   #KEY-back and #KEY-save. Enter moves to the next field (Shift+Enter:
   new line; textareas with data-enter-newline take Enter themselves, and
   dropdowns with data-enter-opens open on it),
   Ctrl+S saves, Ctrl+Z undoes the last edit (including added and removed
   rows), Shift+X or Alt+A adds a row, Esc returns to the popup that
   opened the page.
   ===================================================================== */

const FORM_KEY_HANDLERS = { item: handleItemPageKeys };
const FORM_PAGES = {};
const FORM_EDIT_GROUP_MS = 800;               // quick typing in one field undoes as one step
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHOLE_NUMBER = /^\d{1,12}$/;
const DECIMAL_2 = /^\d{1,3}(\.\d{1,2})?$/;

// config: key, route, noun, api, code(), firstField, read() → { payload, errors },
// optional lists { name: { body, template, initial, label(i), defaults() } }, extra { read, write, reset },
// onEnter(event), refresh(), onReset(), afterRestore(), reveal(node), addRowList(), init().
function createFormPage(config) {
  const el = suffix => byId(`${config.key}-${suffix}`);
  const lists = config.lists || {};
  let history = [];                           // states before each edit, newest last
  let current = null;
  let lastEdit = { key: null, time: 0 };

  const fields = () => [...el('form').querySelectorAll('input, select, textarea')].filter(node =>
    node.id && !node.readOnly && node.type !== 'file' && !node.dataset.transient);
  const rowsOf = name => [...byId(lists[name].body).rows];
  const readRow = row => Object.fromEntries([...row.querySelectorAll('[data-field]')].map(cell => [cell.dataset.field, cell.value]));
  const snapshot = () => ({
    fields: Object.fromEntries(fields().map(node => [node.id, node.value])),
    rows: Object.fromEntries(Object.keys(lists).map(name => [name, rowsOf(name).map(readRow)])),
    extra: config.extra ? config.extra.read() : null,
  });
  const syncUndoButton = () => { el('undo').disabled = history.length === 0; };

  function refresh() {
    for (const [name, list] of Object.entries(lists)) {
      if (!list.label) continue;
      rowsOf(name).forEach((row, index) => { row.querySelector('[data-row-label]').textContent = list.label(index); });
    }
    config.refresh?.();
  }

  // Call after a change. key groups quick edits into one undo step; null is always its own step.
  function record(key = null) {
    const now = Date.now();
    if (key === null || key !== lastEdit.key || now - lastEdit.time > FORM_EDIT_GROUP_MS) history.push(current);
    lastEdit = { key, time: now };
    current = snapshot();
    syncUndoButton();
    refresh();
  }

  // Take in a change that should not be its own undo step (e.g. formatting a number on blur).
  function absorb() {
    current = snapshot();
  }

  function appendRow(name, values = {}) {
    const row = byId(lists[name].template).content.firstElementChild.cloneNode(true);
    const defaults = lists[name].defaults?.() || {};
    for (const cell of row.querySelectorAll('[data-field]')) {
      if (defaults[cell.dataset.field] !== undefined) cell.defaultValue = defaults[cell.dataset.field];
      if (values[cell.dataset.field] !== undefined) cell.value = values[cell.dataset.field];
    }
    byId(lists[name].body).append(row);
    return row;
  }

  function addRow(name, values) {
    const row = appendRow(name, values);
    record();
    return row;
  }

  function addRowAndFocus(name) {
    addRow(name).querySelector('input').focus();
  }

  function deleteRow(row) {
    const siblings = [...row.parentElement.rows];
    if (siblings.length <= 1) {
      showToast('Action denied', 'At least one row is required.', true);
      return;
    }
    const neighbour = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    record();
    neighbour.querySelector('input').focus();
  }

  function restore(state) {
    for (const node of fields()) node.value = state.fields[node.id];
    for (const name of Object.keys(lists)) {
      byId(lists[name].body).replaceChildren();
      for (const values of state.rows[name]) appendRow(name, values);
    }
    config.extra?.write(state.extra);
    current = state;
    lastEdit = { key: null, time: 0 };        // the next edit is a new undo step
    clearFormErrors(el('form'));
    syncUndoButton();
    config.afterRestore?.();
    refresh();
  }

  function undo() {
    const previous = history.pop();
    if (!previous) return;
    const changed = fields().filter(node => node.value !== previous.fields[node.id]).pop();
    const changedList = Object.keys(lists).find(name => JSON.stringify(current.rows[name]) !== JSON.stringify(previous.rows[name]));
    restore(previous);
    let target = changed;
    if (!target && changedList) target = rowsOf(changedList).at(-1)?.querySelector('input');
    target = target || config.extraFocus?.() || config.firstField();
    config.reveal?.(target);
    if (target.getClientRects().length === 0) target = config.firstField();
    focusField(target);
  }

  function reset() {
    el('form').reset();
    clearLookupIds(el('form'));
    clearFormErrors(el('form'));
    config.setCode?.();
    for (const [name, list] of Object.entries(lists)) {
      byId(list.body).replaceChildren();
      for (let i = 0; i < (list.initial ?? 1); i += 1) appendRow(name);
    }
    config.extra?.reset();
    config.onReset?.();
    history = [];
    lastEdit = { key: null, time: 0 };
    current = snapshot();
    syncUndoButton();
    refresh();
  }

  let saving = false;
  async function save() {
    if (saving) return;
    clearFormErrors(el('form'));
    const { payload, errors } = config.read();
    if (errors.length) {
      showFormErrors(errors, config.reveal);
      return;
    }
    saving = true;
    el('save').disabled = true;
    try {
      const api = typeof config.api === 'function' ? config.api() : config.api;
      const record = await apiRequest(api, { method: 'POST', json: payload });
      const warning = await config.afterSave?.(record);   // e.g. upload the party's documents; a message if that failed
      forgetLookups(...(config.lookups || []));
      if (warning) showToast(`${record.code} saved, but its documents were not uploaded`, warning, true);
      else showToast(`${typeof config.noun === 'function' ? config.noun() : config.noun} saved`, `${record.code} · ${record.name}`);
      reset();
      config.firstField().focus();
    } catch (error) {
      showServerErrors(error, key => config.fieldNodes?.[key]?.(), config.reveal);
    } finally {
      saving = false;
      el('save').disabled = false;
    }
  }

  function handleKeys(event) {
    const { target, key } = event;
    const ctrl = event.ctrlKey && !event.metaKey;
    const plainCtrl = ctrl && !event.altKey && !event.shiftKey;
    if (key === 'Escape' && !ctrl && !event.altKey) {
      event.preventDefault();
      if (!event.repeat) leavePageToMenu();
      return true;
    }
    if (plainCtrl && key.toLowerCase() === 's') {
      event.preventDefault();
      if (!event.repeat) save();
      return true;
    }
    if (plainCtrl && key.toLowerCase() === 'z') {
      event.preventDefault();                 // the form's undo replaces the browser's per-field one
      undo();
      return true;
    }
    const list = config.addRowList?.();
    if (list) {
      // Shift+X adds a row, except where X is something you'd type (text fields).
      const typingText = isTextEntry(target) && !target.inputMode && target.type !== 'date';
      const shiftX = event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && key.toLowerCase() === 'x' && !typingText;
      if (shiftX || (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyA')) {
        event.preventDefault();
        addRowAndFocus(list);
        return true;
      }
    }
    if (key === 'Enter' && !ctrl && !event.altKey && !event.shiftKey && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
      if (target.dataset.enterNewline) return false;
      event.preventDefault();
      if (target.dataset.enterOpens) {        // a dropdown that opens on Enter instead of moving on
        try { target.showPicker(); } catch { /* unsupported: Space still works */ }
        return true;
      }
      if (config.onEnter?.(event)) return true;
      const order = formEnterOrder(el('form'), el('save'));
      focusField(order[order.indexOf(target) + 1] || el('save'));
      return true;
    }
    return config.onKey?.(event) || false;
  }

  function init() {
    el('save').addEventListener('click', save);
    el('undo').addEventListener('click', undo);
    el('back').addEventListener('click', () => { location.hash = '#/home'; });
    el('form').addEventListener('submit', event => event.preventDefault());
    el('form').addEventListener('input', event => {
      if (event.target.type === 'file') return;
      if (event.target.classList.contains('is-invalid')) clearFieldError(event.target);
      if (event.target.dataset.transient) return;
      const row = event.target.closest('.fp-row');
      record(row ? `${[...row.parentElement.rows].indexOf(row)}:${event.target.dataset.field}:${row.parentElement.id}` : event.target.id);
    });
    el('form').addEventListener('click', event => {
      const add = event.target.closest('[data-add-row]');
      if (add) { addRowAndFocus(add.dataset.addRow); return; }
      const del = event.target.closest('[data-action="delete-row"]');
      if (del) deleteRow(del.closest('tr'));
    });
    for (const [name, list] of Object.entries(lists)) {
      byId(list.body).addEventListener('keydown', event => handleTableArrows(event, () => addRow(name)));
    }
    config.init?.();
  }

  const page = { reset, init, record, absorb, addRow, rowsOf, appendRow, readRow, el };
  FORM_KEY_HANDLERS[config.key] = handleKeys;
  FORM_PAGES[config.route] = { page: config.key, reset, firstField: config.firstField };
  return page;
}

// Collects field errors for a form's read().
function formChecks(el) {
  const errors = [];
  const text = suffix => el(suffix).value.trim();
  const fail = (node, message) => errors.push({ node, message });
  return {
    errors, text, fail,
    required(suffix, label) { if (text(suffix) === '') fail(el(suffix), `${label} is required.`); },
    matches(suffix, pattern, message) { if (text(suffix) !== '' && !pattern.test(text(suffix))) fail(el(suffix), message); },
    rowCell(row, field, pattern, message) {
      const cell = row.querySelector(`[data-field="${field}"]`);
      if (cell.value.trim() !== '' && !pattern.test(cell.value.trim())) fail(cell, message);
    },
  };
}

const isBlankRow = row => ![...row.querySelectorAll('input')].some(isCellFilled);
const previewCode = prefix => `${prefix}-${today.getFullYear()}-0001`;   // order-number placeholders only

/* ---------- UOM Creation  (#/masters/uom/new) ---------- */

const UOM_FACTOR = /^\d{1,9}(\.\d{1,4})?$/;   // conversion factor: up to 4 decimals
const UOM_MAX_DECIMALS = 6;
const uomEl = suffix => byId(`uom-${suffix}`);
const isValidUomFactor = value => UOM_FACTOR.test(value) && Number(value) > 0;

const uomForm = createFormPage({
  key: 'uom', route: 'masters/uom/new', noun: 'UOM', api: 'api/uoms.php', lookups: ['uom'],
  firstField: () => uomEl('name'),
  setCode: () => showNextCode(uomEl('code'), 'api/uoms.php'),
  fieldNodes: {
    unitName: () => uomEl('name'), decimalAllowed: () => uomEl('decimals'), status: () => uomEl('status'),
    conversionBaseId: () => uomEl('base'), conversionFactor: () => uomEl('factor'), description: () => uomEl('description'),
  },
  read() {
    const check = formChecks(uomEl);
    check.required('name', 'Unit of measure');
    if (!/^\d+$/.test(check.text('decimals')) || Number(check.text('decimals')) > UOM_MAX_DECIMALS) {
      check.fail(uomEl('decimals'), `Decimal allowed must be a whole number from 0 to ${UOM_MAX_DECIMALS}.`);
    }
    if (!isValidUomFactor(check.text('factor'))) check.fail(uomEl('factor'), 'Conversion factor must be above 0, with up to 4 decimals.');
    return {
      errors: check.errors,
      payload: {
        unitName: check.text('name'), decimalAllowed: Number(check.text('decimals')), status: check.text('status'),
        // No base unit: this unit is a base unit itself.
        conversionBaseId: check.text('base-id') === '' ? null : Number(check.text('base-id')),
        conversionFactor: Number(check.text('factor')), description: check.text('description'),
      },
    };
  },
  init() {
    // Show the factor in its full format once the user leaves the field. Not an undo step.
    uomEl('factor').addEventListener('blur', () => {
      const factor = uomEl('factor');
      if (!isValidUomFactor(factor.value.trim())) return;
      factor.value = Number(factor.value).toFixed(4);
      uomForm.absorb();
    });
  },
});

/* ---------- Brand Creation  (#/masters/brand/new) ---------- */

const brandEl = suffix => byId(`brand-${suffix}`);
// item_brands: the items sold under this brand.
const brandItems = createLookupChips({ container: 'brand-items', entry: 'brand-item-entry', onChange: () => brandForm.record() });
const brandForm = createFormPage({
  key: 'brand', route: 'masters/brand/new', noun: 'Brand', api: 'api/brands.php', lookups: ['brand'],
  firstField: () => brandEl('name'),
  setCode: () => showNextCode(brandEl('code'), 'api/brands.php'),
  fieldNodes: { brandName: () => brandEl('name'), status: () => brandEl('status'), itemIds: () => brandItems.input },
  extra: { read: brandItems.get, write: brandItems.set, reset: () => brandItems.set([]) },
  extraFocus: () => brandItems.input,
  read() {
    const check = formChecks(brandEl);
    check.required('name', 'Brand name');
    if (brandItems.ids().length === 0) check.fail(brandItems.input, 'Add at least one item.');
    return {
      errors: check.errors,
      payload: {
        brandName: check.text('name'), status: check.text('status'), description: check.text('description'),
        itemIds: brandItems.ids(),
      },
    };
  },
});

/* ---------- Category Creation  (#/masters/category/new) ---------- */

const categoryEl = suffix => byId(`category-${suffix}`);
const categoryForm = createFormPage({
  key: 'category', route: 'masters/category/new', noun: 'Category', api: 'api/categories.php', lookups: ['category', 'subcategory'],
  firstField: () => categoryEl('name'),
  setCode: () => showNextCode(categoryEl('code'), 'api/categories.php'),
  fieldNodes: {
    categoryName: () => categoryEl('name'), status: () => categoryEl('status'),
    subcategories: () => categoryForm.rowsOf('subcategories')[0]?.querySelector('input'),
  },
  lists: {
    subcategories: { body: 'category-subcategories', template: 'category-subcategory-row', initial: 1, label: index => String(index + 1).padStart(2, '0') },
  },
  addRowList: () => 'subcategories',
  read() {
    const check = formChecks(categoryEl);
    check.required('name', 'Category name');
    const rows = categoryForm.rowsOf('subcategories');
    const filled = rows.filter(row => !isBlankRow(row));
    if (filled.length === 0) check.fail(rows[0].querySelector('input'), 'Add at least one subcategory.');
    return {
      errors: check.errors,
      payload: {
        categoryName: check.text('name'), status: check.text('status'), description: check.text('description'),
        subcategories: filled.map(row => row.querySelector('input').value.trim()),
      },
    };
  },
});

/* ---------- Warehouse Creation  (#/masters/stock-point/new) ---------- */

const warehouseEl = suffix => byId(`warehouse-${suffix}`);
const warehouseItems = createLookupChips({ container: 'warehouse-chips', entry: 'warehouse-item-entry', onChange: () => warehouseForm.record() });

const warehouseForm = createFormPage({
  key: 'warehouse', route: 'masters/stock-point/new', noun: 'Warehouse', api: 'api/warehouses.php', lookups: ['warehouse', 'item'],
  firstField: () => warehouseEl('name'),
  setCode: () => showNextCode(warehouseEl('code'), 'api/warehouses.php'),
  fieldNodes: Object.fromEntries([
    ['warehouseName', 'name'], ['type', 'type'], ['address', 'address'], ['country', 'country'], ['city', 'city'],
    ['contactPerson', 'contact'], ['phone', 'phone'], ['email', 'email'], ['manager', 'manager'], ['capacity', 'capacity'],
    ['status', 'status'], ['remarks', 'remarks'], ['itemIds', 'item-entry'],
  ].map(([key, suffix]) => [key, () => warehouseEl(suffix)])),
  extra: { read: warehouseItems.get, write: warehouseItems.set, reset: () => warehouseItems.set([]) },
  extraFocus: () => warehouseItems.input,
  read() {
    const check = formChecks(warehouseEl);
    for (const [suffix, label] of [['name', 'Warehouse name'], ['address', 'Address'], ['city', 'City / municipality'], ['contact', 'Contact person'], ['phone', 'Phone / extension'], ['email', 'Email address'], ['manager', 'Assigned manager'], ['capacity', 'Total storage capacity']]) {
      check.required(suffix, label);
    }
    check.matches('email', EMAIL, 'Enter a valid email address.');
    check.required('country', 'Country');
    if (warehouseItems.ids().length === 0) check.fail(warehouseItems.input, 'Add at least one item.');
    check.matches('capacity', WHOLE_NUMBER, 'Total storage capacity must be a whole number.');
    return {
      errors: check.errors,
      payload: {
        warehouseName: check.text('name'), type: check.text('type'), address: check.text('address'), country: check.text('country'), city: check.text('city'),
        contactPerson: check.text('contact'), phone: check.text('phone'), email: check.text('email'), manager: check.text('manager'),
        itemIds: warehouseItems.ids(), capacity: Number(check.text('capacity')), status: check.text('status'), remarks: check.text('remarks'),
      },
    };
  },
});

/* ---------- Party Creation  (#/masters/party/new): Creditors (supplier) or Debtors (customer) ---------- */

const partyEl = suffix => byId(`party-${suffix}`);
let partyTab = 'general';
const partyVariant = () => (partyEl('under').value === 'debtors' ? 'cus' : 'sup');
const partyFiles = { agreements: [] };

function showPartyTab(tab) {
  partyTab = tab;
  for (const panel of partyEl('form').querySelectorAll('[data-tab-panel]')) panel.hidden = panel.dataset.tabPanel !== tab;
  for (const button of partyEl('form').querySelectorAll('[data-tab]')) button.setAttribute('aria-selected', String(button.dataset.tab === tab));
}

// Show what the Under choice selects: the matching General panel, labels and placeholders.
function syncPartyVariant() {
  const under = partyEl('under').value;
  for (const panel of partyEl('form').querySelectorAll('[data-under]')) panel.hidden = panel.dataset.under !== under;
  for (const label of partyEl('page').querySelectorAll('[data-creditors]')) label.textContent = label.dataset[under];
  partyEl('save-label').textContent = under === 'debtors' ? 'Save Customer Record' : 'Save Supplier Record';
}

function refreshPartyTotals() {
  const prefix = partyVariant() === 'cus' ? 'SO' : 'PO';
  let orders = 0, value = 0, items = 0;
  for (const row of partyForm.rowsOf('orders')) {
    const number = row.querySelector('[data-field="number"]');
    number.placeholder = previewCode(prefix);
    if (isBlankRow(row)) continue;
    orders += 1;
    const rowValue = row.querySelector('[data-field="value"]').value.trim();
    const rowItems = row.querySelector('[data-field="items"]').value.trim();
    if (DECIMAL_3.test(rowValue)) value += Number(rowValue);
    if (WHOLE_NUMBER.test(rowItems)) items += Number(rowItems);
  }
  partyEl('order-count').textContent = `${orders} order${orders === 1 ? '' : 's'}`;
  partyEl('order-value').textContent = formatAmount(value);
  partyEl('order-items').textContent = formatCount(items);

  let quoted = 0, rates = 0;
  for (const row of partyForm.rowsOf('quotations')) {
    if (isBlankRow(row)) continue;
    quoted += 1;
    const rate = row.querySelector('[data-field="rate"]').value.trim();
    if (DECIMAL_3.test(rate)) rates += Number(rate);
  }
  partyEl('quote-summary').textContent = `${quoted} item${quoted === 1 ? '' : 's'} · total of rates ${formatOmr(rates)}`;
}

// Splits one line on its delimiter; a field may be wrapped in double quotes.
function splitQuotationLine(line, delimiter) {
  const cells = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.trim() === '') { cell = ''; quoted = true; }
    else if (char === delimiter) { cells.push(cell.trim()); cell = ''; }
    else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

const QUOTE_COLUMNS = ['itemName', 'description', 'unit', 'rate', 'deliveryTime', 'warranty'];
const QUOTE_HEADERS = { item: 'itemName', itemname: 'itemName', name: 'itemName', description: 'description', desc: 'description', unit: 'unit', uom: 'unit', rate: 'rate', rateomr: 'rate', price: 'rate', deliverytime: 'deliveryTime', delivery: 'deliveryTime', warranty: 'warranty' };
const headerKey = text => QUOTE_HEADERS[String(text).toLowerCase().replace(/[^a-z]/g, '')];

// JSON (array of objects), or lines separated by tab, comma, pipe or semicolon. Without a header line,
// only lines with a numeric rate count, so sentences in a pasted email are not read as items.
function parseQuotationText(source) {
  const text = source.trim();
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      return (Array.isArray(parsed) ? parsed : [parsed]).map(entry => {
        const row = {};
        for (const [key, value] of Object.entries(entry)) {
          const column = headerKey(key);
          if (column) row[column] = String(value);
        }
        return row;
      }).filter(row => Object.keys(row).length > 0);
    } catch { /* not JSON: read it as lines */ }
  }
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const delimiter = ['\t', '|', ';', ','].find(mark => lines.some(line => line.includes(mark)));
  if (!delimiter) return [];
  let columns = QUOTE_COLUMNS;
  const first = splitQuotationLine(lines[0], delimiter);
  const hasHeader = first.filter(headerKey).length >= 2;
  if (hasHeader) columns = first.map(headerKey);
  const rows = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    if (!line.includes(delimiter)) continue;
    const cells = splitQuotationLine(line, delimiter);
    const row = {};
    columns.forEach((column, index) => { if (column && cells[index] !== undefined) row[column] = cells[index]; });
    if (hasHeader || /^\d+(\.\d+)?$/.test(row.rate || '')) rows.push(row);
  }
  return rows;
}

function addParsedQuotations(rows, sourceName) {
  if (rows.length === 0) {
    showToast('No items found', `Nothing could be read from ${sourceName}. See View Sample Formats.`, true);
    return false;
  }
  const existing = partyForm.rowsOf('quotations');
  for (const row of existing) if (isBlankRow(row)) row.remove();   // parsed rows take the place of blank ones
  for (const row of rows) partyForm.appendRow('quotations', row);
  partyForm.record();
  showToast('Quotation read', `${rows.length} item${rows.length === 1 ? '' : 's'} added from ${sourceName}. Check them before saving.`);
  return true;
}

async function readQuotationFile(file) {
  if (/\.pdf$/i.test(file.name)) {
    showToast('PDF not read yet', 'Reading PDF quotations needs the server. Use JSON, CSV or TXT for now.', true);
    return;
  }
  if (!/\.(json|csv|txt)$/i.test(file.name)) {
    showToast('File type not supported', 'Use a JSON, CSV, TXT or PDF quotation.', true);
    return;
  }
  addParsedQuotations(parseQuotationText(await file.text()), file.name);
}

function renderFileList(listId, files) {
  byId(listId).replaceChildren(...files.map((file, index) => {
    const item = el('li', 'fp-file');
    item.append(el('span', '', file.name));
    const remove = el('button', 'fp-del');
    remove.type = 'button';
    remove.textContent = '×';
    remove.dataset.file = String(index);
    remove.setAttribute('aria-label', `Remove ${file.name}`);
    item.append(remove);
    return item;
  }));
}

function enableFileDrop(zone, onFiles) {
  zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('is-dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
  zone.addEventListener('drop', event => {
    event.preventDefault();
    zone.classList.remove('is-dragover');
    onFiles([...event.dataTransfer.files]);
  });
}

// A button opening a file input, plus a list of the chosen files. They are kept in memory until the upload API exists.
function initFilePicker({ button, input, list, bucket, drop }) {
  const add = files => { partyFiles[bucket] = [...partyFiles[bucket], ...files]; renderFileList(list, partyFiles[bucket]); };
  byId(button).addEventListener('click', () => byId(input).click());
  byId(input).addEventListener('change', event => { add([...event.target.files]); event.target.value = ''; });
  byId(list).addEventListener('click', event => {
    const remove = event.target.closest('[data-file]');
    if (!remove) return;
    partyFiles[bucket] = partyFiles[bucket].filter((_, index) => index !== Number(remove.dataset.file));
    renderFileList(list, partyFiles[bucket]);
    byId(button).focus();
  });
  if (drop) enableFileDrop(byId(drop), add);
}

/* Document Upload tab. Files stay in memory until the upload API exists. */
const DOC_MAX_BYTES = 10 * 1024 * 1024;
const DOC_KINDS = { pdf: ['PDF', 'pdf'], jpg: ['JPG', 'image'], jpeg: ['JPG', 'image'], png: ['PNG', 'image'], doc: ['DOC', 'word'], docx: ['DOC', 'word'], xls: ['XLS', 'excel'], xlsx: ['XLS', 'excel'] };
const DOCS_WITHOUT_EXPIRY = ['VAT Certificate'];
const docFiles = new WeakMap();               // table row → { file, uploadedOn }
const docExtension = file => file.name.split('.').pop().toLowerCase();
const docRows = () => [...partyEl('doc-rows').querySelectorAll('.fp-row')];

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const readDocRow = row => ({
  ...docFiles.get(row),
  type: row.querySelector('[data-field="type"]').value,
  expiry: row.querySelector('[data-field="expiry"]').value,
});

function syncDocExpiry(row) {
  const expiry = row.querySelector('[data-field="expiry"]');
  expiry.disabled = DOCS_WITHOUT_EXPIRY.includes(row.querySelector('[data-field="type"]').value);
  if (expiry.disabled) expiry.value = '';
  // Date inputs hold YYYY-MM-DD, so plain text comparison orders them. A document expiring today is still valid.
  const expired = expiry.value !== '' && expiry.value < todayInputValue();
  expiry.classList.toggle('is-expired', expired);
  expiry.title = expired ? 'This document has expired' : '';
}

function createDocRow({ file, uploadedOn, type = '', expiry = '' }) {
  const row = byId('party-doc-row').content.firstElementChild.cloneNode(true);
  const [badge, kind] = DOC_KINDS[docExtension(file)];
  const badgeEl = row.querySelector('[data-doc-badge]');
  badgeEl.textContent = badge;
  badgeEl.dataset.kind = kind;
  row.querySelector('[data-doc-name]').textContent = file.name;
  row.querySelector('[data-doc-size]').textContent = formatFileSize(file.size);
  row.querySelector('[data-field="type"]').value = type;
  row.querySelector('[data-field="expiry"]').value = expiry;
  row.querySelector('[data-field="uploadedOn"]').value = formatDate(uploadedOn);
  docFiles.set(row, { file, uploadedOn });
  syncDocExpiry(row);
  return row;
}

function renderDocRows(documents) {
  const rows = documents.map(createDocRow);
  if (rows.length === 0) {
    const empty = el('tr');
    const cell = el('td', 'fp-table-empty', 'No documents uploaded yet.');
    cell.colSpan = 5;
    empty.append(cell);
    rows.push(empty);
  }
  partyEl('doc-rows').replaceChildren(...rows);
  updateDocCount();
}

function updateDocCount() {
  const count = docRows().length;
  partyEl('doc-count').textContent = `${count} file${count === 1 ? '' : 's'}`;
}

function addDocuments(files) {
  const current = docRows().map(readDocRow);
  const isDuplicate = file => current.some(({ file: other }) => other.name === file.name && other.size === file.size);
  const accepted = [];
  const rejected = [];
  for (const file of files) {
    if (!DOC_KINDS[docExtension(file)]) rejected.push(`${file.name} is not a supported file type.`);
    else if (file.size > DOC_MAX_BYTES) rejected.push(`${file.name} is larger than 10 MB.`);
    else if (!isDuplicate(file) && !accepted.some(other => other.name === file.name && other.size === file.size)) accepted.push(file);
  }
  if (accepted.length) {
    renderDocRows([...current, ...accepted.map(file => ({ file, uploadedOn: new Date() }))]);
    partyForm.record();
    docRows()[current.length].querySelector('select').focus();
  }
  if (rejected.length) {
    const more = rejected.length > 1 ? ` (and ${rejected.length - 1} more)` : '';
    showToast('Some files were not added', `${rejected[0]}${more}`, true);
  }
}

function removeDocument(row) {
  const rows = docRows();
  const neighbour = rows[rows.indexOf(row) + 1] || rows[rows.indexOf(row) - 1];
  const kept = rows.filter(other => other !== row);
  const focusIndex = neighbour ? kept.indexOf(neighbour) : -1;
  renderDocRows(kept.map(readDocRow));
  partyForm.record();
  if (focusIndex >= 0) docRows()[focusIndex].querySelector('select').focus();
  else partyEl('doc-btn').focus();
}

function previewDocument(row) {
  const url = URL.createObjectURL(docFiles.get(row).file);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);   // long enough for the new tab to load it
}

// supplier_brands: the brands this supplier sells.
const supplierBrands = createLookupChips({ container: 'party-sup-brands', entry: 'party-sup-brand-entry', onChange: () => partyForm.record() });

const partyForm = createFormPage({
  key: 'party', route: 'masters/party/new', noun: () => (partyVariant() === 'cus' ? 'Customer' : 'Supplier'), lookups: ['supplier'],
  // Creditors are suppliers, debtors are customers: each has its own table and endpoint.
  api: () => (partyVariant() === 'cus' ? 'api/customers.php' : 'api/suppliers.php'),
  async afterSave(record) {
    const variant = partyVariant();
    const files = [...docRows().map(row => docFiles.get(row).file), ...(variant === 'cus' ? partyFiles.agreements : [])];
    if (files.length === 0) return;
    const owner = variant === 'cus' ? 'customer' : 'supplier';
    const form = new FormData();
    form.append(`${owner}Id`, String(record.id));
    for (const file of files) form.append('files[]', file, file.name);
    try {
      await apiRequest(`api/${owner}-documents.php`, { method: 'POST', body: form });
      return null;
    } catch (error) {
      return error.message;                     // the record is saved; only the files failed
    }
  },
  fieldNodes: Object.fromEntries([
    ['supplierName', 'sup-name'], ['customerName', 'cus-name'], ['organizationName', 'cus-organization'],
    ['email', () => `${partyVariant()}-email`], ['country', () => `${partyVariant()}-country`], ['address', () => `${partyVariant()}-address`],
    ['taxRegNo', () => `${partyVariant()}-tax`], ['debitLimit', 'sup-credit-limit'], ['debitDays', 'sup-credit-days'],
    ['openingBalance', 'sup-opening'], ['paymentTerms', 'sup-terms'], ['currency', 'sup-currency'], ['brandIds', 'sup-brand-entry'],
    ['creditLimit', 'cus-credit-limit'], ['creditDays', 'cus-credit-days'], ['discountPercent', 'cus-discount'],
  ].map(([key, suffix]) => [key, () => partyEl(typeof suffix === 'function' ? suffix() : suffix)])),
  firstField: () => partyEl(`${partyVariant()}-name`),
  setCode() {
    showNextCode(partyEl('sup-code'), 'api/suppliers.php');
    showNextCode(partyEl('cus-code'), 'api/customers.php');
  },
  lists: {
    supplierContacts: { body: 'party-sup-contacts', template: 'party-contact-row', initial: 2, label: index => `Contact Person ${index + 1}` },
    customerContacts: { body: 'party-cus-contacts', template: 'party-contact-row', initial: 1, label: index => `Contact Person ${index + 1}` },
    quotations: { body: 'party-quote-rows', template: 'party-quote-row', initial: 1 },
    orders: { body: 'party-order-rows', template: 'party-order-row', initial: 1, defaults: () => ({ date: todayInputValue() }) },
  },
  addRowList() {
    if (partyTab === 'general') return partyVariant() === 'cus' ? 'customerContacts' : 'supplierContacts';
    return { quotations: 'quotations', purchases: 'orders' }[partyTab] || null;
  },
  refresh: refreshPartyTotals,
  extra: {
    read: () => ({ documents: docRows().map(readDocRow), brands: supplierBrands.get() }),
    write(state) { renderDocRows(state.documents); supplierBrands.set(state.brands); },
    reset() { renderDocRows([]); supplierBrands.set([]); },
  },
  extraFocus: () => partyEl('doc-btn'),
  onReset() {
    partyFiles.agreements = [];
    renderFileList('party-agreement-files', []);
    partyEl('email-panel').hidden = true;
    partyEl('samples').hidden = true;
    partyEl('email-text').value = '';
    syncPartyVariant();
    showPartyTab('general');
  },
  afterRestore: syncPartyVariant,
  reveal(node) {
    const panel = node.closest('[data-tab-panel]');
    if (panel) showPartyTab(panel.dataset.tabPanel);
  },
  read() {
    const variant = partyVariant();
    const check = formChecks(suffix => partyEl(`${variant}-${suffix}`));
    const contacts = partyForm.rowsOf(variant === 'cus' ? 'customerContacts' : 'supplierContacts');
    const NUMBER_3 = 'Enter a number with up to 3 decimals.';
    const VALID_EMAIL = 'Enter a valid email address.';
    const WHOLE = 'Enter a whole number.';
    check.required('name', 'Name');
    check.matches('email', EMAIL, VALID_EMAIL);
    // suppliers.debit_limit / opening_balance hold 2 decimals; customers.credit_limit holds 3.
    const MONEY_2 = /^\d{1,10}(\.\d{1,2})?$/;
    const NUMBER_2 = 'Enter a number with up to 2 decimals.';
    check.matches('credit-limit', variant === 'sup' ? MONEY_2 : DECIMAL_3, variant === 'sup' ? NUMBER_2 : NUMBER_3);
    check.matches('credit-days', WHOLE_NUMBER, WHOLE);
    if (variant === 'sup') check.matches('opening', MONEY_2, NUMBER_2);
    if (variant === 'cus' && (check.text('discount') !== '') && (!DECIMAL_2.test(check.text('discount')) || Number(check.text('discount')) > 100)) {
      check.fail(partyEl('cus-discount'), 'Discount must be from 0 to 100, with up to 2 decimals.');
    }
    for (const row of contacts) check.rowCell(row, 'email', EMAIL, VALID_EMAIL);
    for (const row of partyForm.rowsOf('quotations')) check.rowCell(row, 'rate', DECIMAL_3, NUMBER_3);
    for (const row of partyForm.rowsOf('orders')) {
      check.rowCell(row, 'value', DECIMAL_3, NUMBER_3);
      check.rowCell(row, 'items', WHOLE_NUMBER, WHOLE);
    }
    const generalFields = [...partyEl('form').querySelectorAll(`[data-under="${partyEl('under').value}"] input[id], [data-under="${partyEl('under').value}"] select, [data-under="${partyEl('under').value}"] textarea`)]
      .filter(node => node.type !== 'file' && !node.readOnly && !node.dataset.transient);
    const filledRows = rows => rows.filter(row => !isBlankRow(row)).map(partyForm.readRow);
    const d = Object.fromEntries(generalFields.map(node => [node.id.replace(`party-${variant}-`, ''), node.value.trim()]));
    const lines = (...values) => values.filter(Boolean).join('\n');
    // supplier_contacts / customer_contacts keep a name and one number per contact.
    const contactRows = filledRows(contacts).map(row => ({ name: row.name.trim(), number: row.mobile.trim() }));
    // Mapped onto the suppliers / customers columns of the data model.
    const payload = variant === 'sup' ? {
      supplierName: d.name, address: d.address, country: d.country, currency: d.currency, taxRegNo: d.tax, remarks: d.comments,
      ownerDetails: d.owner, phone: d.mobile, telephone: d.phone, email: d.email,
      debitLimit: d['credit-limit'], debitDays: d['credit-days'], paymentTerms: d.terms, openingBalance: d.opening,
      accountDetails: lines(d.bank && `Bank: ${d.bank}`, d.branch && `Branch: ${d.branch}`, d.iban && `Account / IBAN: ${d.iban}`, d.website && `Website: ${d.website}`),
      brandIds: supplierBrands.ids(), contacts: contactRows,
    } : {
      customerName: d.name, organizationName: d.organization, address: d.address, country: d.country, city: d.city, zipCode: d.zip,
      phone: d.mobile, telephone: d.phone, email: d.email, ownerDetails: d.owner,
      creditLimit: d['credit-limit'], creditDays: d['credit-days'], discountPercent: d.discount, salesman: d.salesman, taxRegNo: d.tax,
      accountDetails: lines(d.other1, d.other2, d.other3), comments: d.comments, contacts: contactRows,
    };
    return { errors: check.errors, payload };
  },
  init() {
    partyEl('under').addEventListener('change', syncPartyVariant);
    partyEl('form').addEventListener('click', event => {
      const tab = event.target.closest('[data-tab]');
      if (tab) showPartyTab(tab.dataset.tab);
    });
    partyEl('doc-btn').addEventListener('click', () => partyEl('doc-input').click());
    partyEl('doc-input').addEventListener('change', event => {
      const files = [...event.target.files];
      event.target.value = '';
      addDocuments(files);
    });
    enableFileDrop(partyEl('doc-drop'), addDocuments);
    partyEl('doc-rows').addEventListener('keydown', event => handleTableArrows(event, null));
    // Runs before the form's own input listener, so the undo step sees the cleared expiry date.
    partyEl('doc-rows').addEventListener('input', event => {
      const row = event.target.closest('.fp-row');
      if (row) syncDocExpiry(row);
    });
    partyEl('doc-rows').addEventListener('click', event => {
      const row = event.target.closest('.fp-row');
      if (!row) return;
      if (event.target.closest('[data-doc-remove]')) removeDocument(row);
      else if (event.target.closest('[data-doc-preview]')) previewDocument(row);
    });
    initFilePicker({ button: 'party-agreement-btn', input: 'party-agreement-input', list: 'party-agreement-files', bucket: 'agreements' });
    partyEl('quote-btn').addEventListener('click', () => partyEl('quote-input').click());
    partyEl('quote-input').addEventListener('change', event => {
      const [file] = event.target.files;
      event.target.value = '';
      if (file) readQuotationFile(file);
    });
    enableFileDrop(partyEl('quote-drop'), files => { if (files[0]) readQuotationFile(files[0]); });
    partyEl('samples-btn').addEventListener('click', () => { partyEl('samples').hidden = !partyEl('samples').hidden; });
    partyEl('email-open').addEventListener('click', () => {
      partyEl('email-panel').hidden = false;
      partyEl('email-text').focus();
    });
    partyEl('email-cancel').addEventListener('click', () => {
      partyEl('email-panel').hidden = true;
      partyEl('email-open').focus();
    });
    partyEl('email-parse').addEventListener('click', () => {
      if (!addParsedQuotations(parseQuotationText(partyEl('email-text').value), 'the pasted text')) return;
      partyEl('email-text').value = '';
      partyEl('email-panel').hidden = true;
      partyEl('email-open').focus();
    });
  },
});

const MASTER_FORMS = [uomForm, brandForm, categoryForm, warehouseForm, partyForm];

/* =====================================================================
   Hash router: #/home (dashboard) and the form pages in FORM_PAGES.
   Routes for screens not built yet fall back to the dashboard.
   ===================================================================== */

FORM_PAGES[ITEM_ROUTE] = { page: 'item', reset: resetItemForm, firstField: () => itemEl('name') };

let currentPage = 'dashboard';
let pageOriginView = null;                // quick-menu view the open page was launched from
let pendingMenuReturn = null;             // { view, focusSelector } to open once the dashboard is back

// Esc on a page: back to the dashboard with the popup that opened the page.
// After a reload or a pasted link there is no origin, so use the first view linking to this page.
function leavePageToMenu() {
  const href = `#/${location.hash.replace(/^#\/?/, '').replace(/\/+$/, '')}`;
  const selector = `a.qm-item[href="${CSS.escape(href)}"]`;
  const view = pageOriginView || byId('quick-menu').querySelector(selector)?.closest('.qm-view').dataset.view || 'main';
  pendingMenuReturn = { view, focusSelector: selector };
  location.hash = '#/home';
}

function showPage(page) {
  currentPage = page;
  document.body.dataset.page = page;
  byId('dashboard-view').hidden = page !== 'dashboard';
  for (const section of document.querySelectorAll('.form-page')) section.hidden = section.id !== `${page}-page`;
}

function renderRoute() {
  const route = location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  const formPage = FORM_PAGES[route];
  if (formPage) {
    if (currentPage !== formPage.page) {
      showPage(formPage.page);
      formPage.reset();
    }
    formPage.firstField().focus();
    return;
  }
  const wasElsewhere = currentPage !== 'dashboard';
  showPage('dashboard');
  if (route !== '' && route !== 'home') {
    history.replaceState(null, '', '#/home');
    showToast('Not built yet', `The screen for “${route}” is coming soon.`);
  }
  if (wasElsewhere) focusPageAnchor();    // first, so closing the popup returns focus here
  pageOriginView = null;
  if (pendingMenuReturn) {
    const { view, focusSelector } = pendingMenuReturn;
    pendingMenuReturn = null;
    openQuickMenu(view, focusSelector);
  }
}

/* =====================================================================
   Load + boot
   ===================================================================== */

let loadSeq = 0;
async function loadDashboard() {
  const seq = ++loadSeq;
  renderRange();
  renderChartMonths();
  const data = await fetchDashboard(state);
  if (seq !== loadSeq) return;            // a newer selection is already loading
  state.data = data;
  renderKpis(data.kpis);
  renderProfitLoss(data.profitLoss);
  renderChart(data.chart);
  renderReturns(data.returns);
  renderQuotations(data.quotations);
  renderActivities(data.activities);
}

document.addEventListener('DOMContentLoaded', () => {
  byId('footer-year').textContent = String(today.getFullYear());
  initKeyboardNavigation();
  initQuickMenu();
  initLookups();
  initItemPage();
  for (const form of MASTER_FORMS) form.init();
  loadDashboard();
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
});
