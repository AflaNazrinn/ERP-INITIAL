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
  clearFormErrors(itemEl('form'));
  // Preview only; the server assigns the real code when the item is saved.
  itemEl('code').value = `ITM-${today.getFullYear()}-0001`;
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

  const payload = {
    itemName: text('name'),
    unit: text('unit').toUpperCase(),
    category: text('category'),
    subCategory: text('subcategory'),
    comments: text('comments'),
    sourcing: [],
    stockPoint: text('stock-point'),
    rack: text('rack'),
    status: text('status'),
    docLink: text('doc-link'),
    imageLink: text('image-link'),
    supplierUrl: text('supplier-url'),
  };
  if (payload.itemName === '') fail(itemEl('name'), 'Item designation is required.');

  for (const row of itemEl('source-body').rows) {
    const cell = field => row.querySelector(`[data-field="${field}"]`);
    const line = Object.fromEntries(['brand', 'supplier', 'cost', 'openingStock', 'sellingPrice', 'batchExpiry']
      .map(field => [field, cell(field).value.trim()]));
    if (Object.values(line).every(v => v === '')) continue;     // blank rows are ignored
    for (const field of ['cost', 'openingStock', 'sellingPrice']) {
      if (line[field] !== '' && !DECIMAL_3.test(line[field])) fail(cell(field), 'Enter a number with up to 3 decimals.');
    }
    payload.sourcing.push(line);
  }

  for (const [suffix, label] of [['doc-link', 'PDF spec link'], ['image-link', 'CAD / image URL'], ['supplier-url', 'Supplier URL']]) {
    if (text(suffix) !== '' && !isHttpUrl(text(suffix))) fail(itemEl(suffix), `${label} must start with http:// or https://`);
  }
  return { payload, errors };
}

function saveItem() {
  clearFormErrors(itemEl('form'));
  const { errors } = readItemForm();
  if (errors.length) {
    showFormErrors(errors);
    return;
  }
  // Backend not built yet: this becomes
  //   apiRequest('api/items.php', { method: 'POST', body: JSON.stringify(payload) })
  // and returns to the dashboard on success.
  showToast('Item details look good', 'Saving will work once the items API (api/items.php) is built.');
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
  const columnCells = r => [...r.querySelectorAll('input:not([readonly]), select')];
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

  function save() {
    clearFormErrors(el('form'));
    const { errors } = config.read();
    if (errors.length) {
      showFormErrors(errors, config.reveal);
      return;
    }
    // Backend not built yet: this becomes
    //   apiRequest(config.api, { method: 'POST', body: JSON.stringify(payload) })
    showToast(`${config.noun} details look good`, `Saving will work once the ${config.noun} API (${config.api}) is built.`);
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
const previewCode = prefix => `${prefix}-${today.getFullYear()}-0001`;   // the server assigns the real code on save

/* ---------- UOM Creation  (#/masters/uom/new) ---------- */

const UOM_FACTOR = /^\d{1,9}(\.\d{1,4})?$/;   // conversion factor: up to 4 decimals
const UOM_MAX_DECIMALS = 6;
const uomEl = suffix => byId(`uom-${suffix}`);
const isValidUomFactor = value => UOM_FACTOR.test(value) && Number(value) > 0;

const uomForm = createFormPage({
  key: 'uom', route: 'masters/uom/new', noun: 'UOM', api: 'api/uoms.php',
  firstField: () => uomEl('name'),
  setCode: () => { uomEl('code').value = 'UOM-0001'; },
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
        baseUnit: check.text('base'), conversionFactor: Number(check.text('factor')), description: check.text('description'),
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
const brandForm = createFormPage({
  key: 'brand', route: 'masters/brand/new', noun: 'Brand', api: 'api/brands.php',
  firstField: () => brandEl('name'),
  setCode: () => { brandEl('code').value = previewCode('BRD'); },
  read() {
    const check = formChecks(brandEl);
    check.required('name', 'Brand name');
    check.required('items', 'Item name');
    return {
      errors: check.errors,
      payload: {
        brandName: check.text('name'), status: check.text('status'), description: check.text('description'),
        itemNames: check.text('items').split('\n').map(line => line.trim()).filter(Boolean),
      },
    };
  },
});

/* ---------- Category Creation  (#/masters/category/new) ---------- */

const categoryEl = suffix => byId(`category-${suffix}`);
const categoryForm = createFormPage({
  key: 'category', route: 'masters/category/new', noun: 'Category', api: 'api/categories.php',
  firstField: () => categoryEl('name'),
  setCode: () => { categoryEl('code').value = previewCode('CAT'); },
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
let warehouseItems = [];

function renderWarehouseChips() {
  const chips = warehouseItems.map((name, index) => {
    const chip = el('span', 'fp-chip');
    chip.append(el('span', '', name));
    const remove = el('button', 'fp-chip-del');
    remove.type = 'button';
    remove.dataset.chip = String(index);
    remove.setAttribute('aria-label', `Remove ${name}`);
    remove.textContent = '×';
    chip.append(remove);
    return chip;
  });
  for (const old of warehouseEl('chips').querySelectorAll('.fp-chip')) old.remove();
  warehouseEl('item-entry').before(...chips);   // the box itself stays put, keeping its focus
}

// Free text until the items API can supply the saved item list.
function addWarehouseItem() {
  const entry = warehouseEl('item-entry');
  const name = entry.value.trim();
  entry.value = '';
  if (name === '') return false;
  if (!warehouseItems.some(item => item.toLowerCase() === name.toLowerCase())) {
    warehouseItems = [...warehouseItems, name];
    renderWarehouseChips();
    clearFieldError(entry);
    warehouseForm.record();
  }
  return true;
}

function removeWarehouseItem(index) {
  warehouseItems = warehouseItems.filter((_, i) => i !== index);
  renderWarehouseChips();
  warehouseForm.record();
  warehouseEl('item-entry').focus();
}

const warehouseForm = createFormPage({
  key: 'warehouse', route: 'masters/stock-point/new', noun: 'Warehouse', api: 'api/warehouses.php',
  firstField: () => warehouseEl('name'),
  setCode: () => { warehouseEl('code').value = previewCode('WH'); },
  extra: {
    read: () => warehouseItems,
    write(items) { warehouseItems = items; renderWarehouseChips(); },
    reset() { warehouseItems = []; renderWarehouseChips(); },
  },
  extraFocus: () => warehouseEl('item-entry'),
  onEnter(event) {
    return event.target === warehouseEl('item-entry') && addWarehouseItem();
  },
  onKey(event) {
    const entry = warehouseEl('item-entry');
    if (event.target === entry && event.key === 'Backspace' && entry.value === '' && warehouseItems.length) {
      event.preventDefault();
      removeWarehouseItem(warehouseItems.length - 1);
      return true;
    }
    return false;
  },
  read() {
    addWarehouseItem();                       // text still in the box counts as added
    const check = formChecks(warehouseEl);
    for (const [suffix, label] of [['name', 'Warehouse name'], ['address', 'Address'], ['city', 'City / municipality'], ['contact', 'Contact person'], ['phone', 'Phone / extension'], ['email', 'Email address'], ['manager', 'Assigned manager'], ['capacity', 'Total storage capacity']]) {
      check.required(suffix, label);
    }
    check.matches('email', EMAIL, 'Enter a valid email address.');
    if (warehouseItems.length === 0) check.fail(warehouseEl('item-entry'), 'Add at least one item.');
    check.matches('capacity', WHOLE_NUMBER, 'Total storage capacity must be a whole number.');
    return {
      errors: check.errors,
      payload: {
        warehouseName: check.text('name'), type: check.text('type'), address: check.text('address'), country: check.text('country'), city: check.text('city'),
        contactPerson: check.text('contact'), phone: check.text('phone'), email: check.text('email'), manager: check.text('manager'),
        items: warehouseItems, capacity: Number(check.text('capacity')), status: check.text('status'), remarks: check.text('remarks'),
      },
    };
  },
  init() {
    warehouseEl('chips').addEventListener('click', event => {
      const remove = event.target.closest('[data-chip]');
      if (remove) removeWarehouseItem(Number(remove.dataset.chip));
      else warehouseEl('item-entry').focus();
    });
    warehouseEl('item-entry').addEventListener('blur', addWarehouseItem);
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

const partyForm = createFormPage({
  key: 'party', route: 'masters/party/new', noun: 'Party', api: 'api/parties.php',
  firstField: () => partyEl(`${partyVariant()}-name`),
  setCode() {
    partyEl('sup-code').value = previewCode('SUP');
    partyEl('cus-code').value = previewCode('CUS');
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
    read: () => docRows().map(readDocRow),
    write: renderDocRows,
    reset: () => renderDocRows([]),
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
    check.matches('credit-limit', DECIMAL_3, NUMBER_3);
    check.matches('credit-days', WHOLE_NUMBER, WHOLE);
    if (variant === 'sup') check.matches('opening', DECIMAL_3, NUMBER_3);
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
      .filter(node => node.type !== 'file' && !node.readOnly);
    const filledRows = rows => rows.filter(row => !isBlankRow(row)).map(partyForm.readRow);
    return {
      errors: check.errors,
      payload: {
        under: partyEl('under').value,
        details: Object.fromEntries(generalFields.map(node => [node.id.replace(`party-${variant}-`, ''), node.value.trim()])),
        contacts: filledRows(contacts),
        quotations: filledRows(partyForm.rowsOf('quotations')),
        orders: filledRows(partyForm.rowsOf('orders')),
        documents: docRows().map(readDocRow).map(({ file, type, expiry }) => ({ fileName: file.name, type, expiry })),
      },
    };
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
  initItemPage();
  for (const form of MASTER_FORMS) form.init();
  loadDashboard();
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
});
