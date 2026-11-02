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
      sameRow[0].node.focus();
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
  row[0].node.focus();
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
    if (currentPage === 'item' && !byId('quick-menu').open && handleItemPageKeys(event)) {
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
    if (isTextEntry(event.target)) return;  // let arrows move the caret while typing
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
   main-menu letter alone (M P T E R S) opens that sub-menu.
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

function openQuickMenu(view = 'main') {
  const menu = byId('quick-menu');
  if (!menu.open) {
    quickMenuReturnFocus = document.activeElement;
    document.documentElement.classList.add('has-modal');
    menu.showModal();
  }
  // Every view opens on its top entry (Create in sub-menus).
  showQuickMenuView(view);
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
  // On the dashboard, a main-menu letter on its own (M P T E R S) opens that sub-menu.
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
    quickMenuBack();
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
    if (event.target.closest('a.qm-item')) closeQuickMenu();
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
   Item Creation  (#/masters/item/new · Masters › Create › Item)
   Enter moves to the next field; Enter on a row's Batch Expiry adds a
   row. Shift+X (outside text fields) or Alt+A adds a row, Ctrl+S saves,
   Esc returns to the dashboard. Arrow keys move between table cells.
   ===================================================================== */

const ITEM_ROUTE = 'masters/item/new';
const DECIMAL_3 = /^\d{1,9}(\.\d{1,3})?$/;   // money and quantities: up to 3 decimals (OMR baisa)
const itemEl = suffix => byId(`item-${suffix}`);

function addSourceRow({ focus = true } = {}) {
  const row = byId('item-source-row-template').content.firstElementChild.cloneNode(true);
  itemEl('source-body').append(row);
  updateOpeningStockTotal();
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
  updateOpeningStockTotal();
  neighbour.querySelector('input').focus();
}

function updateOpeningStockTotal() {
  let total = 0;
  for (const input of itemEl('source-body').querySelectorAll('[data-field="openingStock"]')) {
    if (DECIMAL_3.test(input.value.trim())) total += Number(input.value);
  }
  itemEl('stock-total').textContent = total.toLocaleString('en-US', { maximumFractionDigits: 3 });
  itemEl('stock-unit').textContent = itemEl('unit').value.trim().toUpperCase();
}

function resetItemForm() {
  itemEl('form').reset();
  clearItemErrors();
  // Preview only; the server assigns the real code when the item is saved.
  itemEl('code').value = `ITM-${today.getFullYear()}-0001`;
  itemEl('source-body').replaceChildren();
  addSourceRow({ focus: false });
}

function clearItemErrors() {
  for (const node of itemEl('form').querySelectorAll('.is-invalid')) {
    node.classList.remove('is-invalid');
    node.removeAttribute('aria-invalid');
    node.removeAttribute('title');
  }
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
  clearItemErrors();
  const { errors } = readItemForm();
  if (errors.length) {
    for (const { node, message } of errors) {
      node.classList.add('is-invalid');
      node.setAttribute('aria-invalid', 'true');
      node.title = message;
    }
    errors[0].node.focus();
    showToast('Check the highlighted fields', errors[0].message, true);
    return;
  }
  // Backend not built yet: this becomes
  //   apiRequest('api/items.php', { method: 'POST', body: JSON.stringify(payload) })
  // and returns to the dashboard on success.
  showToast('Item details look good', 'Saving will work once the items API (api/items.php) is built.');
}

// Fields Enter walks through, in page order, ending on the Save button.
function itemEnterOrder() {
  const fields = [...itemEl('form').querySelectorAll('input:not([readonly]), select, textarea')]
    .filter(node => node.getClientRects().length > 0);
  return [...fields, itemEl('save')];
}

function focusField(node) {
  node.focus();
  if (node.select && node.type !== 'date') node.select();
}

// Keys for the item page. Returns true when handled.
function handleItemPageKeys(event) {
  const target = event.target;
  const key = event.key;
  const ctrl = event.ctrlKey && !event.metaKey;

  if (key === 'Escape' && !ctrl && !event.altKey) {
    event.preventDefault();
    if (event.repeat) return true;
    location.hash = '#/home';
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
    const order = itemEnterOrder();
    const next = order[order.indexOf(target) + 1];
    if (next) focusField(next); else saveItem();
    return true;
  }
  return false;
}

// Arrow keys inside the sourcing table: ↑/↓ same column in the row above/below
// (↓ on the last row adds one); ←/→ move cells once the caret is at the edge.
function handleSourceTableArrows(event) {
  const input = event.target;
  const row = input.closest('.fp-source-row');
  if (!row || input.tagName !== 'INPUT' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const rows = [...itemEl('source-body').rows];
  const cells = [...row.querySelectorAll('input')];
  const col = cells.indexOf(input);
  const cellAt = r => r.querySelectorAll('input')[col];
  const index = rows.indexOf(row);
  const caretAtStart = input.selectionStart == null || (input.selectionStart === 0 && input.selectionEnd === 0);
  const caretAtEnd = input.selectionEnd == null || input.selectionEnd === input.value.length;

  if (event.key === 'ArrowUp' && index > 0) {
    event.preventDefault(); focusField(cellAt(rows[index - 1]));
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    focusField(cellAt(index < rows.length - 1 ? rows[index + 1] : addSourceRow({ focus: false })));
  } else if (event.key === 'ArrowLeft' && col > 0 && caretAtStart) {
    event.preventDefault(); focusField(cells[col - 1]);
  } else if (event.key === 'ArrowRight' && col < cells.length - 1 && caretAtEnd) {
    event.preventDefault(); focusField(cells[col + 1]);
  }
}

function initItemPage() {
  itemEl('add-row').addEventListener('click', () => addSourceRow());
  itemEl('save').addEventListener('click', saveItem);
  itemEl('back').addEventListener('click', () => { location.hash = '#/home'; });
  itemEl('unit').addEventListener('input', updateOpeningStockTotal);
  itemEl('form').addEventListener('submit', event => event.preventDefault());
  itemEl('form').addEventListener('input', event => {
    if (event.target.dataset.field === 'openingStock') updateOpeningStockTotal();
    if (event.target.classList.contains('is-invalid')) {
      event.target.classList.remove('is-invalid');
      event.target.removeAttribute('aria-invalid');
      event.target.removeAttribute('title');
    }
  });
  const body = itemEl('source-body');
  body.addEventListener('click', event => {
    const del = event.target.closest('[data-action="delete-row"]');
    if (del) removeSourceRow(del.closest('tr'));
  });
  body.addEventListener('keydown', handleSourceTableArrows);
}

/* =====================================================================
   Hash router: #/home (dashboard) · #/masters/item/new (Item Creation).
   Routes for screens not built yet fall back to the dashboard.
   ===================================================================== */

let currentPage = 'dashboard';

function showPage(page) {
  currentPage = page;
  document.body.dataset.page = page;
  byId('dashboard-view').hidden = page !== 'dashboard';
  byId('item-page').hidden = page !== 'item';
}

function renderRoute() {
  const route = location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  if (route === ITEM_ROUTE) {
    if (currentPage !== 'item') {
      showPage('item');
      resetItemForm();
    }
    itemEl('name').focus();
    return;
  }
  const wasElsewhere = currentPage !== 'dashboard';
  showPage('dashboard');
  if (route !== '' && route !== 'home') {
    history.replaceState(null, '', '#/home');
    showToast('Not built yet', `The screen for “${route}” is coming soon.`);
  }
  if (wasElsewhere) focusPageAnchor();
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
  loadDashboard();
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
});
