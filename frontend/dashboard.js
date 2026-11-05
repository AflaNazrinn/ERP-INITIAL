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
  if (isLookupField(field)) return true;   // picked values only: no caret to move
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
    // An open styled dropdown (.fp-select-list) keeps focus on its options and handles its own keys.
    // After Enter picks an option of a dropdown that Enter opened (data-enter-opens), move on like a lookup pick.
    const openSelect = event.target.closest?.('select');
    if (openSelect?.matches(':open')) {
      if (event.key === 'Enter' && openSelect.dataset.enterOpens !== undefined && openSelect.closest('form')) {
        setTimeout(() => { if (!openSelect.matches(':open')) focusNextField(openSelect); }, 0);
      }
      return;
    }

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
    .filter(node => node.dataset.enterSkip === undefined)
    .filter(node => node.getClientRects().length > 0);
  return [...fields, saveButton];
}

// The stop after node in an Enter order. A field Enter skips (data-enter-skip) is not in the order
// itself, so from there Enter goes to the first stop after it on the page.
function fieldAfter(order, node) {
  const index = order.indexOf(node);
  if (index !== -1) return order[index + 1];
  return order.find(other => other && node.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);
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

// Moving on with Enter (or a pick / Esc in a popup): a lookup field opens its "Select …" popup straight
// away, and a field with suggestions shows them. Tab, arrows and other focus moves only focus the field.
function enterField(node) {
  focusField(node);
  if (isLookupField(node)) openLookup(node, { byKeyboard: true });
  else if (node instanceof HTMLInputElement && node.list) {
    try { node.showPicker(); } catch { /* not supported here: typing still shows the suggestions */ }
  }
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
// Each carries its currency and calling code, which the forms fill in when the country is picked.
const COUNTRIES = [
  ['OM', 'Oman', 'OMR', '+968'], ['AE', 'United Arab Emirates', 'AED', '+971'], ['SA', 'Saudi Arabia', 'SAR', '+966'],
  ['QA', 'Qatar', 'QAR', '+974'], ['KW', 'Kuwait', 'KWD', '+965'], ['BH', 'Bahrain', 'BHD', '+973'], ['IN', 'India', 'INR', '+91'],
  ['PK', 'Pakistan', 'PKR', '+92'], ['EG', 'Egypt', 'EGP', '+20'], ['JO', 'Jordan', 'JOD', '+962'], ['TR', 'Türkiye', 'TRY', '+90'],
  ['CN', 'China', 'CNY', '+86'], ['JP', 'Japan', 'JPY', '+81'], ['KR', 'South Korea', 'KRW', '+82'], ['DE', 'Germany', 'EUR', '+49'],
  ['IT', 'Italy', 'EUR', '+39'], ['GB', 'United Kingdom', 'GBP', '+44'], ['US', 'United States', 'USD', '+1'],
].map(([code, name, currency, dial]) => ({ id: name, code, name, currency, dial }));
const countryNamed = name => COUNTRIES.find(country => country.name === name);

/* Phone fields: a calling-code dropdown (select[data-phone-code]) in front of the number. The code
   follows the country, Enter passes it by (data-enter-skip); ←, Tab or a click reach it to change it. */
function fillPhoneCodes(select) {
  select.replaceChildren(...COUNTRIES.map(country => {
    const option = el('option', '', country.dial);
    option.value = country.dial;
    option.dataset.country = country.name;           // shown beside the code in the open list
    return option;
  }));
}
// One stored value: "+968 9123 4455". A number typed with its own + code is kept as typed.
const joinPhone = (code, number) => {
  const digits = String(number ?? '').trim();
  if (!digits) return '';
  return digits.startsWith('+') ? digits : `${code} ${digits}`;
};
// "+91 94470 12345" → ['+91', '94470 12345']; a number without a known code keeps the fallback code.
function splitPhone(value, fallback) {
  const text = String(value ?? '').trim();
  const dial = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find(country => text.startsWith(`${country.dial} `) || text === country.dial)?.dial;
  return dial ? [dial, text.slice(dial.length).trim()] : [fallback, text];
}

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
  country: { title: 'Select Country', letter: 'C', list: 'Country List', plural: 'countries', rows: () => COUNTRIES,
    columns: [['code', 'Code'], ['name', 'Country Name'], ['currency', 'Currency']], display: row => row.name },
  // The master Edit pages pick from the master lists on this page (the rows those lists show).
  'master-category': { title: 'Select Category', letter: 'C', list: 'Category List', plural: 'categories',
    rows: () => masterLookupRows(categoryList), columns: [['code', 'Code'], ['name', 'Category Name']], display: row => row.name },
  'master-subcategory': { title: 'Select Sub-category', letter: 'S', list: 'Sub-category List', plural: 'sub-categories',
    rows: () => categoryList.rows.flatMap(category => category.subCategories.split(',').map(name => name.trim()).filter(Boolean)
      .map(name => ({ id: `${category.code}:${name}`, name, categoryName: category.name }))),
    // Only the chosen category's sub-categories, once a category is filled in on the page.
    filterFor: (rows, field) => {
      const category = field.form?.querySelector('[data-key="category"]')?.value;
      const own = rows.filter(row => row.categoryName === category);
      return own.length ? own : rows;
    },
    columns: [['name', 'Sub-category Name'], ['categoryName', 'Category']], plainFirst: true, display: row => row.name },
  'master-uom': { title: 'Select UOM', letter: 'U', list: 'UOM List', plural: 'units',
    rows: () => masterLookupRows(uomList), columns: [['code', 'Code'], ['name', 'UOM Name']], display: row => row.name },
  'master-brand': { title: 'Select Brand', letter: 'B', list: 'Brand List', plural: 'brands',
    rows: () => masterLookupRows(brandList), columns: [['code', 'Code'], ['name', 'Brand Name']], display: row => row.name },
  'master-stock-point': { title: 'Select Stock Point', letter: 'P', list: 'Stock Point List', plural: 'stock points',
    rows: () => masterLookupRows(stockPointList), columns: [['code', 'Code'], ['name', 'Stock Point Name'], ['type', 'Type']], display: row => row.name },
};

// A master list's rows as lookup rows (its code is the id).
const masterLookupRows = list => list.rows.map(row => ({ ...row, id: row.code }));

// Each list is fetched once per page load; forgetLookups() drops lists after a save changes them.
const lookupCache = {};
async function loadLookup(kind) {
  if (LOOKUPS[kind].rows) return LOOKUPS[kind].rows();
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

// Fields that pick into a list (chips) instead of holding one value: entry → { exclude, onPick, onClear }.
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

let lookupOpening = false;                // set while the rows load, so a second request is ignored
async function openLookup(field, { query = '', byKeyboard = false } = {}) {
  const dialog = byId('lookup');
  if (dialog.open || lookupOpening) return;
  const kind = field.dataset.lookup;
  const config = LOOKUPS[kind];
  lookupOpening = true;
  let rows;
  try { rows = await loadLookup(kind); } finally { lookupOpening = false; }
  if (dialog.open || !document.contains(field)) return;
  const parent = lookupParentField(field);
  const parentId = parent ? lookupIdInput(parent).value : '';
  if (parentId) rows = rows.filter(row => String(row[config.parentKey]) === parentId);
  if (config.filterFor) rows = config.filterFor(rows, field);
  const excluded = lookupChipFields.get(field)?.exclude() || [];
  rows = rows.filter(row => !excluded.includes(row.id));

  Object.assign(lookup, { field, kind, rows, byKeyboard });
  const currentId = lookupIdInput(field)?.value ?? field.value;
  // Fields without a hidden id (the master Edit pages) hold the shown name, so match on that.
  lookup.active = Math.max(0, rows.findIndex(row => String(row.id) === currentId
    || (!lookupIdInput(field) && config.display(row) === field.value)));
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

// advance: Esc and keyboard picks move on to the next field; Cancel and the backdrop stay on the field.
function closeLookup({ advance = false } = {}) {
  const dialog = byId('lookup');
  if (!dialog.open) return;
  dialog.close();
  if (!byId('quick-menu').open) document.documentElement.classList.remove('has-modal');
  if (!document.contains(lookup.field)) return;
  if (advance) focusNextField(lookup.field); else focusField(lookup.field);
}

// Picks the highlighted row. Enter (advance) and keyboard use move on to the next field.
async function pickLookupRow({ advance = false } = {}) {
  const row = lookup.shown[lookup.active];
  if (!row) return;
  const { field } = lookup;
  const moveOn = advance || lookup.byKeyboard;
  closeLookup();
  const chips = lookupChipFields.get(field);
  if (chips) { chips.onPick(row); if (moveOn) focusNextField(field); return; }
  const parent = lookupParentField(field);
  if (parent && !lookupIdInput(parent).value) {   // picked a child first: fill in its parent too
    const parentRows = await loadLookup(parent.dataset.lookup);
    const parentRow = parentRows.find(other => other.id === row[LOOKUPS[field.dataset.lookup].parentKey]);
    if (parentRow) setLookupValue(parent, parentRow, { silent: true });
  }
  setLookupValue(field, row);
  if (moveOn) focusNextField(field);
}

function focusNextField(field) {
  const form = field.closest('form');
  const order = formEnterOrder(form, form.querySelector('.fp-footer .fp-btn-primary'));
  const next = fieldAfter(order, field);
  if (next) enterField(next); else focusField(field);   // the last field: stay, without reopening its popup
}

// Keys on a lookup field. Returns true when handled.
function handleLookupFieldKeys(event) {
  const field = event.target;
  if (!isLookupField(field)) return false;
  const { key } = event;
  const chips = lookupChipFields.get(field);
  const open = query => { event.preventDefault(); if (!event.repeat) openLookup(field, { query, byKeyboard: true }); return true; };
  if (key === 'F4' || (event.altKey && key === 'ArrowDown')) return open('');
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (key === 'Backspace' || key === 'Delete') {
    event.preventDefault();
    if (chips) chips.onClear(); else if (field.value !== '') setLookupValue(field, null);
    return true;
  }
  // Enter always opens the popup, with the current value highlighted: Enter again keeps it and moves on, Esc moves on.
  if (key === 'Enter' && !event.shiftKey) return open('');
  if (key === ' ') return open('');
  // Shift+X stays the Add Row shortcut on forms with rows.
  if (key.length === 1 && !(event.shiftKey && key.toLowerCase() === 'x')) return open(key);
  return false;
}

// Keys while the popup is open; it takes every key, so nothing reaches the page behind it.
function handleLookupDialogKeys(event) {
  const { key, target } = event;
  const ctrl = event.ctrlKey || event.metaKey;
  if (key === 'Escape') { event.preventDefault(); if (!event.repeat) closeLookup({ advance: true }); return; }
  if (key === 'Tab' && !ctrl && !event.altKey) { event.preventDefault(); moveFocusByTab(event.shiftKey); return; }
  if (ctrl && ['s', 'd', 'z'].includes(key.toLowerCase())) { event.preventDefault(); return; }   // page shortcuts wait until it closes
  if (ctrl || event.altKey) return;
  // On the Cancel / Select buttons the arrows move between controls (↑ goes back to the search box).
  if (target !== byId('lookup-search')) {
    if (key.startsWith('Arrow')) { event.preventDefault(); moveFocusByArrow(key); }
    return;
  }
  const steps = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };
  if (steps[key]) { event.preventDefault(); moveLookupActive(steps[key]); return; }
  if (key === 'Enter') { event.preventDefault(); if (!event.repeat) pickLookupRow({ advance: true }); }
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
    const next = fieldAfter(order, target);
    if (next) enterField(next); else saveItem();
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
      if (defaults[cell.dataset.field] !== undefined) {
        if (cell.tagName === 'SELECT') cell.value = defaults[cell.dataset.field]; else cell.defaultValue = defaults[cell.dataset.field];
      }
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
      enterField(fieldAfter(order, target) || el('save'));
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

// The calling codes on one side of the form (Creditors or Debtors) follow that side's country.
function syncPartyPhoneCodes(under) {
  const dial = countryNamed(partyEl(under === 'debtors' ? 'cus-country' : 'sup-country').value)?.dial;
  if (!dial) return;
  for (const select of partyEl('form').querySelectorAll(`[data-under="${under}"] select[data-phone-code]`)) select.value = dial;
}
const partyDial = under => countryNamed(partyEl(under === 'debtors' ? 'cus-country' : 'sup-country').value)?.dial || '+968';

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
    supplierContacts: { body: 'party-sup-contacts', template: 'party-contact-row', initial: 2, label: index => `Contact Person ${index + 1}`,
      defaults: () => ({ mobileCode: partyDial('creditors') }) },
    customerContacts: { body: 'party-cus-contacts', template: 'party-contact-row', initial: 1, label: index => `Contact Person ${index + 1}`,
      defaults: () => ({ mobileCode: partyDial('debtors') }) },
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
    const contactRows = filledRows(contacts).map(row => ({ name: row.name.trim(), number: joinPhone(row.mobileCode, row.mobile) }));
    // Mapped onto the suppliers / customers columns of the data model.
    const payload = variant === 'sup' ? {
      supplierName: d.name, address: d.address, country: d.country, currency: d.currency, taxRegNo: d.tax, remarks: d.comments,
      ownerDetails: d.owner, phone: joinPhone(d['mobile-code'], d.mobile), telephone: joinPhone(d['phone-code'], d.phone), email: d.email,
      debitLimit: d['credit-limit'], debitDays: d['credit-days'], paymentTerms: d.terms, openingBalance: d.opening,
      accountDetails: lines(d.bank && `Bank: ${d.bank}`, d.branch && `Branch: ${d.branch}`, d.iban && `Account / IBAN: ${d.iban}`, d.website && `Website: ${d.website}`),
      brandIds: supplierBrands.ids(), contacts: contactRows,
    } : {
      customerName: d.name, organizationName: d.organization, address: d.address, country: d.country, city: d.city, zipCode: d.zip,
      phone: joinPhone(d['mobile-code'], d.mobile), telephone: joinPhone(d['phone-code'], d.phone), email: d.email, ownerDetails: d.owner,
      creditLimit: d['credit-limit'], creditDays: d['credit-days'], discountPercent: d.discount, salesman: d.salesman, taxRegNo: d.tax,
      accountDetails: lines(d.other1, d.other2, d.other3), comments: d.comments, contacts: contactRows,
    };
    return { errors: check.errors, payload };
  },
  init() {
    partyEl('under').addEventListener('change', syncPartyVariant);
    // Picking the supplier's country sets its currency. This runs before the form records the edit,
    // so Ctrl+Z undoes both together.
    partyEl('sup-country').addEventListener('input', () => {
      const country = countryNamed(partyEl('sup-country').value);
      if (country) partyEl('sup-currency').value = country.currency;
      syncPartyPhoneCodes('creditors');
    });
    partyEl('cus-country').addEventListener('input', () => syncPartyPhoneCodes('debtors'));
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

/* ---------- Master list pages  (#/masters/supplier, customer, item, uom, brand, category, stock-point) ----------
   One builder for every "<Noun> Master" list: table, search, Filter popup, Import popup, CSV export.
   Each page declares its columns; rows are dummy data held in memory until the pages read the API.
   View, Edit and Delete are not built yet: they show a "coming soon" toast. */

const ML_ICONS = {
  view: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>',
  delete: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"></path></svg>',
};
const sameText = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const normalHeader = text => String(text).toLowerCase().replace(/[^a-z]/g, '');

// Column cell styles: code (amber mono), name (bold capitals), pill, status (green when active), upper, mono, wrap (long text), text.
const ML_CELL_CLASS = { code: 'ml-code', name: 'ml-name', upper: 'ml-email', mono: 'ml-mono', wrap: 'ml-wrap' };

// A column's value as shown in the table and the View popup ("—" when empty).
function masterValue(column, value) {
  const text = String(value ?? '');
  if (!text) return document.createTextNode('—');
  if (column.type === 'pill') return el('span', 'ml-pill', text);
  if (column.type === 'status') return el('span', `ml-status${/^active/i.test(text) ? '' : ' ml-status-off'}`, text);
  return document.createTextNode(text);
}

function masterCell(column, value) {
  const td = el('td', ML_CELL_CLASS[column.type] || '');
  td.append(masterValue(column, value));
  return td;
}

// config: key ('item' → #item-list-page), route, newRoute, noun, nouns (plural), codePrefix + codeDigits
// (auto-numbering), columns [{ key, label, type, headers (spreadsheet aliases), read(value) → value or throws,
// inTable: false for detail columns shown only in View, Edit, import and export }],
// sample (template row values by key), rows (newest first; every row has code and name).
function createMasterList(config) {
  const page = `${config.key}-list`;
  const $ = suffix => byId(`${page}-${suffix}`);
  const tableColumns = config.columns.filter(column => column.inTable !== false);
  const caps = config.noun === config.noun.toUpperCase();          // UOM stays UOM in sentences
  const list = {
    config, rows: config.rows, applied: new Set(), $, render,
    one: caps ? config.noun : config.noun.toLowerCase(),
    many: caps ? config.nouns : config.nouns.toLowerCase(),
  };
  list.count = count => `${count} ${count === 1 ? list.one : list.many}`;

  function render() {
    const query = $('search').value.trim().toLowerCase();
    const { applied, rows: all } = list;
    const rows = all.filter(row => (applied.size === 0 || applied.has(row.code))
      && (!query || config.columns.some(column => String(row[column.key] ?? '').toLowerCase().includes(query))));
    $('body').replaceChildren(...rows.map(row => {
      const tr = el('tr');
      tr.dataset.code = row.code;
      const actions = el('td', 'ml-col-actions');
      const group = el('div', 'ml-actions');
      for (const [action, label] of [['view', 'View'], ['edit', 'Edit'], ['delete', 'Delete']]) {
        const button = el('button', `ml-act${action === 'delete' ? ' ml-act-danger' : ''}`);
        button.type = 'button';
        button.dataset.action = action;
        button.setAttribute('aria-label', `${label} ${row.name}`);
        button.innerHTML = ML_ICONS[action];
        button.append(el('span', '', label));
        group.append(button);
      }
      actions.append(group);
      tr.append(...tableColumns.map(column => masterCell(column, row[column.key])), actions);
      return tr;
    }));
    $('empty').hidden = rows.length > 0;
    const filtered = rows.length < all.length ? ` (filtered from ${all.length})` : '';
    $('count').textContent = rows.length
      ? `Showing 1 to ${rows.length} of ${rows.length} entries${filtered}` : `Showing 0 of ${all.length} entries`;
    $('filter-label').textContent = applied.size ? `Filter (${applied.size})` : 'Filter';
    $('filter').classList.toggle('is-on', applied.size > 0);
  }

  // "/" search, F filter, I import, Shift+N new record, Esc back to the Masters popup (Esc in a filled search clears it first).
  function handleKeys(event) {
    if (byId('master-filter').open) return handleMasterFilterKeys(event);
    if (byId('master-import').open) return handleMasterImportKeys(event);
    if (byId('master-view').open) return handleMasterViewKeys(event);
    if (byId('master-confirm').open) return handleMasterConfirmKeys(event);
    if (event.ctrlKey || event.altKey || event.metaKey) return false;
    const search = $('search');
    if (event.key === 'Escape') {
      event.preventDefault();
      if (event.repeat) return true;
      if (event.target === search && search.value) {
        search.value = '';
        render();
      } else {
        leavePageToMenu();
      }
      return true;
    }
    if (isTextEntry(event.target)) return false;
    const letter = event.key.toLowerCase();
    if (event.key === '/') {
      event.preventDefault();
      search.focus();
    } else if (letter === 'f' && !event.shiftKey) {
      event.preventDefault();
      if (!event.repeat) openMasterFilter(list);
    } else if (letter === 'i' && !event.shiftKey) {
      event.preventDefault();
      if (!event.repeat) openMasterImport(list);
    } else if (event.key === 'N' && event.shiftKey) {
      event.preventDefault();
      location.hash = config.newRoute;
    } else {
      return false;
    }
    return true;
  }

  list.init = () => {
    $('head').replaceChildren(...tableColumns.map(column => el('th', '', column.label)), el('th', 'ml-col-actions', 'Actions'));
    $('search').addEventListener('input', render);
    $('back').addEventListener('click', leavePageToMenu);
    $('filter').addEventListener('click', () => openMasterFilter(list));
    $('import').addEventListener('click', () => openMasterImport(list));
    $('body').addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      const row = button && list.rows.find(entry => entry.code === button.closest('tr').dataset.code);
      if (!row) return;
      if (button.dataset.action === 'view') openMasterView(list, row);
      else if (button.dataset.action === 'edit') location.hash = masterEditHash(list, row);
      else deleteMasterRow(list, row);
    });
  };
  // After Save on the Edit page or a delete, focus lands back on that row (or the row now in its place).
  list.focusRow = code => {
    const tr = [...$('body').rows].find(entry => entry.dataset.code === code) || $('body').rows[0];
    (tr?.querySelector('[data-action="edit"]') || $('search')).focus();
  };

  FORM_KEY_HANDLERS[page] = handleKeys;
  FORM_PAGES[config.route] = {
    page,
    reset() {
      $('search').value = '';
      list.applied.clear();
      render();
    },
    firstField() {
      const code = list.returnTo;
      list.returnTo = null;
      const tr = code && [...$('body').rows].find(entry => entry.dataset.code === code);
      return tr?.querySelector('[data-action="edit"]') || $('body').querySelector('button') || $('search');
    },
  };
  return list;
}

/* ---------- Filter popup (#master-filter, shared by the list pages) ----------
   Ticks pick which records the list shows; none ticked shows them all.
   Keys: ↑/↓ move between the search box and the rows, Space ticks, Enter applies
   (Ctrl+Enter from anywhere), Esc closes without applying. */

const masterFilter = { list: null, picked: new Set(), opener: null };
const mfEl = suffix => byId(`master-filter-${suffix}`);
const mfVisibleRows = () => {
  const query = mfEl('search').value.trim().toLowerCase();
  return [...masterFilter.list.rows].sort((a, b) => a.code.localeCompare(b.code))
    .filter(row => !query || row.code.toLowerCase().includes(query) || row.name.toLowerCase().includes(query));
};

function renderMasterFilterList() {
  const rows = mfVisibleRows();
  mfEl('list').replaceChildren(...rows.map(row => {
    const label = el('label', 'sf-check sf-row');
    const box = el('input', 'sf-radio');
    box.type = 'checkbox';
    box.value = row.code;
    box.checked = masterFilter.picked.has(row.code);
    label.append(box, el('span', 'sf-code', row.code), el('span', 'sf-name', row.name));
    return label;
  }));
  mfEl('empty').hidden = rows.length > 0;
  syncMasterFilterCounts();
}

function syncMasterFilterCounts() {
  const { list, picked } = masterFilter;
  const total = list.rows.length;
  const all = mfEl('all');
  all.checked = picked.size === total;
  all.indeterminate = picked.size > 0 && picked.size < total;
  mfEl('badge').textContent = `${picked.size} of ${total} selected`;
  mfEl('summary').replaceChildren(`${picked.size} of ${total} ${list.many} selected `,
    el('span', 'sf-muted', `(${mfVisibleRows().length} visible)`));
}

function openMasterFilter(list) {
  Object.assign(masterFilter, { list, picked: new Set(list.applied), opener: document.activeElement });
  mfEl('title').textContent = `Filter ${list.config.nouns}`;
  mfEl('sub').textContent = `Search and select the ${list.many} to show`;
  mfEl('search').placeholder = `Filter by ${list.one} code or name...`;
  mfEl('search').setAttribute('aria-label', `Filter by ${list.one} code or name`);
  mfEl('list').setAttribute('aria-label', list.config.nouns);
  mfEl('search').value = '';
  renderMasterFilterList();
  document.documentElement.classList.add('has-modal');
  byId('master-filter').showModal();
  mfEl('search').focus();
}

function closeMasterFilter() {
  const dialog = byId('master-filter');
  if (!dialog.open) return;
  dialog.close();
  if (!byId('quick-menu').open) document.documentElement.classList.remove('has-modal');
  const back = masterFilter.opener;
  (back && document.contains(back) && back !== document.body ? back : masterFilter.list.$('filter')).focus();
}

function applyMasterFilter() {
  const { list } = masterFilter;
  list.applied = new Set(masterFilter.picked);
  list.render();
  closeMasterFilter();
  const count = list.applied.size;
  showToast('Filter applied', count ? `Showing ${list.count(count)}.` : `Showing all ${list.many}.`);
}

function resetMasterFilter() {
  masterFilter.picked.clear();
  masterFilter.list.applied.clear();
  mfEl('search').value = '';
  renderMasterFilterList();
  masterFilter.list.render();
  mfEl('search').focus();
}

// Saves rows (arrays of cells) as a CSV file Excel opens with the right characters (BOM first).
function downloadCsv(fileName, lines) {
  const cell = value => `"${String(value).replace(/"/g, '""')}"`;
  const blob = new Blob([`﻿${lines.map(line => line.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const link = el('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

const masterFileName = (list, suffix) => `${list.config.nouns.toLowerCase().replace(/\s+/g, '-')}-${suffix}.csv`;

// CSV of the ticked records, or of every record when none is ticked.
function exportMasterRows() {
  const { list, picked } = masterFilter;
  const { columns } = list.config;
  const rows = list.rows.filter(row => picked.size === 0 || picked.has(row.code));
  downloadCsv(masterFileName(list, today.toISOString().slice(0, 10)),
    [columns.map(column => column.label), ...rows.map(row => columns.map(column => row[column.key] ?? ''))]);
  showToast('Export ready', `${list.count(rows.length)} saved as CSV.`);
}

function handleMasterFilterKeys(event) {
  const { key, target } = event;
  const ctrl = event.ctrlKey || event.metaKey;
  if (key === 'Escape') { event.preventDefault(); if (!event.repeat) closeMasterFilter(); return true; }
  if (key === 'Enter' && (ctrl || target === mfEl('search') || target.classList.contains('sf-radio'))) {
    event.preventDefault();
    if (!event.repeat) applyMasterFilter();
    return true;
  }
  if (ctrl || event.altKey || (key !== 'ArrowDown' && key !== 'ArrowUp')) return false;
  // ↑/↓ walk search → Select All → each row → Apply Filters; other controls use the page's arrow navigation.
  const stops = [mfEl('search'), mfEl('all'), ...mfEl('list').querySelectorAll('input[type="checkbox"]'),
    byId('master-filter').querySelector('[data-sf="apply"]')];
  const index = stops.indexOf(target);
  if (index === -1 || (index === stops.length - 1 && key === 'ArrowDown')) return false;   // Apply is the bottom
  event.preventDefault();
  stops[Math.max(0, Math.min(stops.length - 1, index + (key === 'ArrowDown' ? 1 : -1)))].focus();
  return true;
}

function initMasterFilter() {
  const dialog = byId('master-filter');
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeMasterFilter(); });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) { closeMasterFilter(); return; }   // backdrop
    const action = event.target.closest('[data-sf]')?.dataset.sf;
    if (action === 'close') closeMasterFilter();
    else if (action === 'apply') applyMasterFilter();
    else if (action === 'reset') resetMasterFilter();
    else if (action === 'export') exportMasterRows();
    else if (action === 'visible' || action === 'none') {
      for (const row of action === 'visible' ? mfVisibleRows() : masterFilter.list.rows) {
        if (action === 'visible') masterFilter.picked.add(row.code); else masterFilter.picked.delete(row.code);
      }
      renderMasterFilterList();
    }
  });
  mfEl('search').addEventListener('input', renderMasterFilterList);
  mfEl('all').addEventListener('change', event => {
    masterFilter.picked = new Set(event.target.checked ? masterFilter.list.rows.map(row => row.code) : []);
    renderMasterFilterList();
  });
  mfEl('list').addEventListener('change', event => {
    const { value, checked } = event.target;
    if (checked) masterFilter.picked.add(value); else masterFilter.picked.delete(value);
    syncMasterFilterCounts();
  });
}

/* ---------- Spreadsheet reading (import) ----------
   Every reader returns rows as arrays of cell strings. No library: the CSP allows 'self' only.
   .xlsx is a zip of XML parts, unzipped with the browser's DecompressionStream. An ".xls"
   export is often an HTML table or plain text, and those are read; a real binary (BIFF)
   .xls is not, and the error asks for .xlsx or .csv. */

const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

// Quoted cells may hold the delimiter, doubled quotes and line breaks. The delimiter is
// whichever of tab ; | , appears most in the first line.
function parseDelimited(text) {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = ['\t', ';', '|', ','].reduce((best, mark) =>
    firstLine.split(mark).length > firstLine.split(best).length ? mark : best, ',');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function parseHtmlTable(text) {
  const table = new DOMParser().parseFromString(text, 'text/html').querySelector('table');
  if (!table) throw new Error('No table was found in this file.');
  return [...table.rows].map(tr => [...tr.cells].map(td => td.textContent.trim()));
}

async function readZipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('This .xlsx file is damaged or not a real Excel file.');
  const entries = new Map();
  let at = view.getUint32(end + 16, true);
  for (let n = view.getUint16(end + 10, true); n > 0; n--) {
    const nameLength = view.getUint16(at + 28, true);
    entries.set(new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength)), {
      method: view.getUint16(at + 10, true), size: view.getUint32(at + 20, true), offset: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return async name => {
    const entry = entries.get(name);
    if (!entry) return null;
    const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
    const data = bytes.subarray(start, start + entry.size);
    if (entry.method === 0) return new TextDecoder().decode(data);
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  };
}

// First worksheet of an .xlsx file. Cell references (B7) place each value in its column, so empty cells keep their gap.
async function parseXlsx(buffer) {
  const read = await readZipEntries(buffer);
  const xml = text => new DOMParser().parseFromString(text, 'application/xml');
  const shared = [...xml((await read('xl/sharedStrings.xml')) || '<sst/>').getElementsByTagName('si')]
    .map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
  const sheet = await read('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('No worksheet was found in this .xlsx file.');
  const column = ref => [...ref.replace(/\d+/g, '')].reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return [...xml(sheet).getElementsByTagName('row')].map(row => {
    const cells = [];
    [...row.getElementsByTagName('c')].forEach((c, index) => {
      const type = c.getAttribute('t');
      const raw = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const value = type === 's' ? shared[Number(raw)] ?? ''
        : type === 'inlineStr' ? [...c.getElementsByTagName('t')].map(t => t.textContent).join('')
        : raw;
      cells[c.getAttribute('r') ? column(c.getAttribute('r')) : index] = value;
    });
    return Array.from(cells, value => value ?? '');
  });
}

async function readSpreadsheet(file) {
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  if (!['csv', 'txt', 'xlsx', 'xls'].includes(ext)) throw new Error('Choose a .csv, .xlsx or .xls file.');
  if (file.size > IMPORT_MAX_BYTES) throw new Error('The file is larger than 5 MB.');
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  if (head[0] === 0x50 && head[1] === 0x4b) return parseXlsx(buffer);                   // "PK": zip (.xlsx)
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {   // binary Excel 97-2003
    throw new Error('This is an old binary .xls file. Open it in Excel and save it as .xlsx or .csv, then import that.');
  }
  const text = new TextDecoder().decode(buffer).replace(/^﻿/, '');
  return /^\s*</.test(text) ? parseHtmlTable(text) : parseDelimited(text);
}

/* ---------- Import popup (#master-import, shared by the list pages) ----------
   Reads the file as soon as it is chosen and shows what will happen; Start Import applies it.
   Spreadsheet headings match a column by its key, its label or one of its aliases (case, spaces
   and punctuation ignored). A duplicate matches an existing record by code or by name (ignoring case).
   Rows are added to the page's in-memory list until the pages read and write the API. */

const masterImport = { list: null, rows: [], opener: null };
const miEl = suffix => byId(`master-import-${suffix}`);
const miMode = () => byId('master-import').querySelector('input[name="master-import-mode"]:checked').value;
const findMasterRow = (rows, row) => rows.find(existing => (row.code && sameText(existing.code, row.code)) || sameText(existing.name, row.name));

// Header row: the first of the top five rows naming the name column.
function masterRowsFromSheet(list, sheet) {
  const { columns, noun } = list.config;
  const byHeader = {};
  for (const column of columns) {
    for (const header of [column.key, column.label, ...(column.headers || [])]) byHeader[normalHeader(header)] ??= column;
  }
  const headerIndex = sheet.slice(0, 5).findIndex(cells => cells.some(cell => byHeader[normalHeader(cell)]?.key === 'name'));
  if (headerIndex === -1) throw new Error(`No "${noun} Name" column was found. Download the template to see the expected columns.`);
  const sheetColumns = sheet[headerIndex].map(cell => byHeader[normalHeader(cell)]);
  const rows = [], issues = [];
  sheet.slice(headerIndex + 1).forEach((cells, index) => {
    if (cells.every(cell => String(cell).trim() === '')) return;
    const line = headerIndex + index + 2;
    const raw = {};
    sheetColumns.forEach((column, at) => { if (column && !raw[column.key]) raw[column.key] = String(cells[at] ?? '').trim(); });
    if (!raw.name) { issues.push(`Row ${line}: ${list.one} name is empty`); return; }
    try {
      rows.push(Object.fromEntries(columns.map(column => [column.key, column.read ? column.read(raw[column.key] || '') : raw[column.key] || ''])));
    } catch (error) {
      issues.push(`Row ${line}: ${error.message}`);
    }
  });
  return { rows, issues };
}

function renderMasterImportPreview(fileName, { rows, issues }) {
  const { list } = masterImport;
  masterImport.rows = rows;
  const duplicates = rows.filter(row => findMasterRow(list.rows, row)).length;
  miEl('drop').hidden = true;
  miEl('file').hidden = false;
  miEl('file-name').textContent = fileName;
  miEl('file-summary').textContent = `${list.count(rows.length)} ready · ${rows.length - duplicates} new · ${duplicates} already exist`
    + (issues.length ? ` · ${issues.length} row${issues.length === 1 ? '' : 's'} skipped` : '');
  miEl('file-issues').replaceChildren(...issues.slice(0, 3).map(text => el('li', '', text)),
    ...(issues.length > 3 ? [el('li', '', `…and ${issues.length - 3} more`)] : []));
  miEl('start').disabled = rows.length === 0;
}

async function loadMasterImportFile(file) {
  if (!file) return;
  try {
    renderMasterImportPreview(file.name, masterRowsFromSheet(masterImport.list, await readSpreadsheet(file)));
    miEl('start').focus();
    if (miEl('start').disabled) miEl('file').querySelector('[data-si="browse"]').focus();
  } catch (error) {
    clearMasterImportFile();
    showToast('Could not read the file', error.message || 'The file could not be read.', true);
  }
}

function clearMasterImportFile() {
  masterImport.rows = [];
  miEl('input').value = '';
  miEl('file').hidden = true;
  miEl('drop').hidden = false;
  miEl('start').disabled = true;
}

function openMasterImport(list) {
  Object.assign(masterImport, { list, opener: document.activeElement });
  miEl('title').textContent = `Import ${list.config.nouns}`;
  miEl('sub').textContent = `Add many ${list.many} at once from a spreadsheet`;
  miEl('icon').replaceChildren(list.$('page').querySelector('.fp-brand-icon svg').cloneNode(true));
  clearMasterImportFile();
  byId('master-import').querySelector('input[value="skip"]').checked = true;
  document.documentElement.classList.add('has-modal');
  byId('master-import').showModal();
  miEl('drop').focus();
}

function closeMasterImport() {
  const dialog = byId('master-import');
  if (!dialog.open) return;
  dialog.close();
  if (!byId('quick-menu').open) document.documentElement.classList.remove('has-modal');
  const back = masterImport.opener;
  (back && document.contains(back) && back !== document.body ? back : masterImport.list.$('import')).focus();
}

function startMasterImport() {
  const { list } = masterImport;
  if (!masterImport.rows.length) return;
  const overwrite = miMode() === 'overwrite';
  const { codePrefix, codeDigits } = list.config;
  // Auto-numbering continues the page's series (SUP005 → SUP006, ITM-2026-0006 → ITM-2026-0007);
  // imported codes in other formats (V-77) do not move it.
  const series = new RegExp(`^${codePrefix.replace(/[-]/g, '\\-')}(\\d+)$`, 'i');
  let next = Math.max(0, ...list.rows.map(row => Number(series.exec(row.code)?.[1] ?? 0))) + 1;
  const added = [];
  let updated = 0, skipped = 0;
  for (const row of masterImport.rows) {
    const existing = findMasterRow(list.rows, row) || findMasterRow(added, row);
    if (existing && overwrite) {
      const { code, ...details } = row;
      Object.assign(existing, details);
      updated++;
    } else if (existing) {
      skipped++;
    } else {
      added.push({ ...row, code: row.code ? row.code.toUpperCase() : `${codePrefix}${String(next++).padStart(codeDigits, '0')}` });
    }
  }
  list.rows.unshift(...added);                     // newest first, in the file's order
  list.render();
  closeMasterImport();
  showToast('Import complete', `${added.length} added, ${overwrite ? `${updated} updated` : `${skipped} skipped`}.`);
}

function handleMasterImportKeys(event) {
  const { key, target } = event;
  const ctrl = event.ctrlKey || event.metaKey;
  if (key === 'Escape') { event.preventDefault(); if (!event.repeat) closeMasterImport(); return true; }
  if (key === 'Enter' && ctrl) { event.preventDefault(); if (!event.repeat) startMasterImport(); return true; }
  if (!key.startsWith('Arrow') || ctrl || event.altKey) return false;
  // The strategy radios sit side by side: ←/→ pick the other option, ↑/↓ leave the row.
  // Arrows coming into the row land on the chosen option, not the nearest one.
  const dialog = byId('master-import');
  const chosen = dialog.querySelector('input[name="master-import-mode"]:checked');
  const above = miEl('file').hidden ? miEl('drop') : miEl('file').querySelector('[data-si="browse"]');
  const below = miEl('start').disabled ? dialog.querySelector('.si-foot [data-si="close"]') : miEl('start');
  let next = null;
  if (target.name === 'master-import-mode') {
    if (key === 'ArrowUp') next = above;
    else if (key === 'ArrowDown') next = below;
    else {
      next = dialog.querySelector(`input[name="master-import-mode"]:not([value="${target.value}"])`);
      next.checked = true;
    }
  } else if (key === 'ArrowDown' && (target === miEl('drop') || miEl('file').contains(target))) {
    next = chosen;
  } else if (key === 'ArrowUp' && target.closest('.si-foot')) {
    next = chosen;
  }
  if (!next) return false;
  event.preventDefault();
  next.focus();
  return true;
}

function initMasterImport() {
  const dialog = byId('master-import');
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeMasterImport(); });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) { closeMasterImport(); return; }   // backdrop
    const action = event.target.closest('[data-si]')?.dataset.si;
    if (action === 'close') closeMasterImport();
    else if (action === 'browse') miEl('input').click();
    else if (action === 'clear') { clearMasterImportFile(); miEl('drop').focus(); }
    else if (action === 'start') startMasterImport();
    else if (action === 'template') {
      const { list } = masterImport;
      const { columns, sample } = list.config;
      downloadCsv(masterFileName(list, 'import-template'), [columns.map(column => column.label), columns.map(column => sample[column.key] ?? '')]);
      showToast('Template downloaded', `Fill one ${list.one} per row. Leave Code blank to number it automatically.`);
    }
  });
  miEl('input').addEventListener('change', event => loadMasterImportFile(event.target.files[0]));
  for (const zone of [miEl('drop'), miEl('file')]) enableFileDrop(zone, files => loadMasterImportFile(files[0]));
}

/* ---------- Confirmation popup (#master-confirm) ----------
   confirmAction({ title, message, confirm }) resolves true on the confirm button, false on Cancel,
   Esc or the backdrop. Focus starts on Cancel, so Enter alone never deletes. */

let resolveConfirm = null;
let confirmOpener = null;

function confirmAction({ title, message, confirm }) {
  confirmOpener = document.activeElement;
  byId('master-confirm-title').textContent = title;
  byId('master-confirm-message').textContent = message;
  byId('master-confirm-ok').textContent = confirm;
  document.documentElement.classList.add('has-modal');
  byId('master-confirm').showModal();
  byId('master-confirm').querySelector('[data-mc="cancel"]').focus();
  return new Promise(resolve => { resolveConfirm = resolve; });
}

function closeConfirm(result) {
  const dialog = byId('master-confirm');
  if (!dialog.open) return;
  dialog.close();
  if (!byId('quick-menu').open) document.documentElement.classList.remove('has-modal');
  if (!result && confirmOpener && document.contains(confirmOpener)) confirmOpener.focus();
  resolveConfirm?.(result);
  resolveConfirm = null;
}

function handleMasterConfirmKeys(event) {
  if (event.key !== 'Escape') return false;
  event.preventDefault();
  if (!event.repeat) closeConfirm(false);
  return true;
}

function initMasterConfirm() {
  const dialog = byId('master-confirm');
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeConfirm(false); });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) { closeConfirm(false); return; }   // backdrop
    const action = event.target.closest('[data-mc]')?.dataset.mc;
    if (action) closeConfirm(action === 'ok');
  });
}

/* ---------- Delete ---------- */

async function deleteMasterRow(list, row) {
  const ok = await confirmAction({
    title: `Delete this ${list.one}?`,
    message: `${row.code} · ${row.name} will be removed from the ${list.one} list.`,
    confirm: `Delete ${list.config.noun}`,
  });
  if (!ok) return;
  const index = list.rows.indexOf(row);
  if (index === -1) return;
  list.rows.splice(index, 1);
  list.applied.delete(row.code);
  list.render();
  showToast(`${list.config.noun} deleted`, `${row.code} · ${row.name} was removed.`);
  const next = list.rows[index] || list.rows[index - 1];
  list.focusRow(next?.code);
}

/* ---------- View popup (#master-view) ----------
   Every column of the record. Keys: E edit, Delete removes, Esc closes. */

const masterView = { list: null, row: null, opener: null };

function openMasterView(list, row) {
  Object.assign(masterView, { list, row, opener: document.activeElement });
  byId('master-view-icon').replaceChildren(list.$('page').querySelector('.fp-brand-icon svg').cloneNode(true));
  byId('master-view-title').textContent = `${list.config.noun} Details`;
  byId('master-view-sub').textContent = row.code;
  byId('master-view-fields').replaceChildren(...list.config.columns.filter(column => column.key !== 'code').map(column => {
    const item = el('div', `mv-item${column.type === 'wrap' || column.key === 'name' ? ' mv-item-wide' : ''}`);
    const value = el('dd', `mv-value${column.key === 'name' ? ' mv-value-name' : ''}`);
    value.append(masterValue(column, row[column.key]));
    item.append(el('dt', 'mv-label', column.label), value);
    return item;
  }));
  document.documentElement.classList.add('has-modal');
  byId('master-view').showModal();
  byId('master-view').querySelector('[data-mv="edit"]').focus();
}

function closeMasterView({ restoreFocus = true } = {}) {
  const dialog = byId('master-view');
  if (!dialog.open) return;
  dialog.close();
  if (!byId('quick-menu').open) document.documentElement.classList.remove('has-modal');
  const back = masterView.opener;
  if (restoreFocus && back && document.contains(back)) back.focus();
}

function masterViewAction(action) {
  const { list, row } = masterView;
  if (action === 'close') closeMasterView();
  else if (action === 'edit') { closeMasterView({ restoreFocus: false }); location.hash = masterEditHash(list, row); }
  else if (action === 'delete') { closeMasterView(); deleteMasterRow(list, row); }
}

function handleMasterViewKeys(event) {
  const { key } = event;
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  // ↑/↓ and Page Up/Down scroll the details (long records such as a full supplier); ←/→ move between the buttons.
  const scroll = { ArrowUp: -60, ArrowDown: 60, PageUp: -300, PageDown: 300 }[key];
  if (scroll) {
    event.preventDefault();
    byId('master-view-fields').scrollBy({ top: scroll });
    return true;
  }
  const action = key === 'Escape' ? 'close' : key === 'Delete' ? 'delete' : key.toLowerCase() === 'e' ? 'edit' : null;
  if (!action) return false;
  event.preventDefault();
  if (!event.repeat) masterViewAction(action);
  return true;
}

function initMasterView() {
  const dialog = byId('master-view');
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeMasterView(); });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) { closeMasterView(); return; }   // backdrop
    const action = event.target.closest('[data-mv]')?.dataset.mv;
    if (action) masterViewAction(action);
  });
}

/* ---------- Edit page (#/masters/<list>/edit/<code>, #master-edit-page) ----------
   One full page for every list, built from the list's columns: the code is read-only,
   columns with choices are dropdowns, columns with options suggest values (datalist).
   Save checks each value with the column's read() and keeps names unique. */

const masterEdit = { list: null, row: null, saved: '' };
const meEl = suffix => byId(`master-edit-${suffix}`);
const masterEditHash = (list, row) => `#/${list.config.route}/edit/${encodeURIComponent(row.code)}`;
const meFields = () => [...meEl('fields').querySelectorAll('[data-key], [data-code-for]')];
const meSnapshot = () => meFields().map(field => field.value).join('\u0000');

function buildMasterEditField(list, column, row) {
  const id = `master-edit-field-${column.key}`;
  const isCode = column.key === 'code';
  const span = isCode ? 'fp-span-3' : column.key === 'name' ? 'fp-span-9' : column.type === 'wrap' ? 'fp-span-12' : 'fp-span-4';
  const field = el('div', `fp-field ${span}`);
  const label = el('label', 'fp-label', isCode ? `${list.config.noun} Code` : column.label);
  label.htmlFor = id;
  if (column.key === 'name') label.append(' ', el('span', 'fp-req', '*'));
  let input;
  if (column.lookup) {
    // Same markup as the creation forms' lookup fields: picked values only, the "Select …" popup on Enter.
    input = el('input', 'fp-input fp-lookup');
    Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, placeholder: `Select ${column.label.toLowerCase()}...` });
    input.inputMode = 'none';
    input.dataset.lookup = column.lookup;
    input.setAttribute('aria-haspopup', 'dialog');
    const wrap = el('div', 'fp-input-wrap fp-lookup-wrap');
    const icon = el('span', 'fp-lookup-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>';
    wrap.append(input, icon);
    input.id = id;
    input.dataset.key = column.key;
    input.value = String(row[column.key] ?? '');
    field.prepend(label, wrap);
    return field;
  }
  if (column.phone) {
    // Calling code + number; the code comes from the record's number, else from its country.
    const country = countryNamed(String(row.country ?? ''));
    const [dial, number] = splitPhone(row[column.key], country?.dial || '+968');
    const code = el('select', 'fp-input fp-select fp-select-list fp-phone-code');
    fillPhoneCodes(code);
    Object.assign(code, { id: `${id}-code`, value: dial });
    code.dataset.phoneCode = '';
    code.dataset.codeFor = column.key;
    code.dataset.enterSkip = '';
    code.dataset.enterOpens = 'true';
    code.setAttribute('aria-label', `${column.label} country code`);
    input = el('input', 'fp-input');
    Object.assign(input, { type: 'text', autocomplete: 'off', id, value: number });
    input.dataset.key = column.key;
    const wrap = el('div', 'fp-phone');
    wrap.append(code, input);
    field.prepend(label, wrap);
    return field;
  }
  if (column.choices) {
    // compactList: the styled option list, opened by Enter (Currency); skipEnter: Enter passes it by.
    input = el('select', `fp-input fp-select${column.compactList ? ' fp-select-list' : ''}`);
    if (column.compactList) input.dataset.enterOpens = 'true';
    if (column.skipEnter) input.dataset.enterSkip = '';
    const current = String(row[column.key] ?? '');
    const choices = column.choices.includes(current) || !current ? column.choices : [current, ...column.choices];
    input.append(...choices.map(choice => { const option = el('option', '', choice); option.value = choice; return option; }));
  } else {
    input = el('input', `fp-input${isCode ? ' fp-input-code' : ''}`);
    input.type = 'text';
    input.autocomplete = 'off';
    if (isCode) { input.readOnly = true; input.tabIndex = -1; input.title = 'Codes cannot be changed'; }
    const options = column.options?.();
    if (options?.length) {
      const datalist = el('datalist');
      datalist.id = `${id}-options`;
      datalist.append(...[...new Set(options)].map(option => { const node = el('option'); node.value = option; return node; }));
      input.setAttribute('list', datalist.id);
      field.append(datalist);
    }
  }
  input.id = id;
  input.dataset.key = column.key;
  input.value = String(row[column.key] ?? '');
  field.prepend(label, input);
  return field;
}

// Route resolver used by renderRoute: a known list and code open the page; an unknown code returns to the list.
function masterEditPage(route) {
  const match = /^(masters\/[a-z-]+)\/edit\/(.+)$/.exec(route);
  const list = match && MASTER_LISTS.find(entry => entry.config.route === match[1]);
  if (!list) return null;
  const row = list.rows.find(entry => entry.code === decodeURIComponent(match[2]));
  if (!row) {
    history.replaceState(null, '', `#/${list.config.route}`);
    showToast(`${list.config.noun} not found`, `No ${list.one} has the code ${decodeURIComponent(match[2])}.`, true);
    return FORM_PAGES[list.config.route];
  }
  return {
    page: 'master-edit',
    alwaysReset: true,                     // another record may be opened while this page is showing
    reset: () => openMasterEdit(list, row),
    firstField: () => meEl('fields').querySelector('[data-key="name"]'),
  };
}

function openMasterEdit(list, row) {
  Object.assign(masterEdit, { list, row });
  meEl('icon').replaceChildren(list.$('page').querySelector('.fp-brand-icon svg').cloneNode(true));
  meEl('title').textContent = `Edit ${list.config.noun}`;
  meEl('sub').textContent = `${row.code} · ${row.name}`;
  meEl('section').textContent = `${list.config.noun} Details`;
  meEl('cancel').textContent = `Back to ${list.config.nouns}`;
  meEl('fields').replaceChildren(...list.config.columns.map(column => buildMasterEditField(list, column, row)));
  masterEdit.saved = meSnapshot();
}

function leaveMasterEdit() {
  const { list, row } = masterEdit;
  list.returnTo = row.code;
  location.hash = `#/${list.config.route}`;
}

async function backFromMasterEdit() {
  if (meSnapshot() !== masterEdit.saved) {
    const discard = await confirmAction({
      title: 'Discard your changes?',
      message: `The changes to ${masterEdit.row.code} have not been saved.`,
      confirm: 'Discard Changes',
    });
    if (!discard) return;
  }
  leaveMasterEdit();
}

function saveMasterEdit() {
  const { list, row } = masterEdit;
  clearFormErrors(meEl('form'));
  const errors = [];
  const values = {};
  for (const column of list.config.columns) {
    if (column.key === 'code') continue;
    const node = meEl('fields').querySelector(`[data-key="${column.key}"]`);
    const code = meEl('fields').querySelector(`[data-code-for="${column.key}"]`);
    const raw = code ? joinPhone(code.value, node.value) : node.value.trim();
    try {
      if (column.key === 'name' && !raw) throw new Error(`${column.label} is required`);
      values[column.key] = column.read ? column.read(raw) : raw;
    } catch (error) {
      errors.push({ node, message: `${error.message[0].toUpperCase()}${error.message.slice(1)}.` });
    }
  }
  const nameNode = meEl('fields').querySelector('[data-key="name"]');
  if (values.name && list.rows.some(other => other !== row && sameText(other.name, values.name))) {
    errors.push({ node: nameNode, message: `Another ${list.one} is already named “${values.name}”.` });
  }
  if (errors.length) { showFormErrors(errors); return; }
  Object.assign(row, values);
  masterEdit.saved = meSnapshot();
  showToast(`${list.config.noun} updated`, `${row.code} · ${row.name} was saved.`);
  leaveMasterEdit();
}

// Enter: next field (the last one goes to Save). Ctrl+S saves. Esc goes back (asking first if anything changed).
function handleMasterEditKeys(event) {
  if (byId('master-confirm').open) return handleMasterConfirmKeys(event);
  const { key, target } = event;
  const ctrl = event.ctrlKey && !event.metaKey;
  if (key === 'Escape' && !ctrl && !event.altKey) {
    event.preventDefault();
    if (!event.repeat) backFromMasterEdit();
    return true;
  }
  if (ctrl && !event.altKey && !event.shiftKey && key.toLowerCase() === 's') {
    event.preventDefault();
    if (!event.repeat) saveMasterEdit();
    return true;
  }
  if (key === 'Enter' && !ctrl && !event.altKey && !event.shiftKey && target.dataset.key) {
    event.preventDefault();
    if (target.dataset.enterOpens) {
      try { target.showPicker(); } catch { /* unsupported: Space still opens it */ }
      return true;
    }
    const order = formEnterOrder(meEl('form'), meEl('save'));
    enterField(fieldAfter(order, target) || meEl('save'));
    return true;
  }
  return false;
}

function initMasterEdit() {
  meEl('save').addEventListener('click', saveMasterEdit);
  meEl('cancel').addEventListener('click', backFromMasterEdit);
  meEl('back').addEventListener('click', backFromMasterEdit);
  meEl('form').addEventListener('submit', event => event.preventDefault());
  meEl('form').addEventListener('input', event => {
    if (event.target.classList.contains('is-invalid')) clearFieldError(event.target);
    // A new category clears a sub-category that is not one of its own, as on the Item creation form.
    const subCategoryField = meEl('fields').querySelector('[data-key="subCategory"]');
    if (event.target.dataset.key === 'category' && subCategoryField?.value) {
      const own = categoryList.rows.find(row => row.name === event.target.value)?.subCategories.split(',').map(name => name.trim());
      if (!own?.includes(subCategoryField.value)) subCategoryField.value = '';
    }
    // A known country fills in its currency and calling codes, as on the party form.
    const country = event.target.dataset.key === 'country' && countryNamed(event.target.value);
    if (country) {
      const currencyField = meEl('fields').querySelector('[data-key="currency"]');
      if (currencyField) currencyField.value = country.currency;
      for (const code of meEl('fields').querySelectorAll('[data-code-for]')) code.value = country.dial;
    }
  });
  FORM_KEY_HANDLERS['master-edit'] = handleMasterEditKeys;
}

/* ---------- The list pages: columns and dummy rows (from the demo data) ---------- */

const ACTIVE_STATUSES = ['active', 'inactive'];
const ITEM_STATUSES = ['ACTIVE / RELEASED', 'QUALITY HOLD', 'OBSOLETE', 'DRAFT'];
const readCurrency = value => {
  const code = (value || 'OMR').toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error(`currency "${value}" must be a 3-letter code`);
  return code;
};
const readEmail = value => {
  if (value && !EMAIL.test(value)) throw new Error(`"${value}" is not a valid email`);
  return value;
};
// Blank takes the first status; "active" matches "ACTIVE / RELEASED".
const readStatus = statuses => value => {
  if (!value) return statuses[0];
  const status = statuses.find(option => sameText(option, value) || option.toLowerCase().startsWith(value.trim().toLowerCase()));
  if (!status) throw new Error(`status "${value}" must be one of: ${statuses.join(', ')}`);
  return status;
};
const readWholeNumber = name => value => {
  if (!value) return '';
  if (!/^\d{1,5}$/.test(value)) throw new Error(`${name} "${value}" must be a whole number of days`);
  return String(Number(value));
};
const readAmount = name => value => {
  if (!value) return '0.00';
  const amount = value.replace(/,/g, '');
  if (!/^-?\d{1,13}(\.\d{1,2})?$/.test(amount)) throw new Error(`${name} "${value}" must be an amount with up to 2 decimals`);
  return Number(amount).toFixed(2);
};
const readPercent = value => {
  if (!value) return '0.00';
  const percent = value.replace(/%$/, '').trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(percent) || Number(percent) > 100) throw new Error(`discount "${value}" must be a percentage from 0 to 100`);
  return Number(percent).toFixed(2);
};
const readDecimals = value => {
  if (!value) return '0';
  if (!/^\d+$/.test(value) || Number(value) > UOM_MAX_DECIMALS) throw new Error(`decimal allowed "${value}" must be a whole number from 0 to ${UOM_MAX_DECIMALS}`);
  return String(Number(value));
};
const readFactor = value => {
  if (!value) return '1.0000';
  if (!isValidUomFactor(value)) throw new Error(`conversion factor "${value}" must be above 0, with up to 4 decimals`);
  return Number(value).toFixed(4);
};

const codeColumn = (...headers) => ({ key: 'code', label: 'Code', type: 'code', headers });
const nameColumn = (noun, ...headers) => ({ key: 'name', label: `${noun} Name`, type: 'name', headers });
const statusColumn = (statuses = ACTIVE_STATUSES) => ({ key: 'status', label: 'Status', type: 'status', choices: statuses, read: readStatus(statuses) });
// Every country's currency, then the common trading ones.
const CURRENCIES = [...new Set([...COUNTRIES.map(country => country.currency), 'USD', 'EUR', 'GBP'])];
const partyColumns = () => [
  { key: 'currency', label: 'Currency', type: 'pill', headers: ['currency code', 'curr'], choices: CURRENCIES, compactList: true, skipEnter: true, read: readCurrency },
  { key: 'mobile', label: 'Mobile', phone: true, headers: ['mobile no', 'mobile number', 'phone', 'phone no', 'phone number', 'contact', 'contact no', 'contact number', 'telephone', 'tel'] },
  { key: 'email', label: 'Email', type: 'upper', headers: ['email address', 'email id', 'mail'], read: readEmail },
];
const codeYear = today.getFullYear();

// Supplier fields beyond the table columns (the suppliers table in the data model).
const supplierDetailColumns = [
  { key: 'organization', label: 'Organization Name', headers: ['organisation', 'organization', 'legal name'] },
  { key: 'owner', label: 'Owner Details', headers: ['owner', 'proprietor'] },
  { key: 'taxRegNo', label: 'Tax Reg. No', headers: ['vat no', 'vat number', 'tax number', 'trn', 'cr no'] },
  { key: 'contactPerson', label: 'Contact Person', headers: ['contact name', 'attention'] },
  { key: 'telephone', label: 'Telephone', phone: true, headers: ['landline', 'office phone'] },
  { key: 'address', label: 'Address', type: 'wrap', headers: ['street', 'address line'] },
  { key: 'location', label: 'Location', headers: ['area'] },
  { key: 'city', label: 'City', headers: ['town'] },
  { key: 'zipCode', label: 'ZIP Code', headers: ['zip', 'postal code', 'po box', 'pin code'] },
  { key: 'country', label: 'Country', lookup: 'country' },
  { key: 'paymentTerms', label: 'Payment Terms', headers: ['terms'], options: () => ['Advance', 'Cash on Delivery', 'Net 15', 'Net 30', 'Net 45', 'Net 60'] },
  { key: 'leadTimeDays', label: 'Lead Time (Days)', headers: ['lead time'], read: readWholeNumber('lead time') },
  { key: 'openingBalance', label: 'Opening Balance', type: 'mono', headers: ['opening'], read: readAmount('opening balance') },
  { key: 'debitLimit', label: 'Debit Limit', type: 'mono', headers: ['credit limit'], read: readAmount('debit limit') },
  { key: 'debitDays', label: 'Debit Days', headers: ['credit days'], read: readWholeNumber('debit days') },
  { key: 'discountPercent', label: 'Discount %', headers: ['discount'], read: readPercent },
  { key: 'accountDetails', label: 'Account Details', type: 'wrap', headers: ['bank details', 'bank account', 'iban'] },
  statusColumn(),
  { key: 'remarks', label: 'Remarks', type: 'wrap', headers: ['notes', 'comments'] },
].map(column => ({ ...column, inTable: false }));

const supplierList = createMasterList({
  key: 'supplier', route: 'masters/supplier', newRoute: '#/masters/party/new', noun: 'Supplier', nouns: 'Suppliers',
  codePrefix: 'SUP', codeDigits: 3,
  columns: [codeColumn('supplier code', 'vendor code', 'party code'),
    nameColumn('Supplier', 'supplier', 'vendor', 'vendor name', 'company', 'company name', 'party name'), ...partyColumns(),
    ...supplierDetailColumns],
  sample: { name: 'Gulf Valves LLC', currency: 'OMR', mobile: '+968 9123 4567', email: 'sales@gulfvalves.om', city: 'Muscat', country: 'Oman', paymentTerms: 'Net 30', status: 'active' },
  rows: [
    {
      code: 'SUP006', name: 'Sanjay', currency: 'OMR', mobile: '+968 9123 4455', email: 'sanjay@sanjaysupplies.om',
      organization: 'Sanjay Industrial Supplies LLC', owner: 'Sanjay', taxRegNo: 'OM1100234567', contactPerson: 'Sanjay',
      telephone: '+968 2470 1234', location: 'Ruwi', address: 'Building 214, Way 3021, Ruwi High Street', city: 'Muscat',
      zipCode: '112', country: 'Oman', paymentTerms: 'Net 30', leadTimeDays: '7', openingBalance: '1250.00',
      debitLimit: '5000.00', debitDays: '45', discountPercent: '2.50',
      accountDetails: 'Bank Muscat · A/C 0312 0456 7890 · IBAN OM81 0270 0312 0456 7890', status: 'active',
      remarks: 'Preferred supplier for valves, pipes and fittings. Delivers within Muscat in 2 days.',
    },
    { code: 'SUP005', name: 'Sohar Industrial Supply', currency: 'OMR', mobile: '+968 9988 7766', email: 'sohar@indsupply.om' },
    { code: 'SUP004', name: 'Kerala Pipes & Fittings', currency: 'INR', mobile: '+91 94470 12345', email: 'kpf@gmail.com' },
    { code: 'SUP003', name: 'Desert Fasteners', currency: 'SAR', mobile: '+966 55 234 5678', email: 'sales@desertfast.sa' },
    { code: 'SUP002', name: 'Nizwa Spare Parts', currency: 'OMR', mobile: '', email: 'nizwa.sp@gmail.com' },
    { code: 'SUP001', name: 'ABC Traders', currency: 'OMR', mobile: '', email: '' },
  ],
});

const customerList = createMasterList({
  key: 'customer', route: 'masters/customer', newRoute: '#/masters/customer/new', noun: 'Customer', nouns: 'Customers',
  codePrefix: 'CUS', codeDigits: 3,
  columns: [codeColumn('customer code', 'client code', 'party code'),
    nameColumn('Customer', 'customer', 'client', 'client name', 'company', 'company name', 'party name'), ...partyColumns()],
  sample: { name: 'Oman Oil Services LLC', currency: 'OMR', mobile: '+968 2456 1100', email: 'procurement@omanoil.om' },
  rows: [
    { code: 'CUS003', name: 'Oman Oil Services LLC', currency: 'OMR', mobile: '+968 2456 1100', email: 'procurement@omanoil.om' },
    { code: 'CUS002', name: 'Al Jazeera Steel Products', currency: 'OMR', mobile: '+968 9911 2233', email: 'purchase@jazeerasteel.om' },
    { code: 'CUS001', name: 'Gulf Engineering Contractors', currency: 'AED', mobile: '+971 4 555 0199', email: 'accounts@gulfeng.ae' },
  ],
});

const itemList = createMasterList({
  key: 'item', route: 'masters/item', newRoute: `#/${ITEM_ROUTE}`, noun: 'Item', nouns: 'Items',
  codePrefix: `ITM-${codeYear}-`, codeDigits: 4,
  columns: [codeColumn('item code', 'sku', 'part no', 'part number'),
    nameColumn('Item', 'item', 'product', 'product name', 'item description'),
    { key: 'category', label: 'Category', headers: ['item category', 'group', 'item group'], lookup: 'master-category' },
    { key: 'subCategory', label: 'Sub Category', headers: ['subcategory', 'sub group', 'subgroup'], lookup: 'master-subcategory' },
    { key: 'unit', label: 'Unit', type: 'pill', headers: ['uom', 'unit name', 'unit of measure'], lookup: 'master-uom' },
    { key: 'brand', label: 'Brand', headers: ['brand name', 'make', 'manufacturer'], lookup: 'master-brand' },
    { key: 'stockPoint', label: 'Stock Point', headers: ['warehouse', 'store', 'location'], lookup: 'master-stock-point' },
    statusColumn(ITEM_STATUSES)],
  sample: { name: 'Gate Valve 2" Cast Iron', category: 'Pneumatics & Hydraulics', subCategory: 'Ball Valves', unit: 'Pieces', brand: 'Festo', stockPoint: 'Central WH North', status: 'ACTIVE / RELEASED' },
  rows: [
    { code: 'ITM-2026-0006', name: 'Nitrile Gloves Size L', category: 'Safety & Protective', subCategory: 'Gloves', unit: 'Pair', brand: '3M', stockPoint: 'Secondary WH South', status: 'ACTIVE / RELEASED' },
    { code: 'ITM-2026-0005', name: 'Hex Bolt M10 x 50', category: 'Mechanical Hardware', subCategory: 'Fasteners', unit: 'Box', brand: '', stockPoint: 'Spare Parts Store', status: 'ACTIVE / RELEASED' },
    { code: 'ITM-2026-0004', name: 'Deep Groove Bearing 6205-2RS', category: 'Mechanical Hardware', subCategory: 'Bearings', unit: 'Pieces', brand: 'SKF', stockPoint: 'Spare Parts Store', status: 'ACTIVE / RELEASED' },
    { code: 'ITM-2026-0003', name: 'MCB 32A 3-Pole', category: 'Electrical Switchgear', subCategory: 'Circuit Breakers', unit: 'Pieces', brand: 'Schneider Electric', stockPoint: 'Secondary WH South', status: 'ACTIVE / RELEASED' },
    { code: 'ITM-2026-0002', name: 'Solenoid Valve 24V DC 1/4"', category: 'Pneumatics & Hydraulics', subCategory: 'Solenoid Valves', unit: 'Pieces', brand: 'Festo', stockPoint: 'Central WH North', status: 'ACTIVE / RELEASED' },
    { code: 'ITM-2026-0001', name: 'Ball Valve 1/2" SS316', category: 'Pneumatics & Hydraulics', subCategory: 'Ball Valves', unit: 'Pieces', brand: 'Festo', stockPoint: 'Central WH North', status: 'ACTIVE / RELEASED' },
  ],
});

const uomList = createMasterList({
  key: 'uom', route: 'masters/uom', newRoute: '#/masters/uom/new', noun: 'UOM', nouns: 'UOMs',
  codePrefix: 'UOM-', codeDigits: 4,
  columns: [codeColumn('uom code', 'unit code'),
    nameColumn('Unit', 'unit', 'uom', 'uom name', 'unit of measure'),
    { key: 'decimals', label: 'Decimal Allowed', headers: ['decimals', 'decimal places'], choices: ['0', '1', '2', '3', '4', '5', '6'], read: readDecimals },
    { key: 'baseUnit', label: 'Base Unit', headers: ['base', 'base uom', 'conversion base'], lookup: 'master-uom' },
    { key: 'factor', label: 'Conversion Factor', type: 'mono', headers: ['factor', 'conversion'], read: readFactor },
    statusColumn()],
  sample: { name: 'Dozen', decimals: '0', baseUnit: 'Pieces', factor: '12.0000', status: 'active' },
  rows: [
    { code: 'UOM-0012', name: 'Metric Tonne', decimals: '3', baseUnit: 'Kilogram', factor: '1000.0000', status: 'active' },
    { code: 'UOM-0011', name: 'Gram', decimals: '0', baseUnit: 'Kilogram', factor: '0.0010', status: 'active' },
    { code: 'UOM-0009', name: 'Metre', decimals: '2', baseUnit: '', factor: '1.0000', status: 'active' },
    { code: 'UOM-0007', name: 'Kilogram', decimals: '3', baseUnit: '', factor: '1.0000', status: 'active' },
    { code: 'UOM-0003', name: 'Box', decimals: '0', baseUnit: '', factor: '1.0000', status: 'active' },
    { code: 'UOM-0001', name: 'Pieces', decimals: '0', baseUnit: '', factor: '1.0000', status: 'active' },
  ],
});

const brandList = createMasterList({
  key: 'brand', route: 'masters/brand', newRoute: '#/masters/brand/new', noun: 'Brand', nouns: 'Brands',
  codePrefix: `BRD-${codeYear}-`, codeDigits: 4,
  columns: [codeColumn('brand code'), nameColumn('Brand', 'brand', 'make', 'manufacturer'), statusColumn()],
  sample: { name: 'Parker Hannifin', status: 'active' },
  rows: [
    { code: 'BRD-2026-0004', name: '3M', status: 'active' },
    { code: 'BRD-2026-0003', name: 'SKF', status: 'active' },
    { code: 'BRD-2026-0002', name: 'Schneider Electric', status: 'active' },
    { code: 'BRD-2026-0001', name: 'Festo', status: 'active' },
  ],
});

const categoryList = createMasterList({
  key: 'category', route: 'masters/category', newRoute: '#/masters/category/new', noun: 'Category', nouns: 'Categories',
  codePrefix: `CAT-${codeYear}-`, codeDigits: 4,
  columns: [codeColumn('category code', 'group code'), nameColumn('Category', 'category', 'group', 'group name'),
    { key: 'subCategories', label: 'Sub Categories', type: 'wrap', headers: ['sub category', 'subcategory', 'subcategories', 'sub groups'] },
    statusColumn()],
  sample: { name: 'Power Tools', subCategories: 'Drills, Grinders', status: 'active' },
  rows: [
    { code: 'CAT-2026-0005', name: 'Instrumentation', subCategories: 'Pressure Gauges, Temperature Sensors', status: 'active' },
    { code: 'CAT-2026-0004', name: 'Safety & Protective', subCategories: 'Helmets & Headgear, Gloves, Safety Footwear', status: 'active' },
    { code: 'CAT-2026-0003', name: 'Mechanical Hardware', subCategories: 'Bearings, Fasteners, Couplings', status: 'active' },
    { code: 'CAT-2026-0002', name: 'Electrical Switchgear', subCategories: 'Circuit Breakers, Contactors, Cables & Wires', status: 'active' },
    { code: 'CAT-2026-0001', name: 'Pneumatics & Hydraulics', subCategories: 'Ball Valves, Solenoid Valves, Pressure Regulators, Hydraulic Hoses', status: 'active' },
  ],
});

const stockPointList = createMasterList({
  key: 'stock-point', route: 'masters/stock-point', newRoute: '#/masters/stock-point/new', noun: 'Stock Point', nouns: 'Stock Points',
  codePrefix: `WH-${codeYear}-`, codeDigits: 4,
  columns: [codeColumn('stock point code', 'warehouse code', 'store code'),
    nameColumn('Stock Point', 'stock point', 'warehouse', 'warehouse name', 'store', 'store name', 'location'),
    { key: 'type', label: 'Type', type: 'pill', headers: ['warehouse type', 'store type'], options: () => ['Finished Goods', 'Spare Parts', 'Raw Materials', 'Consumables'] },
    { key: 'city', label: 'City', headers: ['town'] },
    { key: 'country', label: 'Country', lookup: 'country' },
    { key: 'contactPerson', label: 'Contact Person', headers: ['contact', 'in charge', 'incharge', 'store keeper'] },
    { key: 'phone', label: 'Phone', phone: true, headers: ['mobile', 'phone no', 'phone number', 'telephone', 'tel'] },
    statusColumn()],
  sample: { name: 'Sohar Port Store', type: 'Finished Goods', city: 'Sohar', country: 'Oman', contactPerson: 'Store Keeper', phone: '+968 2685 0000', status: 'active' },
  rows: [
    { code: 'WH-2026-0003', name: 'Spare Parts Store', type: 'Spare Parts', city: 'Muscat', country: 'Oman', contactPerson: 'Store Keeper', phone: '+968 2400 0000', status: 'active' },
    { code: 'WH-2026-0002', name: 'Secondary WH South', type: 'Finished Goods', city: 'Muscat', country: 'Oman', contactPerson: 'Store Keeper', phone: '+968 2400 0000', status: 'active' },
    { code: 'WH-2026-0001', name: 'Central WH North', type: 'Finished Goods', city: 'Muscat', country: 'Oman', contactPerson: 'Store Keeper', phone: '+968 2400 0000', status: 'active' },
  ],
});

const MASTER_LISTS = [supplierList, customerList, itemList, uomList, brandList, categoryList, stockPointList];

// New Customer: the party form with Under set to Debtors, not as an undo step.
FORM_PAGES['masters/customer/new'] = {
  page: 'party',
  reset() {
    FORM_PAGES['masters/party/new'].reset();
    partyEl('under').value = 'debtors';
    syncPartyVariant();
    partyForm.absorb();
  },
  firstField: FORM_PAGES['masters/party/new'].firstField,
};

const MASTER_FORMS = [uomForm, brandForm, categoryForm, warehouseForm, partyForm];

/* =====================================================================
   Hash router: #/home (dashboard), the form pages in FORM_PAGES and the
   master edit pages (#/masters/<list>/edit/<code>, see masterEditPage).
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
  const formPage = FORM_PAGES[route] || masterEditPage(route);
  if (formPage) {
    if (currentPage !== formPage.page || formPage.alwaysReset) {
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
  for (const select of [...document.querySelectorAll('select[data-phone-code]'),
    ...[...document.querySelectorAll('template')].flatMap(template => [...template.content.querySelectorAll('select[data-phone-code]')])]) fillPhoneCodes(select);
  initKeyboardNavigation();
  initQuickMenu();
  initLookups();
  initItemPage();
  for (const form of MASTER_FORMS) form.init();
  initMasterFilter();
  initMasterImport();
  initMasterView();
  initMasterConfirm();
  initMasterEdit();
  for (const list of MASTER_LISTS) list.init();
  loadDashboard();
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
});
