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

// Grouped by module, each in its module colour: sales blue, purchase green, masters amber, employees violet.
const KPI_ICONS = {
  sales: '<path d="M3 17l6-6 4 4 8-8"></path><path d="M14 7h7v7"></path>',
  purchase: '<circle cx="9" cy="20" r="1.5"></circle><circle cx="18" cy="20" r="1.5"></circle><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"></path>',
  pending: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  items: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"></path><path d="m3 8 9 5 9-5M12 13v8"></path>',
  creditors: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path><path d="M15 18H9"></path><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"></path><circle cx="17" cy="18" r="2"></circle><circle cx="7" cy="18" r="2"></circle>',
  debtors: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>',
  employees: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
};
const KPI_TILES = [
  { key: 'totalSales', label: 'Total Sales', money: true, tone: 'sales', icon: 'sales' },
  { key: 'totalPurchase', label: 'Total Purchase', money: true, tone: 'purchase', icon: 'purchase' },
  { key: 'pendingPurchase', label: 'Pending Purchase', money: true, tone: 'purchase', icon: 'pending' },
  { key: 'totalItems', label: 'Total Items', money: false, tone: 'masters', icon: 'items' },
  { key: 'creditors', label: 'Creditors', money: true, tone: 'masters', icon: 'creditors' },
  { key: 'debtors', label: 'Debtors', money: true, tone: 'masters', icon: 'debtors' },
  { key: 'totalEmployees', label: 'Total Employees', money: false, tone: 'employee', icon: 'employees' },
];

function renderKpis(kpis) {
  const grid = byId('dashboard-kpis');
  grid.replaceChildren(...KPI_TILES.map(tile => {
    const card = el('div', `metric-card kpi-card tone-${tile.tone}`);
    const head = el('div', 'card-head');
    const icon = el('div', 'card-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${KPI_ICONS[tile.icon]}</svg>`;
    head.append(el('span', 'card-label', tile.label), icon);
    card.append(head, el('div', 'kpi-value', tile.money ? formatOmr(kpis[tile.key]) : formatCount(kpis[tile.key])));
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

// Module pills use the dashboard's module colours: sales blue, purchase green, masters amber, employees violet.
const MODULE_TONE_RULES = [[/sales|quotation|trade/i, 'blue'], [/purchase|grn/i, 'green'], [/master|supplier|customer|item|party/i, 'amber'], [/employee|staff|hr/i, 'violet']];
const moduleToneOf = name => MODULE_TONE_RULES.find(([re]) => re.test(String(name ?? '')))?.[1];
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
  const moduleTone = moduleToneOf(a.module);
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
    if (openSelect && isOpenSelect(openSelect)) {
      if (event.key === 'Enter' && openSelect.dataset.enterOpens !== undefined && openSelect.closest('form')) {
        setTimeout(() => { if (!isOpenSelect(openSelect)) focusNextField(openSelect); }, 0);
      }
      return;
    }

    // An open "Select …" popup takes every key; a lookup field's own keys come before the page's.
    if (byId('lookup').open) {
      handleLookupDialogKeys(event);
      event.stopPropagation();
      return;
    }
    if (handleSuggestKeys(event) || handleLookupFieldKeys(event)) {
      event.stopPropagation();
      return;
    }

    // The open form's own keys (Esc, Shift+Enter, Enter …) come first, unless the menu is over it.
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

// Shift+Enter saves the open form, from any field. Ctrl+S no longer saves; isBrowserSaveKey() lets the
// pages swallow it, so the browser's "Save page as" dialog does not open instead.
const isSaveKey = event => event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
const isBrowserSaveKey = event => (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's';

// ':open' (an open dropdown list) is recent: where the browser does not know it, matches() throws.
function isOpenSelect(select) {
  try { return select.matches(':open'); } catch { return false; }
}

// Name fields (input[data-upper]) hold capitals whatever the Caps Lock state; the caret stays where it was.
// Runs in the capture phase, before the forms record the edit for undo.
function initUppercaseFields() {
  document.addEventListener('input', event => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.dataset.upper === undefined) return;
    const upper = field.value.toUpperCase();
    if (upper === field.value) return;
    const { selectionStart, selectionEnd } = field;
    field.value = upper;
    field.setSelectionRange(selectionStart, selectionEnd);
  }, true);
}

// Characters a field does not take are dropped as they are typed or pasted (the caret stays where it was):
//   inputmode="numeric"  digits (Decimal Allowed, Credit Days, Total Items, Capacity)
//   inputmode="decimal"  digits and one decimal point (amounts, rates, stock, discount, conversion factor)
//   inputmode="tel"      digits, spaces, + - ( ) (phone numbers)
//   data-letters         letters of any language, spaces and . ' - (person names, designations, cities)
// Record names and codes are not filtered: they hold digits and symbols ("BALL VALVE 1/2\" SS316").
const INPUT_FILTERS = {
  numeric: /[0-9]/,
  decimal: /[0-9.]/,
  tel: /[0-9+\-\s()]/,
  letters: /[\p{L}\p{M}\s.'-]/u,
};
function initInputFilters() {
  document.addEventListener('input', event => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.type !== 'text') return;
    const kind = field.dataset.letters !== undefined ? 'letters' : field.inputMode;
    const allowed = INPUT_FILTERS[kind];
    if (!allowed) return;
    const caret = field.selectionStart ?? field.value.length;
    let kept = '', removedBeforeCaret = 0, seenDot = false;
    [...field.value].forEach((char, index) => {
      let ok = allowed.test(char);
      if (ok && kind === 'decimal' && char === '.') { ok = !seenDot; seenDot = true; }   // one decimal point
      if (ok) kept += char;
      else if (index < caret) removedBeforeCaret += char.length;
    });
    if (kept === field.value) return;
    field.value = kept;
    field.setSelectionRange(caret - removedBeforeCaret, caret - removedBeforeCaret);
  }, true);
}

// On the form pages a field that takes focus scrolls into view with room below it for its dropdown
// (scroll-margin in the CSS), so the next field is never hidden under the bottom of the screen.
function initFocusScrolling() {
  document.addEventListener('focusin', event => {
    const field = event.target;
    if (!(field instanceof Element) || !field.matches('input, select, textarea') || !field.closest('.form-page')) return;
    field.scrollIntoView({ block: 'nearest' });
  });
}

// Re-rendering replaces buttons; keep focus on the equivalent control.
function refocusWithin(container, selector) {
  const target = container.querySelector(selector);
  if (target) target.focus();
}

/* =====================================================================
   Quick menu (Ctrl+D) and its sub-menus
   One <dialog>: the main view plus one view per card (and nested views
   such as Masters › Create). ↑/↓ move through the view's entries and Quit
   (wrapping), Home/End jump to the first/last, → or Enter opens the focused
   entry's sub-menu, ← steps back one level (to the entry it came from).
   Esc steps back too; from the main menu it closes the menu.
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
  if (!event.altKey && !event.shiftKey && QUICK_MENU_NAV_KEYS.includes(key)) return handleQuickMenuArrows(event, key);
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

const QUICK_MENU_NAV_KEYS = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];

// Arrow keys in the open menu. They stay on the view's entries (never the Back / Close buttons in its
// header, which Tab still reaches). Every arrow is handled here, so the page's own arrow navigation
// never takes over inside the menu.
function handleQuickMenuArrows(event, key) {
  event.preventDefault();
  const view = quickMenuViewEl(quickMenuView);
  const entries = [...view.querySelectorAll('.qm-list .qm-item, .qm-quit')].filter(node => node.getClientRects().length > 0);
  if (entries.length === 0) return true;
  const index = entries.indexOf(document.activeElement);
  if (key === 'ArrowRight') {               // open the focused entry's sub-menu (links open with Enter)
    const opener = index === -1 ? null : entries[index].closest('[data-qm-open]');
    if (opener && !event.repeat) opener.click();
    return true;
  }
  if (key === 'ArrowLeft') {
    if (quickMenuView !== 'main' && !event.repeat) quickMenuBack();
    return true;
  }
  const last = entries.length - 1;
  const next = {
    ArrowDown: index === -1 ? 0 : (index + 1) % entries.length,
    ArrowUp: index === -1 ? last : (index - 1 + entries.length) % entries.length,
    Home: 0,
    End: last,
  }[key];
  entries[next].focus();
  entries[next].scrollIntoView({ block: 'nearest' });
  return true;
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
    // 'close' can arrive after an entry has opened a page and focused its first field: keep that focus.
    const active = document.activeElement;
    const pageTookFocus = active && active !== document.body && active !== byId('app') && !menu.contains(active);
    if (!pageTookFocus) {
      const target = quickMenuReturnFocus && document.contains(quickMenuReturnFocus) ? quickMenuReturnFocus : byId('app');
      target.focus({ preventScroll: true });
    }
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
  const fields = [...form.querySelectorAll('input:not([readonly]):not([disabled]):not([type="file"]), select:not([disabled]), textarea')]
    .filter(node => node.dataset.enterSkip === undefined)
    .filter(node => node.getClientRects().length > 0)
    .filter(node => !childLookupIsEmpty(node));
  return [...fields, saveButton];
}

// A child lookup (Subcategory under Category, Rack / Bin under Stock Point) has nothing to pick while its
// parent is empty, or when the parent's choice has no child rows (known once that list has loaded):
// Enter passes it by. Tab, arrows and clicks still reach it.
function childLookupIsEmpty(node) {
  const parent = isLookupField(node) ? lookupParentField(node) : null;
  if (!parent) return false;
  const parentId = lookupIdInput(parent)?.value;
  if (!parentId) return true;
  const rows = lookupCache[node.dataset.lookup];
  const key = LOOKUPS[node.dataset.lookup].parentKey;
  return Array.isArray(rows) && !rows.some(row => String(row[key]) === parentId);
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
  else if (node instanceof HTMLInputElement && node.list) showDropdown(node);
}

// Dropdowns on the forms: a <select>, or an input with a suggestion list (Inventory Status). Enter on one that
// has choices opens it; Enter again, once a choice is made, moves on to the next field. data-picker-open marks
// a dropdown that has been opened, until focus leaves it. A dropdown with nothing to choose just moves on.
function hasDropdownChoices(field) {
  if (field instanceof HTMLSelectElement) return [...field.options].some(option => option.value !== '' && !option.disabled);
  return field instanceof HTMLInputElement && Boolean(field.list?.options.length);
}
function showDropdown(field) {
  try { field.showPicker(); } catch { return false; }   // not supported: Space / Alt+↓ still open it
  field.dataset.pickerOpen = '';
  return true;
}
// Called on Enter: true when it opened the dropdown (the caller stays on the field).
function openDropdownOnEnter(field) {
  if (field.dataset.pickerOpen !== undefined || !hasDropdownChoices(field)) return false;
  return showDropdown(field);
}
document.addEventListener('focusout', event => { if (event.target instanceof HTMLElement) delete event.target.dataset.pickerOpen; });


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
     items.warehouse_id → warehouses (stock points), items.rack_id → rack_bins,
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
// The last two numbers are the fewest and most digits a phone number has after the calling code
// (PHONE_DIGITS in backend/src/master_validation.php is the same list).
  ['OM', 'Oman', 'OMR', '+968', 8, 8], ['AE', 'United Arab Emirates', 'AED', '+971', 8, 9], ['SA', 'Saudi Arabia', 'SAR', '+966', 8, 9],
  ['QA', 'Qatar', 'QAR', '+974', 8, 8], ['KW', 'Kuwait', 'KWD', '+965', 8, 8], ['BH', 'Bahrain', 'BHD', '+973', 8, 8], ['IN', 'India', 'INR', '+91', 10, 10],
  ['PK', 'Pakistan', 'PKR', '+92', 9, 10], ['EG', 'Egypt', 'EGP', '+20', 8, 10], ['JO', 'Jordan', 'JOD', '+962', 8, 9], ['TR', 'Türkiye', 'TRY', '+90', 10, 10],
  ['CN', 'China', 'CNY', '+86', 10, 11], ['JP', 'Japan', 'JPY', '+81', 9, 10], ['KR', 'South Korea', 'KRW', '+82', 8, 10], ['DE', 'Germany', 'EUR', '+49', 6, 11],
  ['IT', 'Italy', 'EUR', '+39', 6, 11], ['GB', 'United Kingdom', 'GBP', '+44', 9, 10], ['US', 'United States', 'USD', '+1', 10, 10],
].map(([code, name, currency, dial, min, max]) => ({ id: name, code, name, currency, dial, min, max }));
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

/* ---------- Email and phone checks ----------
   Fields with data-check="email" or data-check="phone" are checked when the user leaves them (marked red,
   with a message) and again on Save; the server repeats the same checks.
   A phone number must have the digits its country uses after the calling code (COUNTRIES min / max).
   The code comes from the field's calling-code dropdown, a "+code" typed in the number itself, or the
   country field named by data-country-field. data-allow-extension also takes a short extension (204). */

// Why a phone number is not valid for its country ('' when it is). Spaces, dashes, dots and brackets are fine;
// one leading 0 (a trunk prefix: "+971 050 …") is ignored.
function phoneProblem(value, dial, { allowExtension = false } = {}) {
  let text = String(value ?? '').trim();
  if (!text) return '';
  let country = COUNTRIES.find(entry => entry.dial === dial) || null;
  if (text.startsWith('+')) {
    country = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find(entry => text.startsWith(entry.dial)) || null;
    text = country ? text.slice(country.dial.length) : text.slice(1);
  }
  const digits = text.replace(/[\s\-().]/g, '');
  if (!/^\d+$/.test(digits)) return 'Use digits only (spaces and dashes are fine).';
  if (allowExtension && digits.length <= 5) return '';                 // an extension such as 204
  if (!country) return digits.length >= 6 && digits.length <= 15 ? '' : 'Enter 6 to 15 digits, or start with a country code such as +968.';
  const national = digits.length > country.max && digits.startsWith('0') ? digits.slice(1) : digits;
  if (national.length >= country.min && national.length <= country.max) return '';
  const range = country.min === country.max ? `${country.min} digits` : `${country.min} to ${country.max} digits`;
  return `Numbers in ${country.name} have ${range} after ${country.dial}.`;
}

const emailProblem = value => (!value.trim() || EMAIL.test(value.trim()) ? '' : 'Enter a valid email address, like name@company.com.');

// The calling code a phone field's number belongs to.
function phoneDialFor(field) {
  const code = field.closest('.fp-phone')?.querySelector('select[data-phone-code]');
  if (code) return code.value;
  const countryField = field.dataset.countryField && byId(field.dataset.countryField);
  return countryNamed(countryField?.value)?.dial || '';
}

// The message for a data-check field ('' when its value is fine or empty).
function fieldCheckProblem(field) {
  if (field.dataset.check === 'email') return emailProblem(field.value);
  if (field.dataset.check === 'phone') return phoneProblem(field.value, phoneDialFor(field), { allowExtension: field.dataset.allowExtension !== undefined });
  return '';
}

// Every failing data-check field of a form, for Save. Fields on the other side of the party form are skipped.
function fieldCheckErrors(form) {
  return [...form.querySelectorAll('[data-check]')]
    .filter(field => !field.disabled && !field.closest('[data-under][hidden]'))
    .map(field => ({ node: field, message: fieldCheckProblem(field) }))
    .filter(entry => entry.message);
}

function initFieldChecks() {
  document.addEventListener('focusout', event => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.dataset.check === undefined) return;
    // Moving between a number and its own calling code is not leaving the field.
    if (event.relatedTarget && field.closest('.fp-phone')?.contains(event.relatedTarget)) return;
    const message = fieldCheckProblem(field);
    if (message) {
      field.classList.add('is-invalid');
      field.setAttribute('aria-invalid', 'true');
      field.title = message;
      showToast(field.dataset.check === 'email' ? 'Check the email address' : 'Check the phone number', message, true);
    } else if (field.classList.contains('is-invalid')) {
      clearFieldError(field);
    }
  });
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
  warehouse: { title: 'Select Stock Point', letter: 'P', list: 'Stock Point List', plural: 'stock points', api: 'api/warehouses.php',
    columns: [['code', 'Code'], ['name', 'Stock Point Name'], ['type', 'Type']], display: codeAndName },
  rack: { title: 'Select Rack / Bin', letter: 'R', list: 'Rack / Bin List', plural: 'locations', api: 'api/rack-bins.php',
    columns: [['code', 'Location Code'], ['name', 'Location'], ['warehouseName', 'Warehouse']], display: row => row.code, parentKey: 'warehouseId' },
  item: { title: 'Select Item', letter: 'I', list: 'Item List', plural: 'items', api: 'api/items.php',
    columns: [['code', 'Code'], ['name', 'Item Name'], ['unit', 'Unit']], display: row => row.name },
  // Purchase Book rows: the Item Code cell searches codes (the name shows beside each).
  itemcode: { title: 'Select Item', letter: 'I', list: 'Item List', plural: 'items', api: 'api/items.php',
    columns: [['code', 'Code'], ['name', 'Item Name']], display: row => row.code, meta: row => row.name },
  purchaseorder: { title: 'Select Purchase Order', letter: 'P', list: 'Purchase Orders', plural: 'purchase orders', api: 'api/purchase-orders.php',
    columns: [['code', 'PO ID'], ['name', 'Supplier']], display: row => row.code, meta: row => row.name },
  country: { title: 'Select Country', letter: 'C', list: 'Country List', plural: 'countries', rows: () => COUNTRIES,
    columns: [['code', 'Code'], ['name', 'Country Name'], ['currency', 'Currency']], display: row => row.name },
};

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
// A field showing a saved record's code (data-record-code, the Edit pages) keeps it.
async function showNextCode(input, api) {
  input.placeholder = 'Loading…';
  try {
    const { code } = await apiRequest(`${api}?nextCode=1`);
    if (input.dataset.recordCode === undefined) input.value = code;
  } catch (error) {
    if (input.dataset.recordCode !== undefined) return;
    input.value = '';
    input.placeholder = 'Not available';
    showToast('The next code could not be loaded', error.message, true);
  }
}

// Shows a saved record's code in a form's code field (edit mode); clearRecordCode() hands it back to showNextCode.
function showRecordCode(input, code) {
  input.dataset.recordCode = code;
  input.value = code;
}
function clearRecordCode(input) {
  delete input.dataset.recordCode;
  input.value = '';
}

// Fills a lookup (or type-to-search) field and the hidden id beside it, without the change events.
function fillLookup(field, row) {
  const config = LOOKUPS[field.dataset.lookup ?? field.dataset.suggest];
  field.value = row ? config.display(row) : '';
  const hidden = lookupIdInput(field);
  if (hidden) hidden.value = row ? String(row.id) : '';
}

// Marks the fields a 422 response named; fieldNode(key) maps a payload key to its input.
function showServerErrors(error, fieldNode, reveal) {
  const errors = Object.entries(error.fields || {})
    .map(([key, message]) => ({ node: fieldNode?.(key), message }))
    .filter(entry => entry.node);
  if (errors.length) showFormErrors(errors, reveal);
  showToast('Could not save', error.message, true);
}

// Fields that pick into a list (chips) instead of holding one value: entry → { picked, apply, onClear }.
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
  // Chip fields pick several: every row is listed and the ones already picked start ticked.
  const chips = lookupChipFields.get(field);
  const multi = chips ? new Map(chips.picked().map(row => [String(row.id), row])) : null;

  Object.assign(lookup, { field, kind, rows, byKeyboard, multi });
  const currentId = lookupIdInput(field)?.value ?? field.value;
  // Fields without a hidden id (the master Edit pages) hold the shown name, so match on that.
  lookup.active = Math.max(0, rows.findIndex(row => String(row.id) === currentId
    || (!lookupIdInput(field) && config.display(row) === field.value)));
  byId('lookup-letter').textContent = config.letter;
  byId('lookup-title').textContent = config.title;
  byId('lookup-list-title').textContent = parentId ? `${config.list} · ${parent.value}` : config.list;
  byId('lookup-head').replaceChildren(...(multi ? [el('th', 'lk-check', '')] : []), ...config.columns.map(([, heading]) => el('th', '', heading)));
  byId('lookup-enter-hint').textContent = multi ? 'Tick / Untick' : 'Select';
  byId('lookup-cancel').textContent = multi ? 'Close' : 'Cancel';   // multi-select ticks are already applied
  byId('lookup-done-hint').hidden = !multi;
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
    if (lookup.multi) {
      const ticked = lookup.multi.has(String(row.id));
      tr.classList.toggle('is-picked', ticked);
      tr.setAttribute('aria-checked', String(ticked));
      const box = el('td', 'lk-check');
      box.append(el('span', 'lk-box'));
      tr.append(box);
    }
    config.columns.forEach(([key], column) => tr.append(el('td', column === 0 && !config.plainFirst ? 'lk-code' : '', String(row[key] ?? ''))));
    return tr;
  });
  if (rows.length === 0) {
    const tr = el('tr');
    const td = el('td', 'lk-empty', query ? `No ${config.plural} match “${query}”.` : `No ${config.plural} to choose from.`);
    td.colSpan = config.columns.length + (lookup.multi ? 1 : 0);
    tr.append(td);
    rows.push(tr);
  }
  byId('lookup-rows').replaceChildren(...rows);
  byId('lookup-count').textContent = query
    ? `${lookup.shown.length} of ${lookup.rows.length} ${config.plural}`
    : `${lookup.rows.length} ${config.plural}`;
  // Multi-select: Select applies the ticks (even none, which clears the field).
  byId('lookup-select').disabled = !lookup.multi && lookup.shown.length === 0;
  byId('lookup-select-label').textContent = lookup.multi ? `${config.title} (${lookup.multi.size})` : config.title;
  syncLookupActive();
}

// Multi-select: Enter or a click ticks the highlighted row, and again unticks it. The popup stays open,
// and the field shows the ticked rows straight away (kept ones first, in their order), so Esc, ✕,
// Close and Select all close it without losing a tick.
function toggleLookupRow() {
  const row = lookup.shown[lookup.active];
  if (!row) return;
  const id = String(row.id);
  if (lookup.multi.has(id)) lookup.multi.delete(id); else lookup.multi.set(id, row);
  lookupChipFields.get(lookup.field).apply([...lookup.multi.values()]);
  renderLookupRows();
}

// Multi-select: the Select button closes the popup and moves on to the next field.
function applyLookupMulti() {
  const { field } = lookup;
  closeLookup();
  focusNextField(field);
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
  if (lookup.multi) { toggleLookupRow(); return; }
  const row = lookup.shown[lookup.active];
  if (!row) return;
  const { field } = lookup;
  const moveOn = advance || lookup.byKeyboard;
  closeLookup();
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
  const search = byId('lookup-search');
  const [cancel, select] = [byId('lookup-cancel'), byId('lookup-select')];
  // Typing while a button has focus goes on in the search box (Space and Enter still press the button).
  if (target !== search && ((key.length === 1 && key !== ' ') || key === 'Backspace')) {
    event.preventDefault();
    search.focus();
    search.value = key === 'Backspace' ? search.value.slice(0, -1) : search.value + key;
    search.setSelectionRange(search.value.length, search.value.length);
    search.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  // On the Close / Select buttons: → Close to Select, ← Select to Close, ← from Close or ↑ back to the list.
  if (target !== search) {
    if (!key.startsWith('Arrow')) return;
    event.preventDefault();
    if (key === 'ArrowRight' && target === cancel && !select.disabled) select.focus();
    else if (key === 'ArrowLeft' && target === select) cancel.focus();
    else if ((key === 'ArrowLeft' && target === cancel) || key === 'ArrowUp') search.focus();
    else moveFocusByArrow(key);
    return;
  }
  // → leaves the list for the Close button, once the caret is at the end of the search text.
  if (key === 'ArrowRight' && search.selectionStart === search.value.length && search.selectionEnd === search.value.length) {
    event.preventDefault();
    cancel.focus();
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
    picked: () => [...picked],
    apply(rows) { clearFieldError(input); change(rows); },
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
    if (lookup.multi) toggleLookupRow();        // multi-select: each click ticks or unticks
    else if (event.detail >= 2) pickLookupRow();   // double-click picks
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {           // the backdrop, outside the panel
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeLookup();
      return;
    }
    const action = event.target.closest('[data-lookup-action]')?.dataset.lookupAction;
    if (action === 'cancel') closeLookup();
    else if (action === 'select') { if (lookup.multi) applyLookupMulti(); else pickLookupRow(); }
  });
}

/* =====================================================================
   Type-to-search dropdowns: input[data-suggest="KIND"] with a hidden id input and a <ul class="fp-suggest">
   list beside it (the Item form's Unit of Measure, the quotation rows' Unit). The list stays hidden until the user types: then it shows the KIND
   rows matching the text, names starting with it first ("P" → Pair, Packet, Pieces). ↓/↑ move, Enter or a
   click picks (the list closes and focus moves on), Esc or clearing the text closes it.
   Leaving the field takes an exact match; other text is cleared, or kept as typed with data-suggest-free
   (a quotation's unit may not be in the UOM master).
   Leaving the field keeps a picked row, takes an exact name match, or clears text that matches nothing.
   ===================================================================== */

const suggest = { field: null, rows: [], shown: [], active: 0, picking: false };
const isSuggestField = node => node instanceof HTMLInputElement && node.dataset.suggest !== undefined;
const suggestListOf = field => field.parentElement.querySelector('.fp-suggest');

async function openSuggest(field) {
  const rows = await loadLookup(field.dataset.suggest);
  if (document.activeElement !== field || field.value.trim() === '') return;   // only while there is typed text
  Object.assign(suggest, { field, rows, active: -1 });
  renderSuggest();
}

function closeSuggest() {
  const { field } = suggest;
  if (!field) return;
  suggestListOf(field).hidden = true;
  field.setAttribute('aria-expanded', 'false');
  field.removeAttribute('aria-activedescendant');
  suggest.field = null;
}

function renderSuggest() {
  const { field } = suggest;
  const config = LOOKUPS[field.dataset.suggest];
  const pickedId = lookupIdInput(field).value;
  // A field still showing its picked row lists everything, with that row highlighted.
  const query = pickedId ? '' : field.value.trim().toLowerCase();
  const name = row => config.display(row).toLowerCase();
  const code = row => String(row.code ?? '').toLowerCase();
  // Names starting with the text ("P" → Pair, Packet, Pieces); only when none do, names or codes containing it.
  const starting = suggest.rows.filter(row => name(row).startsWith(query));
  suggest.shown = !query ? suggest.rows
    : starting.length ? starting
    : suggest.rows.filter(row => name(row).includes(query) || code(row).includes(query));
  if (suggest.active < 0) suggest.active = Math.max(0, suggest.shown.findIndex(row => String(row.id) === pickedId));
  suggest.active = Math.min(suggest.active, Math.max(0, suggest.shown.length - 1));
  const list = suggestListOf(field);
  list.replaceChildren(...suggest.shown.map((row, index) => {
    const item = el('li', 'fp-suggest-item');
    item.id = `${field.id || 'suggest'}-option-${index}`;
    item.dataset.index = String(index);
    item.setAttribute('role', 'option');
    item.append(el('span', 'fp-suggest-name', config.display(row)));
    const meta = config.meta ? config.meta(row) : row.code;   // e.g. the item name beside a searched code
    if (meta) item.append(el('span', 'fp-suggest-code', meta));
    return item;
  }));
  if (suggest.shown.length === 0) list.append(el('li', 'fp-suggest-empty', `No ${config.plural} match “${field.value.trim()}”.`));
  list.hidden = false;
  field.setAttribute('aria-expanded', 'true');
  syncSuggestActive();
}

function syncSuggestActive() {
  const { field } = suggest;
  for (const item of suggestListOf(field).querySelectorAll('[data-index]')) {
    const active = Number(item.dataset.index) === suggest.active;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', String(active));
    if (active) {
      field.setAttribute('aria-activedescendant', item.id);
      item.scrollIntoView({ block: 'nearest' });
    }
  }
}

function pickSuggest(row, { advance = false } = {}) {
  const { field } = suggest;
  fillLookup(field, row);
  clearFieldError(field);
  closeSuggest();
  // Let the form record the pick (undo); the field's own input handler ignores it.
  suggest.picking = true;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  suggest.picking = false;
  if (advance) focusNextField(field);
}

// Leaving the field: keep a picked row, take an exact name or code match, or clear what matches nothing.
async function settleSuggest(field) {
  if (lookupIdInput(field).value || !field.value.trim()) { if (!field.value.trim()) fillLookup(field, null); return; }
  const config = LOOKUPS[field.dataset.suggest];
  const rows = await loadLookup(field.dataset.suggest);
  const match = rows.find(row => sameText(config.display(row), field.value) || sameText(String(row.code ?? ''), field.value));
  if (match) fillLookup(field, match);
  else if (field.dataset.suggestFree === undefined) fillLookup(field, null);   // free fields keep the typed text
}

// Keys on a type-to-search field. Returns true when handled.
function handleSuggestKeys(event) {
  const field = event.target;
  if (!isSuggestField(field) || event.ctrlKey || event.metaKey || event.altKey) return false;
  const open = suggest.field === field;
  const { key } = event;
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    if (!open) return false;                                 // no list: the arrows move between fields
    event.preventDefault();
    if (suggest.shown.length) {
      suggest.active = Math.min(suggest.shown.length - 1, Math.max(0, suggest.active + (key === 'ArrowDown' ? 1 : -1)));
      syncSuggestActive();
    }
    return true;
  }
  if (key === 'Enter' && !event.shiftKey && open && suggest.shown[suggest.active]) {
    event.preventDefault();
    if (!event.repeat) pickSuggest(suggest.shown[suggest.active], { advance: true });
    return true;
  }
  if (key === 'Escape' && open) {
    event.preventDefault();
    closeSuggest();
    return true;
  }
  return false;
}

function initSuggestFields() {
  document.addEventListener('input', event => {
    const field = event.target;
    if (!isSuggestField(field) || suggest.picking) return;
    lookupIdInput(field).value = '';                          // typed text: nothing picked until a row is chosen
    if (field.value.trim() === '') closeSuggest();           // cleared: hide the list again
    else if (suggest.field === field) { suggest.active = 0; renderSuggest(); } else openSuggest(field);
  });
  document.addEventListener('focusout', event => {
    const field = event.target;
    if (!isSuggestField(field)) return;
    setTimeout(() => {
      if (document.activeElement === field) return;
      if (suggest.field === field) closeSuggest();
      settleSuggest(field);
    }, 0);
  });
  // On the document, so lists in table rows added later work too.
  document.addEventListener('mousedown', event => {
    if (event.target.closest?.('.fp-suggest')) event.preventDefault();   // keep focus (and typing) in the field
  });
  document.addEventListener('click', event => {
    const item = event.target.closest?.('.fp-suggest [data-index]');
    if (item && suggest.field) pickSuggest(suggest.shown[Number(item.dataset.index)]);
  });
}

/* =====================================================================
   Item Creation  (#/masters/item/new · Masters › Create › Item), and Edit Item (#/masters/item/edit/<id>)
   Enter moves to the next field; Enter on a row's Batch Expiry adds a
   row. Shift+X (outside text fields, or anywhere in the sourcing table) or Alt+A adds a row,
   Shift+Enter saves, Esc goes back to the previous page. Arrow keys move between table cells.
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

let itemEditing = null;                     // { id } while an item is being edited; null on Item Creation

function resetItemForm() {
  itemEditing = null;
  itemEl('form').reset();
  clearLookupIds(itemEl('form'));
  clearFormErrors(itemEl('form'));
  clearRecordCode(itemEl('code'));
  showNextCode(itemEl('code'), 'api/items.php');
  itemEl('title').textContent = 'Item Creation';
  itemEl('save-label').textContent = 'Save Item Record';
  itemEl('source-body').replaceChildren();
  addSourceRow({ focus: false });
  // Enter skips Subcategory / Rack when the chosen category / stock point has none: that needs these lists.
  loadLookup('subcategory');
  loadLookup('rack');
}

// Edit Item: the creation form filled with the saved item; Save updates it.
async function editItem(id) {
  resetItemForm();
  itemEditing = { id };
  itemEl('title').textContent = 'Edit Item';
  itemEl('save-label').textContent = 'Update Item Record';
  let item;
  try {
    item = await apiRequest(`api/items.php?id=${id}`);
  } catch (error) {
    showToast('The item could not be opened', error.message, true);
    goBack();
    return;
  }
  if (itemEditing?.id !== id) return;          // another page was opened meanwhile
  showRecordCode(itemEl('code'), item.code);
  itemEl('name').value = item.name;
  fillLookup(itemEl('uom'), item.uomId && { id: item.uomId, name: item.unit });
  fillLookup(itemEl('category'), item.categoryId && { id: item.categoryId, name: item.category });
  fillLookup(itemEl('subcategory'), item.subCategoryId && { id: item.subCategoryId, name: item.subCategory });
  fillLookup(itemEl('warehouse'), item.warehouseId && { id: item.warehouseId, code: item.warehouseCode, name: item.warehouseName });
  fillLookup(itemEl('rack'), item.rackId && { id: item.rackId, code: item.rackCode });
  itemEl('comments').value = item.description;
  itemEl('status').value = item.status;
  itemEl('image-link').value = item.imagePath;
  itemEl('supplier-url').value = item.webLink;
  if (item.sourcing.length) itemEl('source-body').replaceChildren();
  item.sourcing.forEach((source, index) => {
    const row = addSourceRow({ focus: false });
    const cell = field => row.querySelector(`[data-field="${field}"]`);
    fillLookup(cell('brand'), source.brandId && { id: source.brandId, name: source.brandName });
    fillLookup(cell('supplier'), source.supplierId && { id: source.supplierId, name: source.supplierName });
    cell('cost').value = source.cost ?? '';
    if (index === 0) {                          // selling price and opening stock are kept per item
      cell('sellingPrice').value = item.sellingPrice ?? '';
      cell('openingStock').value = item.availableStock ?? '';
    }
  });
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
  itemName: 'name', uomId: 'uom', categoryId: 'category', subCategoryId: 'subcategory',
  warehouseId: 'warehouse', rackId: 'rack', status: 'status', comments: 'comments', imageLink: 'image-link', supplierUrl: 'supplier-url',
};
let itemSaving = false;

async function saveItem() {
  if (itemSaving) return;
  closeSuggest();
  for (const field of itemEl('form').querySelectorAll('[data-suggest]')) await settleSuggest(field);
  clearFormErrors(itemEl('form'));
  const { payload, errors } = readItemForm();
  if (errors.length) {
    showFormErrors(errors);
    return;
  }
  itemSaving = true;
  itemEl('save').disabled = true;
  const editing = itemEditing;
  try {
    const item = await apiRequest(editing ? `api/items.php?id=${editing.id}` : 'api/items.php', { method: editing ? 'PUT' : 'POST', json: payload });
    forgetLookups('item');
    showToast(editing ? 'Item updated' : 'Item saved', `${item.code} · ${item.name}`);
    if (showSavedInList('masters/item', item.code, { edited: Boolean(editing) })) return;
    resetItemForm();                       // opened from Masters › Create: stay for the next item
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
    goBack();
    return true;
  }
  if (isSaveKey(event)) {
    event.preventDefault();
    if (!event.repeat) saveItem();
    return true;
  }
  if (isBrowserSaveKey(event)) { event.preventDefault(); return true; }
  // Shift+X adds a row, except in text fields outside the sourcing table, where X is something you'd type.
  const typingText = target.tagName === 'INPUT' && target.type === 'text' && !target.inputMode && !target.closest('.fp-source-row');
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
    if (openDropdownOnEnter(target)) return true;
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
   #KEY-back and #KEY-save. Enter moves to the next field (textareas with
   data-enter-newline take Enter themselves, and dropdowns with
   data-enter-opens open on it; other dropdowns with choices open on the
   first Enter and move on with the next), Shift+Enter saves, Ctrl+Z undoes the last edit (including added and removed
   rows), Shift+X or Alt+A adds a row (Shift+X also inside a row table's
   text cells; type a capital X there with Caps Lock), Esc goes back to the
   previous page.
   Each page also edits saved records (#/masters/<list>/edit/<id>): edit(id)
   fills the form through config.fill(record) and Save sends PUT ?id=.
   ===================================================================== */

const FORM_KEY_HANDLERS = { item: handleItemPageKeys };
const FORM_PAGES = {};
const FORM_EDIT_GROUP_MS = 800;               // quick typing in one field undoes as one step
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;   // name@domain.tld
const WHOLE_NUMBER = /^\d{1,12}$/;
const DECIMAL_2 = /^\d{1,3}(\.\d{1,2})?$/;

// config: key, route, noun, api, listRoute (the list page a save returns to), code(), firstField,
// read() → { payload, errors }, fill(record) (edit mode),
// optional lists { name: { body, template, initial, label(i), defaults() } }, extra { read, write, reset },
// onEnter(event), refresh(), onReset(), afterRestore(), reveal(node), addRowList(), init().
function createFormPage(config) {
  const el = suffix => byId(`${config.key}-${suffix}`);
  const lists = config.lists || {};
  let history = [];                           // states before each edit, newest last
  let current = null;
  let lastEdit = { key: null, time: 0 };
  let editing = null;                         // { id } while a saved record is open; null while creating
  const noun = () => (typeof config.noun === 'function' ? config.noun() : config.noun);
  const baseApi = () => (typeof config.api === 'function' ? config.api() : config.api);
  const titles = { create: el('title').textContent, save: el('save-label').textContent };

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

  // Replaces a list's rows (edit mode); an empty list keeps one blank row.
  function setRows(name, valuesList) {
    byId(lists[name].body).replaceChildren();
    for (const values of valuesList) appendRow(name, values);
    if (valuesList.length === 0) appendRow(name);
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

  function showMode() {
    el('title').textContent = editing ? `Edit ${noun()}` : titles.create;
    el('save-label').textContent = editing ? `Update ${noun()} Record` : (config.saveLabel?.() ?? titles.save);
  }

  function reset() {
    editing = null;
    el('form').reset();
    clearLookupIds(el('form'));
    clearFormErrors(el('form'));
    for (const code of el('form').querySelectorAll('[data-record-code]')) clearRecordCode(code);
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
    showMode();
  }

  // Opens a saved record: prepare() runs after the reset (e.g. the party form's Creditors / Debtors).
  async function edit(id, prepare) {
    reset();
    prepare?.();
    editing = { id };
    showMode();
    let record;
    try {
      record = await apiRequest(`${baseApi()}?id=${id}`);
    } catch (error) {
      showToast(`The ${noun().toLowerCase()} could not be opened`, error.message, true);
      goBack();
      return;
    }
    if (editing?.id !== id) return;           // another page was opened meanwhile
    config.fill(record);
    history = [];
    lastEdit = { key: null, time: 0 };
    current = snapshot();
    syncUndoButton();
    refresh();
    showMode();
  }

  let saving = false;
  async function save() {
    if (saving) return;
    clearFormErrors(el('form'));
    const { payload, errors } = config.read();
    errors.push(...fieldCheckErrors(el('form')));      // email and phone fields (data-check)
    if (errors.length) {
      showFormErrors(errors, config.reveal);
      return;
    }
    saving = true;
    el('save').disabled = true;
    const wasEditing = editing;
    try {
      const record = wasEditing
        ? await apiRequest(`${baseApi()}?id=${wasEditing.id}`, { method: 'PUT', json: payload })
        : await apiRequest(baseApi(), { method: 'POST', json: payload });
      const warning = await config.afterSave?.(record);   // e.g. upload the party's documents; a message if that failed
      forgetLookups(...(config.lookups || []));
      if (warning) showToast(`${record.code} saved, but its documents were not uploaded`, warning, true);
      else showToast(`${noun()} ${wasEditing ? 'updated' : 'saved'}`, `${record.code} · ${record.name}`);
      const listRoute = typeof config.listRoute === 'function' ? config.listRoute() : config.listRoute;
      // Pages without a list (the Purchase Book documents) always stay for the next record.
      if (listRoute && showSavedInList(listRoute, record.code, { edited: Boolean(wasEditing) })) return;
      reset();                             // opened from Masters › Create: stay for the next record
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
      if (!event.repeat) goBack();
      return true;
    }
    if (isSaveKey(event)) {
      event.preventDefault();
      if (!event.repeat) save();
      return true;
    }
    if (isBrowserSaveKey(event)) {
      event.preventDefault();                 // the browser's "Save page"; pages with ctrlSave save the form instead
      if (config.ctrlSave && !event.repeat) save();
      return true;
    }
    if (plainCtrl && key.toLowerCase() === 'z') {
      event.preventDefault();                 // the form's undo replaces the browser's per-field one
      undo();
      return true;
    }
    const list = config.addRowList?.();
    if (list) {
      // Shift+X adds a row, except in text fields outside the row table, where X is something you'd type.
      const inRows = Boolean(target.closest?.('.fp-row')) && byId(lists[list].body).contains(target);
      const typingText = isTextEntry(target) && !target.inputMode && target.type !== 'date' && !inRows;
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
      if (target.dataset.enterOpens) {        // a dropdown that always opens on Enter (Enter passes it by in the order)
        try { target.showPicker(); } catch { /* unsupported: Space still works */ }
        return true;
      }
      if (openDropdownOnEnter(target)) return true;   // other dropdowns: Enter opens, Enter again moves on
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

  const page = { reset, init, record, absorb, addRow, rowsOf, appendRow, readRow, setRows, edit, el, isEditing: () => editing !== null };
  FORM_KEY_HANDLERS[config.key] = handleKeys;
  FORM_PAGES[config.route] = { page: config.key, reset, firstField: config.firstField, isEditing: page.isEditing };
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
  key: 'uom', route: 'masters/uom/new', listRoute: 'masters/uom', noun: 'UOM', api: 'api/uoms.php', lookups: ['uom'],
  firstField: () => uomEl('name'),
  setCode: () => showNextCode(uomEl('code'), 'api/uoms.php'),
  fieldNodes: {
    unitName: () => uomEl('name'), decimalAllowed: () => uomEl('decimals'), status: () => uomEl('status'),
    conversionBaseId: () => uomEl('base'), conversionFactor: () => uomEl('factor'), description: () => uomEl('description'),
  },
  // Only the name is required. Blank decimals save 0, a blank factor 1.0000 (the server's defaults).
  read() {
    const check = formChecks(uomEl);
    check.required('name', 'Unit of measure');
    const decimals = check.text('decimals');
    if (decimals !== '' && (!/^\d+$/.test(decimals) || Number(decimals) > UOM_MAX_DECIMALS)) {
      check.fail(uomEl('decimals'), `Decimal allowed must be a whole number from 0 to ${UOM_MAX_DECIMALS}.`);
    }
    const factor = check.text('factor');
    if (factor !== '' && !isValidUomFactor(factor)) check.fail(uomEl('factor'), 'Conversion factor must be above 0, with up to 4 decimals.');
    return {
      errors: check.errors,
      payload: {
        unitName: check.text('name'), decimalAllowed: decimals, status: check.text('status'),
        // No base unit: this unit is a base unit itself.
        conversionBaseId: check.text('base-id') === '' ? null : Number(check.text('base-id')),
        conversionFactor: factor, description: check.text('description'),
      },
    };
  },
  fill(uom) {
    showRecordCode(uomEl('code'), uom.code);
    uomEl('name').value = uom.name;
    uomEl('decimals').value = String(uom.decimalAllowed);
    uomEl('status').value = uom.status;
    fillLookup(uomEl('base'), uom.conversionBaseId && { id: uom.conversionBaseId, name: uom.baseName });
    uomEl('factor').value = uom.conversionFactor;
    uomEl('description').value = uom.description;
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
  key: 'brand', route: 'masters/brand/new', listRoute: 'masters/brand', noun: 'Brand', api: 'api/brands.php', lookups: ['brand'],
  firstField: () => brandEl('name'),
  setCode: () => showNextCode(brandEl('code'), 'api/brands.php'),
  fieldNodes: { brandName: () => brandEl('name'), status: () => brandEl('status'), itemIds: () => brandItems.input },
  extra: { read: brandItems.get, write: brandItems.set, reset: () => brandItems.set([]) },
  extraFocus: () => brandItems.input,
  read() {
    const check = formChecks(brandEl);
    check.required('name', 'Brand name');
    return {
      errors: check.errors,
      payload: {
        brandName: check.text('name'), status: check.text('status'), description: check.text('description'),
        itemIds: brandItems.ids(),
      },
    };
  },
  fill(brand) {
    showRecordCode(brandEl('code'), brand.code);
    brandEl('name').value = brand.name;
    brandEl('status').value = brand.status;
    brandItems.set(brand.items);
  },
});

/* ---------- Category Creation  (#/masters/category/new) ---------- */

const categoryEl = suffix => byId(`category-${suffix}`);
const categoryForm = createFormPage({
  key: 'category', route: 'masters/category/new', listRoute: 'masters/category', noun: 'Category', api: 'api/categories.php', lookups: ['category', 'subcategory'],
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
    const filled = categoryForm.rowsOf('subcategories').filter(row => !isBlankRow(row));
    return {
      errors: check.errors,
      payload: {
        categoryName: check.text('name'), status: check.text('status'), description: check.text('description'),
        subcategories: filled.map(row => row.querySelector('input').value.trim()),
      },
    };
  },
  fill(category) {
    showRecordCode(categoryEl('code'), category.code);
    categoryEl('name').value = category.name;
    categoryEl('status').value = category.status;
    categoryForm.setRows('subcategories', category.subcategories.map(sub => ({ name: sub.name })));
  },
});

/* ---------- Stock Point Creation  (#/masters/stock-point/new). Ids keep the "warehouse" prefix: the table is warehouses. ---------- */

const warehouseEl = suffix => byId(`warehouse-${suffix}`);
const warehouseItems = createLookupChips({ container: 'warehouse-chips', entry: 'warehouse-item-entry', onChange: () => warehouseForm.record() });

const warehouseForm = createFormPage({
  key: 'warehouse', route: 'masters/stock-point/new', listRoute: 'masters/stock-point', noun: 'Stock Point', api: 'api/warehouses.php', lookups: ['warehouse', 'item'],
  firstField: () => warehouseEl('name'),
  setCode: () => showNextCode(warehouseEl('code'), 'api/warehouses.php'),
  fieldNodes: Object.fromEntries([
    ['warehouseName', 'name'], ['type', 'type'], ['address', 'address'], ['country', 'country'], ['city', 'city'],
    ['contactPerson', 'contact'], ['phone', 'phone'], ['email', 'email'], ['manager', 'manager'], ['capacity', 'capacity'],
    ['status', 'status'], ['remarks', 'remarks'], ['itemIds', 'item-entry'],
  ].map(([key, suffix]) => [key, () => warehouseEl(suffix)])),
  extra: { read: warehouseItems.get, write: warehouseItems.set, reset: () => warehouseItems.set([]) },
  extraFocus: () => warehouseItems.input,
  // Only the name is required (the code is automatic); every other field is optional.
  read() {
    const check = formChecks(warehouseEl);
    check.required('name', 'Stock point name');
    check.matches('capacity', WHOLE_NUMBER, 'Total storage capacity must be a whole number.');
    return {
      errors: check.errors,
      payload: {
        warehouseName: check.text('name'), type: check.text('type'), address: check.text('address'), country: check.text('country'), city: check.text('city'),
        contactPerson: check.text('contact'), phone: check.text('phone'), email: check.text('email'), manager: check.text('manager'),
        itemIds: warehouseItems.ids(), capacity: check.text('capacity'), status: check.text('status'), remarks: check.text('remarks'),
      },
    };
  },
  fill(point) {
    showRecordCode(warehouseEl('code'), point.code);
    const values = { name: point.name, address: point.address, country: point.country, city: point.city, contact: point.contactPerson,
      phone: point.phone, email: point.email, manager: point.manager, capacity: point.capacity ?? '', status: point.status, remarks: point.remarks };
    for (const [suffix, value] of Object.entries(values)) warehouseEl(suffix).value = value;
    warehouseEl('type').value = ['Office', 'Warehouse', 'Shop'].includes(point.type) ? point.type : 'Warehouse';
    warehouseItems.set(point.items);
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
// Until Creditors or Debtors is chosen, the page shows only the Under box (data-pending; see CSS).
function syncPartyVariant() {
  const under = partyEl('under').value;
  partyEl('form').toggleAttribute('data-pending', under === '');
  for (const panel of partyEl('form').querySelectorAll('[data-under]')) panel.hidden = panel.dataset.under !== under;
  for (const label of partyEl('page').querySelectorAll('[data-creditors]')) label.textContent = label.dataset[under || 'creditors'];
  partyEl('save-label').textContent = partySaveLabel();
  const noun = under === 'debtors' ? 'Customer' : 'Supplier';
  if (partyForm?.isEditing()) partyEl('title').textContent = `Edit ${noun}`;
  else if (partyEl('form').hasAttribute('data-fixed-under')) partyEl('title').textContent = `${noun} Creation`;
}
const partySaveLabel = () => `${partyForm?.isEditing() ? 'Update' : 'Save'} ${partyEl('under').value === 'debtors' ? 'Customer' : 'Supplier'} Record`;

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

// Spreadsheet rows (Excel or CSV) as quotation rows. The header row is the first of the top five naming two
// known columns (Item Name, Description, Unit, Rate, Delivery Time, Warranty); without one the columns are
// read in that order and only rows with a numeric rate count.
function quotationRowsFromSheet(sheet) {
  const headerIndex = sheet.slice(0, 5).findIndex(cells => cells.filter(headerKey).length >= 2);
  const columns = headerIndex === -1 ? QUOTE_COLUMNS : sheet[headerIndex].map(headerKey);
  const rows = [];
  for (const cells of sheet.slice(headerIndex + 1)) {
    const row = {};
    columns.forEach((column, index) => {
      const value = String(cells[index] ?? '').trim();
      if (column && value) row[column] = value;
    });
    if (/^\d+(\.\d+)?$/.test(row.rate || '')) row.rate = String(Number(Number(row.rate).toFixed(3)));   // spreadsheet floats
    if (Object.keys(row).length && (headerIndex !== -1 || /^\d+(\.\d+)?$/.test(row.rate || ''))) rows.push(row);
  }
  return rows;
}

function addParsedQuotations(rows, sourceName) {
  if (rows.length === 0) {
    showToast('No items found', `Nothing could be read from ${sourceName}. Use columns Item Name, Description, Unit, Rate, Delivery Time and Warranty.`, true);
    return false;
  }
  const existing = partyForm.rowsOf('quotations');
  for (const row of existing) if (isBlankRow(row)) row.remove();   // parsed rows take the place of blank ones
  for (const row of rows) partyForm.appendRow('quotations', row);
  partyForm.record();
  showToast('Quotation read', `${rows.length} item${rows.length === 1 ? '' : 's'} added from ${sourceName}. Check them before saving.`);
  return true;
}

// Excel (.xlsx), CSV, TXT and JSON are read into the table. PDF and Word layouts cannot be read reliably
// in the browser, so they get a message saying what to do instead.
async function readQuotationFile(file) {
  const extension = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  if (['pdf', 'doc', 'docx'].includes(extension)) {
    showToast('This file cannot be read automatically',
      'PDF and Word quotations cannot be read. Save the quotation as Excel (.xlsx) or CSV, or paste its lines into Attach & Parse Email.', true);
    return;
  }
  if (['xlsx', 'xls', 'csv'].includes(extension)) {
    try {
      addParsedQuotations(quotationRowsFromSheet(await readSpreadsheet(file)), file.name);
    } catch (error) {
      showToast('Could not read the file', error.message || 'The file could not be read.', true);
    }
    return;
  }
  if (!['json', 'txt'].includes(extension)) {
    showToast('File type not supported', 'Use an Excel (.xlsx), CSV, TXT or JSON quotation.', true);
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

/* Document Upload tab. New files are uploaded after the record is saved; stored ones (edit mode) come from the server. */
const DOC_MAX_BYTES = 10 * 1024 * 1024;
const DOC_KINDS = { pdf: ['PDF', 'pdf'], jpg: ['JPG', 'image'], jpeg: ['JPG', 'image'], png: ['PNG', 'image'], doc: ['DOC', 'word'], docx: ['DOC', 'word'], xls: ['XLS', 'excel'], xlsx: ['XLS', 'excel'] };
const DOCS_WITHOUT_EXPIRY = ['VAT Certificate'];
const docFiles = new WeakMap();               // table row → { file, uploadedOn } for a new file, { stored, uploadedOn } for a saved one
const docName = doc => doc.file?.name ?? doc.stored.originalName;
const docSize = doc => doc.file?.size ?? doc.stored.size;
const docExtension = name => name.split('.').pop().toLowerCase();
const partyOwner = () => (partyVariant() === 'cus' ? 'customer' : 'supplier');
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

function createDocRow({ file, stored, uploadedOn, type = '', expiry = '' }) {
  const row = byId('party-doc-row').content.firstElementChild.cloneNode(true);
  const name = docName({ file, stored });
  const [badge, kind] = DOC_KINDS[docExtension(name)] || ['FILE', 'other'];
  const badgeEl = row.querySelector('[data-doc-badge]');
  badgeEl.textContent = badge;
  badgeEl.dataset.kind = kind;
  row.querySelector('[data-doc-name]').textContent = name;
  const size = docSize({ file, stored });
  row.querySelector('[data-doc-size]').textContent = size == null ? (stored ? 'Saved' : '') : `${formatFileSize(size)}${stored ? ' · saved' : ''}`;
  const typeSelect = row.querySelector('[data-field="type"]');
  if (type && ![...typeSelect.options].some(option => option.value === type)) typeSelect.append(new Option(type, type));
  typeSelect.value = type;
  row.querySelector('[data-field="expiry"]').value = expiry;
  row.querySelector('[data-field="uploadedOn"]').value = formatDate(uploadedOn);
  docFiles.set(row, { file, stored, uploadedOn });
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
  const isDuplicate = file => current.some(doc => docName(doc) === file.name && docSize(doc) === file.size);
  const accepted = [];
  const rejected = [];
  for (const file of files) {
    if (!DOC_KINDS[docExtension(file.name)]) rejected.push(`${file.name} is not a supported file type.`);
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
  const { file, stored } = docFiles.get(row);
  if (stored) {                                // a saved document: the server sends it as a download
    window.open(`api/${partyOwner()}-documents.php?id=${stored.id}`, '_blank', 'noopener');
    return;
  }
  const url = URL.createObjectURL(file);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);   // long enough for the new tab to load it
}

// supplier_brands: the brands this supplier sells.
const supplierBrands = createLookupChips({ container: 'party-sup-brands', entry: 'party-sup-brand-entry', onChange: () => partyForm.record() });

const partyForm = createFormPage({
  key: 'party', route: 'masters/party/new', noun: () => (partyVariant() === 'cus' ? 'Customer' : 'Supplier'), lookups: ['supplier'],
  listRoute: () => (partyVariant() === 'cus' ? 'masters/customer' : 'masters/supplier'),
  // Creditors are suppliers, debtors are customers: each has its own table and endpoint.
  api: () => (partyVariant() === 'cus' ? 'api/customers.php' : 'api/suppliers.php'),
  saveLabel: partySaveLabel,
  // New documents (with their type and expiry) and customer agreements are uploaded once the record is saved.
  async afterSave(record) {
    const uploads = [
      ...docRows().map(readDocRow).filter(doc => doc.file).map(doc => ({ file: doc.file, type: doc.type, expiry: doc.expiry })),
      ...(partyVariant() === 'cus' ? partyFiles.agreements.map(file => ({ file, type: 'Agreement', expiry: '' })) : []),
    ];
    if (uploads.length === 0) return;
    const owner = partyOwner();
    const form = new FormData();
    form.append(`${owner}Id`, String(record.id));
    for (const { file, type, expiry } of uploads) {
      form.append('files[]', file, file.name);
      form.append('types[]', type);
      form.append('expiries[]', expiry);
    }
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
    ['phone', () => `${partyVariant()}-mobile`], ['telephone', () => `${partyVariant()}-phone`],
    ['taxRegNo', () => `${partyVariant()}-tax`], ['debitLimit', 'sup-credit-limit'], ['debitDays', 'sup-credit-days'],
    ['openingBalance', 'sup-opening'], ['paymentTerms', 'sup-terms'], ['currency', 'sup-currency'], ['brandIds', 'sup-brand-entry'],
    ['creditLimit', 'cus-credit-limit'], ['creditDays', 'cus-credit-days'], ['discountPercent', 'cus-discount'],
  ].map(([key, suffix]) => [key, () => partyEl(typeof suffix === 'function' ? suffix() : suffix)])),
  firstField: () => (partyEl('under').value ? partyEl(`${partyVariant()}-name`) : partyEl('under')),
  setCode() {
    showNextCode(partyEl('sup-code'), 'api/suppliers.php');
    showNextCode(partyEl('cus-code'), 'api/customers.php');
  },
  lists: {
    // One contact row to start; Add Row (Shift+X) adds more.
    supplierContacts: { body: 'party-sup-contacts', template: 'party-contact-row', initial: 1, label: index => String(index + 1).padStart(2, '0'),
      defaults: () => ({ mobileCode: partyDial('creditors') }) },
    customerContacts: { body: 'party-cus-contacts', template: 'party-contact-row', initial: 1, label: index => String(index + 1).padStart(2, '0'),
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
    partyEl('under').disabled = false;
    partyEl('form').removeAttribute('data-fixed-under');   // Masters › Create › Parties: Under is chosen on the page
    partyEl('email-panel').hidden = true;
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
    if (partyEl('under').value === '') {
      return { errors: [{ node: partyEl('under'), message: 'Choose Creditors or Debtors first.' }], payload: null };
    }
    const variant = partyVariant();
    const check = formChecks(suffix => partyEl(`${variant}-${suffix}`));
    const contacts = partyForm.rowsOf(variant === 'cus' ? 'customerContacts' : 'supplierContacts');
    const NUMBER_3 = 'Enter a number with up to 3 decimals.';
    const WHOLE = 'Enter a whole number.';
    check.required('name', 'Name');
    // suppliers.debit_limit / opening_balance hold 2 decimals; customers.credit_limit holds 3.
    const MONEY_2 = /^\d{1,10}(\.\d{1,2})?$/;
    const NUMBER_2 = 'Enter a number with up to 2 decimals.';
    check.matches('credit-limit', variant === 'sup' ? MONEY_2 : DECIMAL_3, variant === 'sup' ? NUMBER_2 : NUMBER_3);
    check.matches('credit-days', WHOLE_NUMBER, WHOLE);
    if (variant === 'sup') check.matches('opening', MONEY_2, NUMBER_2);
    if (variant === 'cus' && (check.text('discount') !== '') && (!DECIMAL_2.test(check.text('discount')) || Number(check.text('discount')) > 100)) {
      check.fail(partyEl('cus-discount'), 'Discount must be from 0 to 100, with up to 2 decimals.');
    }
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
    // supplier_contacts / customer_contacts keep a name, designation, one number and an email per contact.
    const contactRows = filledRows(contacts).map(row => ({
      name: row.name.trim(), designation: row.designation.trim(), number: joinPhone(row.mobileCode, row.mobile), email: row.email.trim(),
    }));
    // The Quotations and Previous Purchases tabs and the documents already on the server (edit mode).
    const rowsOfTabs = {
      contacts: contactRows,
      quotations: filledRows(partyForm.rowsOf('quotations')).map(row => Object.fromEntries(QUOTE_COLUMNS.map(key => [key, row[key].trim()]))),
      orders: filledRows(partyForm.rowsOf('orders')).map(row => ({
        number: row.number.trim(), date: row.date, value: row.value.trim(), items: row.items.trim(), status: row.status,
      })),
      documents: docRows().map(readDocRow).filter(doc => doc.stored).map(doc => ({ id: doc.stored.id, type: doc.type, expiry: doc.expiry })),
    };
    // Mapped onto the suppliers / customers columns of the data model.
    const payload = variant === 'sup' ? {
      supplierName: d.name, address: d.address, country: d.country, currency: d.currency, taxRegNo: d.tax, remarks: d.comments,
      ownerDetails: d.owner, phone: joinPhone(d['mobile-code'], d.mobile), telephone: joinPhone(d['phone-code'], d.phone), email: d.email,
      debitLimit: d['credit-limit'], debitDays: d['credit-days'], paymentTerms: d.terms, openingBalance: d.opening,
      accountDetails: lines(d.bank && `Bank: ${d.bank}`, d.branch && `Branch: ${d.branch}`, d.iban && `Account / IBAN: ${d.iban}`, d.website && `Website: ${d.website}`),
      brandIds: supplierBrands.ids(), ...rowsOfTabs,
    } : {
      customerName: d.name, organizationName: d.organization, address: d.address, country: d.country, city: d.city, zipCode: d.zip,
      phone: joinPhone(d['mobile-code'], d.mobile), telephone: joinPhone(d['phone-code'], d.phone), email: d.email, ownerDetails: d.owner,
      creditLimit: d['credit-limit'], creditDays: d['credit-days'], discountPercent: d.discount, salesman: d.salesman, taxRegNo: d.tax,
      accountDetails: lines(d.other1, d.other2, d.other3), comments: d.comments, ...rowsOfTabs,
    };
    return { errors: check.errors, payload };
  },
  fill: fillPartyForm,
  init() {
    partyEl('under').addEventListener('change', () => {
      const wasPending = partyEl('form').hasAttribute('data-pending');
      syncPartyVariant();
      if (wasPending) partyForm.el(`${partyVariant()}-name`).focus();   // first choice: go straight to the form
    });
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

// Fills the party form from a saved supplier or customer (edit mode); Under is already set and locked.
function fillPartyForm(party) {
  const variant = partyVariant();
  const set = (suffix, value) => { partyEl(`${variant}-${suffix}`).value = value ?? ''; };
  const ensureOption = (select, value) => {
    if (value && ![...select.options].some(option => option.value === value)) select.append(new Option(value, value));
  };
  showRecordCode(partyEl(`${variant}-code`), party.code);
  set('name', party.name);
  set('address', party.address);
  set('country', party.country);
  set('tax', party.taxRegNo);
  set('owner', party.ownerDetails);
  set('email', party.email);
  const dial = countryNamed(party.country)?.dial || '+968';
  for (const [field, value] of [['mobile', party.phone], ['phone', party.telephone]]) {
    const [code, number] = splitPhone(value, dial);
    set(`${field}-code`, code);
    set(field, number);
  }
  // Lines saved as "Label: value" (see read()) go back to their fields.
  const accountLines = String(party.accountDetails ?? '').split('\n').filter(Boolean);
  if (variant === 'sup') {
    ensureOption(partyEl('sup-currency'), party.currency);
    set('currency', party.currency);
    set('comments', party.remarks);
    set('credit-limit', party.debitLimit);
    set('credit-days', party.debitDays);
    set('terms', party.paymentTerms);
    set('opening', party.openingBalance);
    const labelled = { 'Bank: ': 'bank', 'Branch: ': 'branch', 'Account / IBAN: ': 'iban', 'Website: ': 'website' };
    const other = [];
    for (const line of accountLines) {
      const prefix = Object.keys(labelled).find(label => line.startsWith(label));
      if (prefix) set(labelled[prefix], line.slice(prefix.length)); else other.push(line);
    }
    if (other.length) set('bank', [partyEl('sup-bank').value, ...other].filter(Boolean).join(' · '));
    supplierBrands.set(party.brands);
  } else {
    set('organization', party.organizationName);
    set('city', party.city);
    set('zip', party.zipCode);
    set('credit-limit', party.creditLimit);
    set('credit-days', party.creditDays);
    set('discount', party.discountPercent);
    ensureOption(partyEl('cus-salesman'), party.salesman);
    set('salesman', party.salesman);
    set('comments', party.comments);
    ['other1', 'other2', 'other3'].forEach((suffix, index) => set(suffix, index < 2 ? accountLines[index] : accountLines.slice(2).join(' · ')));
  }
  partyForm.setRows(variant === 'cus' ? 'customerContacts' : 'supplierContacts', party.contacts.map(contact => {
    const [mobileCode, mobile] = splitPhone(contact.number, dial);
    return { name: contact.name, designation: contact.designation, mobileCode, mobile, email: contact.email };
  }));
  partyForm.setRows('quotations', party.quotations.map(quote => ({ ...quote, rate: quote.rate ?? '' })));
  partyForm.setRows('orders', party.orders.map(order => ({
    number: order.number, date: order.date ?? '', value: order.value ?? '', items: order.items ?? '', status: order.status,
  })));
  renderDocRows(party.documents.map(doc => ({
    stored: doc, uploadedOn: new Date(String(doc.uploadedAt).replace(' ', 'T')), type: doc.docType, expiry: doc.expiryDate ?? '',
  })));
}

/* ---------- Master list pages  (#/masters/supplier, customer, item, uom, brand, category, stock-point) ----------
   One builder for every "<Noun> Master" list: table, search, Filter popup, Import popup, CSV export.
   Each page declares its columns and reads its rows from the API (GET ?all=1, inactive records too)
   every time it is opened. View shows the record in sections; Edit opens the creation form with the
   record filled in (#/masters/<list>/edit/<id>); Delete and Import write through the API. */

const ML_ICONS = {
  view: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>',
  delete: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"></path></svg>',
};
ML_ICONS.pdf = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path></svg>';
const sameText = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const normalHeader = text => String(text).toLowerCase().replace(/[^a-z]/g, '');

// Column cell styles: code (amber mono), name (bold capitals), pill, status (green when active), upper, mono, wrap (long text),
// qty (bold right-aligned number), qty-ok (the same in the page colour), text.
const ML_CELL_CLASS = { code: 'ml-code', name: 'ml-name', upper: 'ml-email', mono: 'ml-mono', wrap: 'ml-wrap', qty: 'ml-qty', 'qty-ok': 'ml-qty ml-qty-ok' };

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

// config: key ('item' → #item-list-page), route, newRoute, noun, nouns (plural), api, lookups (lookup lists a change
// makes stale), fromApi(record) → row, toPayload(row) → save payload (import; may be async),
// edit(id) and formPage (Edit), related(record) → extra View sections (the party lists),
// columns [{ key, label, type, group (View section), headers (spreadsheet aliases), read(value) → value or throws,
// inTable: false for detail columns shown only in View, import and export }], sample (template row values by key).
function createMasterList(config) {
  const page = `${config.key}-list`;
  const $ = suffix => byId(`${page}-${suffix}`);
  const tableColumns = config.columns.filter(column => column.inTable !== false);
  const caps = config.noun === config.noun.toUpperCase();          // UOM stays UOM in sentences
  const list = {
    config, rows: [], applied: new Set(), range: { from: '', to: '' }, $, render, loaded: false,
    one: caps ? config.noun : config.noun.toLowerCase(),
    many: caps ? config.nouns : config.nouns.toLowerCase(),
  };
  list.count = count => `${count} ${count === 1 ? list.one : list.many}`;

  // Every record from the API, newest first. A failed load shows an empty list and says why.
  list.load = async () => {
    $('empty').textContent = `Loading ${list.many}…`;
    try {
      const records = await apiRequest(`${config.api}?all=1`);
      // createdOn drives the Filter's date range: a document's own date (config.dateOf), else the day it was created.
      list.rows = records.map(record => ({ ...config.fromApi(record), id: record.id, code: record.code, createdOn: config.dateOf?.(record) || record.createdAt || '' }));
      $('empty').textContent = `No ${list.many} match your search.`;
    } catch (error) {
      list.rows = [];
      $('empty').textContent = `The ${list.many} could not be loaded: ${error.message}`;
      showToast(`Could not load ${list.many}`, error.message, true);
    }
    list.loaded = true;
    render();
  };

  function render() {
    const query = $('search').value.trim().toLowerCase();
    const { applied, rows: all } = list;
    const rows = all.filter(row => (applied.size === 0 || applied.has(row.code)) && inDateRange(row, list.range)
      && (!query || config.columns.some(column => String(row[column.key] ?? '').toLowerCase().includes(query))));
    $('body').replaceChildren(...rows.map(row => {
      const tr = el('tr');
      tr.dataset.code = row.code;
      const actions = el('td', 'ml-col-actions');
      const group = el('div', 'ml-actions');
      for (const [action, label] of [['view', 'View'], ['edit', 'Edit'], ...(config.pdf ? [['pdf', 'PDF']] : []), ['delete', 'Delete']]) {
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
    const active = applied.size + (list.range.from || list.range.to ? 1 : 0);
    $('filter-label').textContent = active ? `Filter (${active})` : 'Filter';
    $('filter').classList.toggle('is-on', active > 0);
  }

  // "/" search, F filter, I import, Shift+N new record, Esc back (Esc in a filled search clears it first).
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
        goBack();
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
    $('back').addEventListener('click', goBack);
    $('filter').addEventListener('click', () => openMasterFilter(list));
    $('import').addEventListener('click', () => openMasterImport(list));
    $('body').addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      const row = button && list.rows.find(entry => entry.code === button.closest('tr').dataset.code);
      if (!row) return;
      if (button.dataset.action === 'view') openMasterView(list, row);
      else if (button.dataset.action === 'edit') openMasterEdit(list, row);
      else if (button.dataset.action === 'pdf') config.pdf(row);
      else deleteMasterRow(list, row);
    });
  };
  // After an edit or a delete, focus lands back on that row (or the row now in its place).
  list.focusRow = code => {
    const tr = [...$('body').rows].find(entry => entry.dataset.code === code) || $('body').rows[0];
    (tr?.querySelector('[data-action="edit"]') || $('search')).focus();
  };
  const firstField = () => {
    const code = list.returnTo;
    const tr = code && [...$('body').rows].find(entry => entry.dataset.code === code);
    if (tr) list.returnTo = null;
    return tr?.querySelector('[data-action="edit"]') || $('body').querySelector('button') || $('search');
  };

  FORM_KEY_HANDLERS[page] = handleKeys;
  FORM_PAGES[config.route] = {
    page,
    reset() {
      $('search').value = '';
      list.applied.clear();
      list.range = { from: '', to: '' };
      list.rows = [];
      render();
      // Once the rows are in, focus the row last opened (or the first), unless the user has moved on.
      list.load().then(() => {
        const active = document.activeElement;
        if (currentPage === page && (active === $('search') && !$('search').value || active === byId('app') || active === document.body)) firstField().focus();
      });
    },
    firstField,
  };
  return list;
}

// Edit: the creation form with the record filled in. Coming back, the list focuses this row again.
function openMasterEdit(list, row) {
  list.returnTo = row.code;
  location.hash = `#/${list.config.route}/edit/${row.id}`;
}

/* ---------- Filter popup (#master-filter, shared by the list pages) ----------
   Ticks pick which records the list shows; none ticked shows them all.
   Keys: ↑/↓ move between the search box and the rows, Space ticks, Enter applies
   (Ctrl+Enter from anywhere), Esc closes without applying. */

const masterFilter = { list: null, picked: new Set(), range: { from: '', to: '' }, opener: null };

// YYYY-MM-DD in local time, as a date input holds it; a record's created date (today when it has none yet).
const dateInputValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const createdOn = row => (row.createdOn ??= dateInputValue(new Date()));
const inDateRange = (row, { from, to }) => (!from || createdOn(row) >= from) && (!to || createdOn(row) <= to);
const shortDate = value => new Date(`${value}T00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const mfEl = suffix => byId(`master-filter-${suffix}`);
const mfVisibleRows = () => {
  const query = mfEl('search').value.trim().toLowerCase();
  return masterFilter.list.rows                       // newest first, as the list page shows them
    .filter(row => inDateRange(row, masterFilter.range))
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
  // The code column fits the longest code of this master, so codes stay on one line and the names line up.
  mfEl('list').style.setProperty('--sf-code-ch', Math.max(6, ...masterFilter.list.rows.map(row => row.code.length)));
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
  Object.assign(masterFilter, { list, picked: new Set(list.applied), range: { ...list.range }, opener: document.activeElement });
  closeMasterDate(false);
  syncMasterDateButton();
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
  list.range = { ...masterFilter.range };
  list.render();
  closeMasterFilter();
  const count = list.rows.filter(row => (list.applied.size === 0 || list.applied.has(row.code)) && inDateRange(row, list.range)).length;
  const filtered = list.applied.size || list.range.from || list.range.to;
  showToast('Filter applied', filtered ? `Showing ${list.count(count)}.` : `Showing all ${list.many}.`);
}

function resetMasterFilter() {
  masterFilter.picked.clear();
  masterFilter.list.applied.clear();
  masterFilter.range = { from: '', to: '' };
  masterFilter.list.range = { from: '', to: '' };
  closeMasterDate(false);
  syncMasterDateButton();
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
  const rows = list.rows.filter(row => (picked.size === 0 || picked.has(row.code)) && inDateRange(row, masterFilter.range));
  downloadCsv(masterFileName(list, today.toISOString().slice(0, 10)),
    [columns.map(column => column.label), ...rows.map(row => columns.map(column => row[column.key] ?? ''))]);
  showToast('Export ready', `${list.count(rows.length)} saved as CSV.`);
}

/* Date panel inside the Filter popup: records created From ... To (either end may be left open). */
const mfDatePop = () => mfEl('date-pop');

function syncMasterDateButton() {
  const { from, to } = masterFilter.range;
  mfEl('date-label').textContent = from && to ? `${shortDate(from)} – ${shortDate(to)}`
    : from ? `From ${shortDate(from)}` : to ? `Until ${shortDate(to)}` : 'Date';
  mfEl('date').classList.toggle('is-on', Boolean(from || to));
}

function openMasterDate() {
  mfEl('from').value = masterFilter.range.from;
  mfEl('to').value = masterFilter.range.to;
  mfEl('date-error').hidden = true;
  mfDatePop().hidden = false;
  mfEl('date').setAttribute('aria-expanded', 'true');
  mfEl('from').focus();
}

function closeMasterDate(refocus = true) {
  if (mfDatePop().hidden) return;
  mfDatePop().hidden = true;
  mfEl('date').setAttribute('aria-expanded', 'false');
  if (refocus) mfEl('date').focus();
}

function setMasterDate(clear = false) {
  const from = clear ? '' : mfEl('from').value;
  const to = clear ? '' : mfEl('to').value;
  if (from && to && from > to) {
    mfEl('date-error').hidden = false;
    mfEl('to').focus();
    return;
  }
  masterFilter.range = { from, to };
  syncMasterDateButton();
  renderMasterFilterList();
  closeMasterDate();
}

// Keys while the date panel is open: Esc closes it, Enter goes From -> To -> Set Dates, Tab cycles inside it,
// and the arrows stay with the date input (up/down step the value, left/right move between day, month and year).
function handleMasterDateKeys(event) {
  const { key, target } = event;
  if (key === 'Escape') { event.preventDefault(); if (!event.repeat) closeMasterDate(); return true; }
  if (key === 'Tab') {
    const stops = [mfEl('from'), mfEl('to'), ...mfDatePop().querySelectorAll('button')];
    const index = stops.indexOf(target);
    event.preventDefault();
    stops[(index + (event.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
    return true;
  }
  if (key === 'Enter' && target === mfEl('from')) { event.preventDefault(); mfEl('to').focus(); return true; }
  if (key === 'Enter' && target === mfEl('to')) { event.preventDefault(); if (!event.repeat) setMasterDate(); return true; }
  if (target.type === 'date' && key.startsWith('Arrow')) return true;
  return false;
}

function handleMasterFilterKeys(event) {
  if (!mfDatePop().hidden && (mfDatePop().contains(event.target) || event.key === 'Escape')) {
    return handleMasterDateKeys(event);
  }
  const { key, target } = event;
  const ctrl = event.ctrlKey || event.metaKey;
  if (key === 'Escape') { event.preventDefault(); if (!event.repeat) closeMasterFilter(); return true; }
  // The popup stays open until Apply Filters, Esc or Close: Enter ticks/unticks a field,
  // and from the search box moves to the first record.
  if (key === 'Enter' && !ctrl && target.classList.contains('sf-radio')) {
    event.preventDefault();
    if (!event.repeat) target.click();
    return true;
  }
  if (key === 'Enter' && !ctrl && target === mfEl('search')) {
    event.preventDefault();
    (mfEl('list').querySelector('input[type="checkbox"]') ?? mfEl('all')).focus();
    return true;
  }
  if (key === 'Enter' && ctrl) { event.preventDefault(); return true; }
  // Typing anywhere else in the popup goes into the search box (Space still ticks; Backspace edits the search).
  const search = mfEl('search');
  if (target !== search && !ctrl && !event.altKey && ((key.length === 1 && key !== ' ') || key === 'Backspace')) {
    event.preventDefault();
    search.value = key === 'Backspace' ? search.value.slice(0, -1) : search.value + key;
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
    search.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  // →/← leave the record list for the footer: → Reset Filters, ← Export. Select All → goes to the Date button.
  if (!ctrl && !event.altKey && (key === 'ArrowRight' || key === 'ArrowLeft')) {
    const dialog = byId('master-filter');
    let next = null;
    if (mfEl('list').contains(target) && target.type === 'checkbox') {
      next = dialog.querySelector(key === 'ArrowRight' ? '[data-sf="reset"]' : '[data-sf="export"]');
    } else if (target === mfEl('all') && key === 'ArrowRight') {
      next = mfEl('date');
    }
    if (next) { event.preventDefault(); next.focus(); return true; }
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
  dialog.addEventListener('click', event => {   // a backdrop click does not close the popup
    if (!event.target.closest('.sf-date-wrap')) closeMasterDate(false);   // a click elsewhere folds the date panel
    const action = event.target.closest('[data-sf]')?.dataset.sf;
    if (action === 'close') closeMasterFilter();
    else if (action === 'apply') applyMasterFilter();
    else if (action === 'reset') resetMasterFilter();
    else if (action === 'export') exportMasterRows();
    else if (action === 'date') { if (mfDatePop().hidden) openMasterDate(); else closeMasterDate(); }
    else if (action === 'date-apply') setMasterDate();
    else if (action === 'date-clear') setMasterDate(true);
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
   New rows are saved with POST (the server numbers them); Update / Overwrite sends PUT with only the
   cells the sheet fills in, so blank cells keep what the record already has. */

const masterImport = { list: null, rows: [], opener: null, busy: false };
const miEl = suffix => byId(`master-import-${suffix}`);
const miMode = () => byId('master-import').querySelector('input[name="master-import-mode"]:checked').value;
// A sheet row that is already a record: by code or name, or the list's own rule (documents: by code only).
const findMasterRow = (rows, row, list = masterImport.list) => (list?.config.matchRow
  ? list.config.matchRow(rows, row)
  : rows.find(existing => (row.code && sameText(existing.code, row.code)) || sameText(existing.name, row.name)));

// Header row: the first of the top five rows naming the required column (the name; a document's Item Name).
// Documents read one item line per sheet row; config.groupRows() then joins the lines into documents.
function masterRowsFromSheet(list, sheet) {
  const { noun } = list.config;
  const columns = list.config.importColumns || list.config.columns;
  const required = list.config.importKey || 'name';
  const requiredLabel = columns.find(column => column.key === required)?.label || `${noun} Name`;
  const byHeader = {};
  for (const column of columns) {
    for (const header of [column.key, column.label, ...(column.headers || [])]) byHeader[normalHeader(header)] ??= column;
  }
  const headerIndex = sheet.slice(0, 5).findIndex(cells => cells.some(cell => byHeader[normalHeader(cell)]?.key === required));
  if (headerIndex === -1) throw new Error(`No "${requiredLabel}" column was found. Download the template to see the expected columns.`);
  const sheetColumns = sheet[headerIndex].map(cell => byHeader[normalHeader(cell)]);
  const rows = [], issues = [];
  sheet.slice(headerIndex + 1).forEach((cells, index) => {
    if (cells.every(cell => String(cell).trim() === '')) return;
    const line = headerIndex + index + 2;
    const raw = {};
    sheetColumns.forEach((column, at) => { if (column && !raw[column.key]) raw[column.key] = String(cells[at] ?? '').trim(); });
    if (!raw[required]) { issues.push(`Row ${line}: ${requiredLabel.toLowerCase()} is empty`); return; }
    try {
      rows.push({ ...Object.fromEntries(columns.map(column => [column.key, column.read ? column.read(raw[column.key] || '') : raw[column.key] || ''])), sheetLine: line });
    } catch (error) {
      issues.push(`Row ${line}: ${error.message}`);
    }
  });
  return { rows: list.config.groupRows ? list.config.groupRows(rows) : rows, issues };
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

async function startMasterImport() {
  const { list } = masterImport;
  if (!masterImport.rows.length || masterImport.busy) return;
  const overwrite = miMode() === 'overwrite';
  masterImport.busy = true;
  miEl('start').disabled = true;
  miEl('file-summary').textContent = `Importing ${list.count(masterImport.rows.length)}…`;
  let added = 0, updated = 0, skipped = 0;
  const failures = [];
  const filled = payload => Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== '' && value !== null && value !== undefined
    && !(Array.isArray(value) && value.length === 0)));
  const seen = [];                                   // rows of this file already handled: a name twice is one record
  for (const row of masterImport.rows) {
    const existing = findMasterRow(list.rows, row);
    try {
      if (findMasterRow(seen, row) || (existing && !overwrite)) { skipped++; continue; }
      seen.push(row);
      const payload = await list.config.toPayload(row);
      if (existing) {
        await apiRequest(`${list.config.api}?id=${existing.id}`, { method: 'PUT', json: filled(payload) });
        updated++;
      } else {
        await apiRequest(list.config.api, { method: 'POST', json: payload });
        added++;
      }
    } catch (error) {
      failures.push(`${row.name}: ${error.message}`);
    }
  }
  masterImport.busy = false;
  forgetLookups(...list.config.lookups);
  closeMasterImport();
  await list.load();
  const summary = `${added} added, ${overwrite ? `${updated} updated` : `${skipped} skipped`}`;
  if (failures.length) {
    const more = failures.length > 1 ? ` (and ${failures.length - 1} more)` : '';
    showToast(`Import finished: ${summary}, ${failures.length} failed`, `${failures[0]}${more}`, true);
  } else {
    showToast('Import complete', `${summary}.`);
  }
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
      const columns = list.config.importColumns || list.config.columns;
      const samples = list.config.importSamples || [list.config.sample];
      downloadCsv(masterFileName(list, 'import-template'), [columns.map(column => column.label), ...samples.map(sample => columns.map(column => sample[column.key] ?? ''))]);
      showToast('Template downloaded', list.config.importHint || `Fill one ${list.one} per row. Leave Code blank to number it automatically.`);
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
  try {
    await apiRequest(`${list.config.api}?id=${row.id}`, { method: 'DELETE' });
  } catch (error) {
    showToast(`${row.code} was not deleted`, error.message, true);
    list.focusRow(row.code);
    return;
  }
  forgetLookups(...list.config.lookups);
  const index = list.rows.indexOf(row);
  if (index !== -1) list.rows.splice(index, 1);
  list.applied.delete(row.code);
  list.render();
  showToast(`${list.config.noun} deleted`, `${row.code} · ${row.name} was removed.`);
  const next = list.rows[index] || list.rows[index - 1];
  list.focusRow(next?.code);
}

/* ---------- View popup (#master-view) ----------
   The record in titled sections of label / value rows (each column's group). The party lists also show
   the record's contacts, documents, quotations and previous orders, fetched when the popup opens.
   Keys: E edit, Delete removes, ↑/↓ scroll, Esc closes. */

const masterView = { list: null, row: null, opener: null };

function viewSection(title, ...content) {
  const section = el('section', 'mv-section');
  section.append(el('h3', 'mv-section-title', title), ...content);
  return section;
}

// Label / value rows; wide values (addresses, remarks) take the whole row.
function viewFields(entries) {
  const dl = el('dl', 'mv-grid');
  for (const { label, value, column = {} } of entries) {
    const item = el('div', `mv-item${column.type === 'wrap' ? ' mv-item-wide' : ''}`);
    const dd = el('dd', `mv-value${column.type === 'name' ? ' mv-value-name' : ''}`);
    dd.append(column.key ? masterValue(column, value) : document.createTextNode(String(value ?? '') || '—'));
    item.append(el('dt', 'mv-label', label), dd);
    dl.append(item);
  }
  return dl;
}

// A small table; cells may be nodes (a document link). Empty: a note instead.
function viewTable(headings, rows, empty) {
  if (rows.length === 0) return el('p', 'mv-empty', empty);
  const wrap = el('div', 'mv-table-wrap');
  const table = el('table', 'mv-table');
  const head = el('tr');
  head.append(...headings.map(heading => el('th', '', heading)));
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  for (const cells of rows) {
    const tr = el('tr');
    for (const cell of cells) {
      const td = el('td');
      if (cell instanceof Node) td.append(cell); else td.textContent = String(cell ?? '') || '—';
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

function renderMasterView(list, row, record, loadError) {
  const groups = new Map();
  for (const column of list.config.columns) {
    if (column.key === 'code') continue;
    const group = column.group || 'Details';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ label: column.label, value: row[column.key], column });
  }
  const sections = [...groups].map(([title, entries]) => viewSection(title, viewFields(entries)));
  if (list.config.related) {
    if (record) sections.push(...list.config.related(record));
    else sections.push(viewSection('More', el('p', 'mv-empty', loadError ? `Could not load the rest of the record: ${loadError}` : 'Loading contacts, documents, quotations and orders…')));
  }
  byId('master-view-fields').replaceChildren(...sections);
}

async function openMasterView(list, row) {
  Object.assign(masterView, { list, row, opener: document.activeElement });
  byId('master-view-icon').replaceChildren(list.$('page').querySelector('.fp-brand-icon svg, .fp-brand-icon span').cloneNode(true));
  byId('master-view-title').textContent = `${list.config.noun} Details`;
  byId('master-view-sub').textContent = `${row.code} · ${row.name}`;
  renderMasterView(list, row, null);
  document.documentElement.classList.add('has-modal');
  byId('master-view').showModal();
  byId('master-view-fields').scrollTop = 0;
  byId('master-view').querySelector('[data-mv="edit"]').focus();
  if (!list.config.related) return;
  let record = null, loadError = '';
  try { record = await apiRequest(`${list.config.api}?id=${row.id}`); } catch (error) { loadError = error.message; }
  if (byId('master-view').open && masterView.row === row) renderMasterView(list, row, record, loadError);
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
  else if (action === 'edit') { closeMasterView({ restoreFocus: false }); openMasterEdit(list, row); }
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

// The party lists' extra View sections: contacts, (supplier) brands, documents, quotations, previous orders.
function partyViewSections(kind) {
  return record => {
    const docLink = doc => {
      const link = el('a', 'mv-link', doc.originalName);
      link.href = `api/${kind}-documents.php?id=${doc.id}`;
      link.download = doc.originalName;
      return link;
    };
    const date = value => (value ? shortDate(String(value).slice(0, 10)) : '');
    const sections = [
      viewSection('Contact Persons', viewTable(['Name', 'Designation', 'Mobile', 'Email'],
        record.contacts.map(c => [c.name, c.designation, c.number, c.email]), 'No contact persons.')),
    ];
    if (kind === 'supplier') {
      sections.push(viewSection('Brands Supplied', viewFields([{ label: 'Brands', value: record.brands.map(b => b.name).join(', ') }])));
    }
    sections.push(
      viewSection('Documents', viewTable(['File', 'Type', 'Expiry', 'Uploaded'],
        record.documents.map(d => [docLink(d), d.docType, date(d.expiryDate), date(d.uploadedAt)]), 'No documents uploaded.')),
      viewSection('Quotations', viewTable(['Item', 'Description', 'Unit', 'Rate (OMR)', 'Delivery', 'Warranty'],
        record.quotations.map(q => [q.itemName, q.description, q.unit, q.rate == null ? '' : formatAmount(q.rate), q.deliveryTime, q.warranty]), 'No quotations.')),
      viewSection(kind === 'supplier' ? 'Previous Purchase Orders' : 'Previous Sales Orders',
        viewTable([kind === 'supplier' ? 'PO Number' : 'SO Number', 'Date', 'Value (OMR)', 'Items', 'Status'],
          record.orders.map(o => [o.number, date(o.date), o.value == null ? '' : formatAmount(o.value), o.items, o.status]), 'No previous orders.')),
    );
    return sections;
  };
}

/* ---------- The list pages: columns, API mapping and import ---------- */

const ACTIVE_STATUSES = ['active', 'inactive'];
const ITEM_STATUSES = ['ACTIVE / RELEASED', 'QUALITY HOLD', 'OBSOLETE', 'DRAFT'];
// Import readers: a blank cell stays blank (the server default on a new record; kept as it is on an update).
const readCurrency = value => {
  if (!value) return '';
  const code = value.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error(`currency "${value}" must be a 3-letter code`);
  return code;
};
const readEmail = value => {
  if (value && !EMAIL.test(value)) throw new Error(`"${value}" is not a valid email`);
  return value;
};
// One of a fixed list, matched without case; "active" matches "ACTIVE / RELEASED".
const readChoice = (name, choices) => value => {
  if (!value) return '';
  const choice = choices.find(option => sameText(option, value) || option.toLowerCase().startsWith(value.trim().toLowerCase()));
  if (!choice) throw new Error(`${name} "${value}" must be one of: ${choices.join(', ')}`);
  return choice;
};
const readWholeNumber = name => value => {
  if (!value) return '';
  if (!/^\d{1,9}$/.test(value)) throw new Error(`${name} "${value}" must be a whole number`);
  return String(Number(value));
};
const readAmount = name => value => {
  if (!value) return '';
  const amount = value.replace(/,/g, '');
  if (!/^\d{1,10}(\.\d{1,3})?$/.test(amount)) throw new Error(`${name} "${value}" must be an amount with up to 3 decimals`);
  return amount;
};
const readPercent = value => {
  if (!value) return '';
  const percent = value.replace(/%$/, '').trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(percent) || Number(percent) > 100) throw new Error(`discount "${value}" must be a percentage from 0 to 100`);
  return percent;
};
const readDecimals = value => {
  if (!value) return '';
  if (!/^\d+$/.test(value) || Number(value) > UOM_MAX_DECIMALS) throw new Error(`decimal allowed "${value}" must be a whole number from 0 to ${UOM_MAX_DECIMALS}`);
  return String(Number(value));
};
const readFactor = value => {
  if (!value) return '';
  if (!isValidUomFactor(value)) throw new Error(`conversion factor "${value}" must be above 0, with up to 4 decimals`);
  return value;
};

// The id of the lookup row named (or coded) `name`, for import; null when blank. rows narrows the search (sub-categories).
async function importLookupId(kind, name, narrow = rows => rows) {
  if (!name) return null;
  const rows = narrow(await loadLookup(kind));
  const row = rows.find(other => sameText(other.name, name) || sameText(other.code, name));
  if (!row) throw new Error(`there is no ${LOOKUPS[kind].plural.replace(/ies$/, 'y').replace(/s$/, '')} "${name}"`);
  return row.id;
}

const codeColumn = (...headers) => ({ key: 'code', label: 'Code', type: 'code', group: 'Identification', headers });
const nameColumn = (noun, ...headers) => ({ key: 'name', label: `${noun} Name`, type: 'name', group: 'Identification', headers, read: value => value.toUpperCase() });
const statusColumn = (statuses = ACTIVE_STATUSES) => ({ key: 'status', label: 'Status', type: 'status', group: 'Identification', read: readChoice('status', statuses) });
const detail = column => ({ ...column, inTable: false });
const PHONE_HEADERS = ['mobile', 'mobile no', 'mobile number', 'phone', 'phone no', 'phone number', 'contact no', 'contact number'];
const TERMS = ['Cash', 'Advance', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90'];

const supplierList = createMasterList({
  key: 'supplier', route: 'masters/supplier', newRoute: '#/masters/supplier/new', noun: 'Supplier', nouns: 'Suppliers',
  api: 'api/suppliers.php', lookups: ['supplier'], formPage: 'party',
  edit: id => partyForm.edit(id, () => preparePartyEdit('creditors')),
  related: partyViewSections('supplier'),
  columns: [codeColumn('supplier code', 'vendor code', 'party code'),
    nameColumn('Supplier', 'supplier', 'vendor', 'vendor name', 'company', 'company name', 'party name'),
    { key: 'currency', label: 'Currency', type: 'pill', group: 'Financial Terms', headers: ['currency code', 'curr'], read: readCurrency },
    { key: 'phone', label: 'Mobile', group: 'Contact', headers: PHONE_HEADERS },
    { key: 'email', label: 'Email', type: 'upper', group: 'Contact', headers: ['email address', 'email id', 'mail'], read: readEmail },
    { key: 'city', label: 'City', group: 'Location', headers: ['town'] },
    statusColumn(),
    detail({ key: 'ownerDetails', label: 'Owner Name', group: 'Contact', headers: ['owner', 'proprietor'] }),
    detail({ key: 'telephone', label: 'Telephone', group: 'Contact', headers: ['landline', 'office phone', 'tel'] }),
    detail({ key: 'address', label: 'Address', type: 'wrap', group: 'Location', headers: ['street', 'address line'] }),
    detail({ key: 'country', label: 'Country', group: 'Location' }),
    detail({ key: 'taxRegNo', label: 'Tax Reg. No', group: 'Financial Terms', headers: ['vat no', 'vat number', 'tax number', 'trn'] }),
    detail({ key: 'paymentTerms', label: 'Payment Terms', group: 'Financial Terms', headers: ['terms'], read: readChoice('payment terms', TERMS) }),
    detail({ key: 'debitLimit', label: 'Credit Limit (OMR)', type: 'mono', group: 'Financial Terms', headers: ['debit limit'], read: readAmount('credit limit') }),
    detail({ key: 'debitDays', label: 'Credit Period (Days)', group: 'Financial Terms', headers: ['credit days', 'debit days'], read: readWholeNumber('credit period') }),
    detail({ key: 'openingBalance', label: 'Opening Balance (OMR)', type: 'mono', group: 'Financial Terms', headers: ['opening'], read: readAmount('opening balance') }),
    detail({ key: 'accountDetails', label: 'Bank / Other Details', type: 'wrap', group: 'Other Details', headers: ['bank details', 'bank account', 'iban'] }),
    detail({ key: 'remarks', label: 'Comments', type: 'wrap', group: 'Other Details', headers: ['notes', 'remarks'] })],
  fromApi: record => ({ ...record, debitDays: record.debitDays ?? '' }),
  toPayload: row => ({
    supplierName: row.name, currency: row.currency, phone: row.phone, email: row.email, city: row.city, status: row.status,
    ownerDetails: row.ownerDetails, telephone: row.telephone, address: row.address, country: row.country, taxRegNo: row.taxRegNo,
    paymentTerms: row.paymentTerms, debitLimit: row.debitLimit, debitDays: row.debitDays, openingBalance: row.openingBalance,
    accountDetails: row.accountDetails, remarks: row.remarks,
  }),
  sample: { name: 'GULF VALVES LLC', currency: 'OMR', phone: '+968 9123 4567', email: 'sales@gulfvalves.om', city: 'Muscat', country: 'Oman', paymentTerms: 'Net 30', status: 'active' },
});

const customerList = createMasterList({
  key: 'customer', route: 'masters/customer', newRoute: '#/masters/customer/new', noun: 'Customer', nouns: 'Customers',
  api: 'api/customers.php', lookups: [], formPage: 'party',
  edit: id => partyForm.edit(id, () => preparePartyEdit('debtors')),
  related: partyViewSections('customer'),
  columns: [codeColumn('customer code', 'client code', 'party code'),
    nameColumn('Customer', 'customer', 'client', 'client name', 'company', 'company name', 'party name'),
    { key: 'phone', label: 'Mobile', group: 'Contact', headers: PHONE_HEADERS },
    { key: 'email', label: 'Email', type: 'upper', group: 'Contact', headers: ['email address', 'email id', 'mail'], read: readEmail },
    { key: 'city', label: 'City', group: 'Location', headers: ['town'] },
    statusColumn(),
    detail({ key: 'organizationName', label: 'Organization Name', group: 'Identification', headers: ['organisation', 'organization', 'group'] }),
    detail({ key: 'ownerDetails', label: 'Owner Details', group: 'Contact', headers: ['owner', 'proprietor'] }),
    detail({ key: 'telephone', label: 'Telephone', group: 'Contact', headers: ['landline', 'office phone', 'tel'] }),
    detail({ key: 'address', label: 'Address', type: 'wrap', group: 'Location', headers: ['street', 'address line'] }),
    detail({ key: 'zipCode', label: 'Zip Code', group: 'Location', headers: ['zip', 'postal code', 'po box', 'pin code'] }),
    detail({ key: 'country', label: 'Country', group: 'Location' }),
    detail({ key: 'currency', label: 'Currency', type: 'pill', group: 'Credit & Sales', read: readCurrency }),
    detail({ key: 'creditLimit', label: 'Credit Limit (OMR)', type: 'mono', group: 'Credit & Sales', read: readAmount('credit limit') }),
    detail({ key: 'creditDays', label: 'Credit Days', group: 'Credit & Sales', read: readWholeNumber('credit days') }),
    detail({ key: 'discountPercent', label: 'Discount %', group: 'Credit & Sales', headers: ['discount'], read: readPercent }),
    detail({ key: 'salesman', label: 'Salesman', group: 'Credit & Sales', headers: ['sales person', 'salesperson'] }),
    detail({ key: 'taxRegNo', label: 'Tax Registration No', group: 'Credit & Sales', headers: ['vat no', 'vat number', 'tax number', 'trn'] }),
    detail({ key: 'accountDetails', label: 'Additional Info', type: 'wrap', group: 'Other Details', headers: ['other details'] }),
    detail({ key: 'comments', label: 'Comments', type: 'wrap', group: 'Other Details', headers: ['notes', 'remarks'] })],
  fromApi: record => ({ ...record, creditDays: record.creditDays ?? '' }),
  toPayload: row => ({
    customerName: row.name, phone: row.phone, email: row.email, city: row.city, status: row.status, organizationName: row.organizationName,
    ownerDetails: row.ownerDetails, telephone: row.telephone, address: row.address, zipCode: row.zipCode, country: row.country,
    currency: row.currency, creditLimit: row.creditLimit, creditDays: row.creditDays, discountPercent: row.discountPercent,
    salesman: row.salesman, taxRegNo: row.taxRegNo, accountDetails: row.accountDetails, comments: row.comments,
  }),
  sample: { name: 'OMAN OIL SERVICES LLC', phone: '+968 2456 1100', email: 'procurement@omanoil.om', city: 'Muscat', country: 'Oman', status: 'active' },
});

const itemList = createMasterList({
  key: 'item', route: 'masters/item', newRoute: `#/${ITEM_ROUTE}`, noun: 'Item', nouns: 'Items',
  api: 'api/items.php', lookups: ['item'], formPage: 'item', edit: id => editItem(id),
  // No Brand column: an item's brands are its sourcing rows.
  columns: [codeColumn('item code', 'sku', 'part no', 'part number'),
    nameColumn('Item', 'item', 'product', 'product name', 'item description'),
    { key: 'category', label: 'Category', group: 'Classification', headers: ['item category', 'group', 'item group'] },
    { key: 'subCategory', label: 'Sub Category', group: 'Classification', headers: ['subcategory', 'sub group', 'subgroup'] },
    { key: 'unit', label: 'Unit', type: 'pill', group: 'Classification', headers: ['uom', 'unit name', 'unit of measure'] },
    { key: 'stockPoint', label: 'Stock Point', group: 'Storage', headers: ['warehouse', 'store', 'location'] },
    statusColumn(ITEM_STATUSES),
    detail({ key: 'rack', label: 'Rack / Bin', group: 'Storage', headers: ['rack', 'bin'] }),
    detail({ key: 'availableStock', label: 'Available Stock', group: 'Storage' }),
    detail({ key: 'buyingRate', label: 'Buying Rate (OMR)', type: 'mono', group: 'Pricing' }),
    detail({ key: 'sellingPrice', label: 'Selling Price (OMR)', type: 'mono', group: 'Pricing' }),
    detail({ key: 'description', label: 'Comments', type: 'wrap', group: 'Other Details', headers: ['comments', 'remarks', 'notes'] })],
  fromApi: record => ({ ...record, stockPoint: record.warehouseName, rack: record.rackCode ?? '', buyingRate: record.buyingRate ?? '', sellingPrice: record.sellingPrice ?? '' }),
  async toPayload(row) {
    const categoryId = await importLookupId('category', row.category);
    return {
      itemName: row.name, status: row.status, comments: row.description, categoryId,
      subCategoryId: await importLookupId('subcategory', row.subCategory, rows => (categoryId ? rows.filter(sub => sub.categoryId === categoryId) : rows)),
      uomId: await importLookupId('uom', row.unit),
      warehouseId: await importLookupId('warehouse', row.stockPoint),
    };
  },
  sample: { name: 'GATE VALVE 2" CAST IRON', category: 'Pneumatics & Hydraulics', subCategory: 'Ball Valves', unit: 'Pieces', stockPoint: 'Central WH North', status: 'ACTIVE / RELEASED' },
});

const uomList = createMasterList({
  key: 'uom', route: 'masters/uom', newRoute: '#/masters/uom/new', noun: 'UOM', nouns: 'UOMs',
  api: 'api/uoms.php', lookups: ['uom'], formPage: 'uom', edit: id => uomForm.edit(id),
  columns: [codeColumn('uom code', 'unit code'),
    nameColumn('Unit', 'unit', 'uom', 'uom name', 'unit of measure'),
    { key: 'decimals', label: 'Decimal Allowed', group: 'Conversion & Precision', headers: ['decimals', 'decimal places'], read: readDecimals },
    { key: 'baseUnit', label: 'Base Unit', group: 'Conversion & Precision', headers: ['base', 'base uom', 'conversion base'] },
    { key: 'factor', label: 'Conversion Factor', type: 'mono', group: 'Conversion & Precision', headers: ['factor', 'conversion'], read: readFactor },
    statusColumn(),
    detail({ key: 'description', label: 'Description', type: 'wrap', group: 'Other Details', headers: ['remarks', 'notes'] })],
  fromApi: record => ({ ...record, decimals: String(record.decimalAllowed), baseUnit: record.baseName, factor: record.conversionFactor }),
  async toPayload(row) {
    return {
      unitName: row.name, decimalAllowed: row.decimals, conversionFactor: row.factor, status: row.status, description: row.description,
      conversionBaseId: await importLookupId('uom', row.baseUnit),
    };
  },
  sample: { name: 'DOZEN', decimals: '0', baseUnit: 'Pieces', factor: '12.0000', status: 'active' },
});

const brandList = createMasterList({
  key: 'brand', route: 'masters/brand', newRoute: '#/masters/brand/new', noun: 'Brand', nouns: 'Brands',
  api: 'api/brands.php', lookups: ['brand'], formPage: 'brand', edit: id => brandForm.edit(id),
  columns: [codeColumn('brand code'), nameColumn('Brand', 'brand', 'make', 'manufacturer'), statusColumn()],
  fromApi: record => ({ ...record }),
  toPayload: row => ({ brandName: row.name, status: row.status }),
  sample: { name: 'PARKER HANNIFIN', status: 'active' },
});

const categoryList = createMasterList({
  key: 'category', route: 'masters/category', newRoute: '#/masters/category/new', noun: 'Category', nouns: 'Categories',
  api: 'api/categories.php', lookups: ['category', 'subcategory'], formPage: 'category', edit: id => categoryForm.edit(id),
  columns: [codeColumn('category code', 'group code'), nameColumn('Category', 'category', 'group', 'group name'),
    { key: 'subCategories', label: 'Sub Categories', type: 'wrap', group: 'Sub Categories', headers: ['sub category', 'subcategory', 'subcategories', 'sub groups'] },
    statusColumn()],
  fromApi: record => ({ ...record }),
  toPayload: row => ({
    categoryName: row.name, status: row.status,
    subcategories: row.subCategories ? row.subCategories.split(',').map(name => name.trim()).filter(Boolean) : [],
  }),
  sample: { name: 'POWER TOOLS', subCategories: 'Drills, Grinders', status: 'active' },
});

const stockPointList = createMasterList({
  key: 'stock-point', route: 'masters/stock-point', newRoute: '#/masters/stock-point/new', noun: 'Stock Point', nouns: 'Stock Points',
  api: 'api/warehouses.php', lookups: ['warehouse', 'item'], formPage: 'warehouse', edit: id => warehouseForm.edit(id),
  columns: [codeColumn('stock point code', 'warehouse code', 'store code'),
    nameColumn('Stock Point', 'stock point', 'warehouse', 'warehouse name', 'store', 'store name', 'location'),
    { key: 'type', label: 'Type', type: 'pill', group: 'Identification', headers: ['stock point type', 'warehouse type', 'store type'], read: readChoice('type', ['Office', 'Warehouse', 'Shop']) },
    { key: 'city', label: 'City', group: 'Location', headers: ['town'] },
    { key: 'country', label: 'Country', group: 'Location' },
    { key: 'contactPerson', label: 'Contact Person', group: 'Contact & Management', headers: ['contact', 'in charge', 'incharge', 'store keeper'] },
    { key: 'phone', label: 'Phone', group: 'Contact & Management', headers: ['mobile', 'phone no', 'phone number', 'telephone', 'tel', 'extension'] },
    statusColumn(),
    detail({ key: 'address', label: 'Address', type: 'wrap', group: 'Location', headers: ['street', 'address line'] }),
    detail({ key: 'email', label: 'Email', type: 'upper', group: 'Contact & Management', headers: ['email address', 'mail'], read: readEmail }),
    detail({ key: 'manager', label: 'Assigned Manager', group: 'Contact & Management', headers: ['manager'] }),
    detail({ key: 'capacity', label: 'Total Storage Capacity', type: 'mono', group: 'Capacity & Remarks', headers: ['capacity'], read: readWholeNumber('capacity') }),
    detail({ key: 'remarks', label: 'Remarks', type: 'wrap', group: 'Capacity & Remarks', headers: ['notes', 'comments'] })],
  fromApi: record => ({ ...record, capacity: record.capacity ?? '' }),
  toPayload: row => ({
    warehouseName: row.name, type: row.type, city: row.city, country: row.country, contactPerson: row.contactPerson, phone: row.phone,
    status: row.status, address: row.address, email: row.email, manager: row.manager, capacity: row.capacity, remarks: row.remarks,
  }),
  sample: { name: 'SOHAR PORT STORE', type: 'Warehouse', city: 'Sohar', country: 'Oman', address: 'Sohar Port, Gate 3', contactPerson: 'Store Keeper', phone: '+968 2685 0000', status: 'active' },
});

const MASTER_LISTS = [supplierList, customerList, itemList, uomList, brandList, categoryList, stockPointList];

// Edit Supplier / Edit Customer: Under is set for the record and locked (a supplier cannot become a customer).
function preparePartyEdit(under) {
  partyEl('under').value = under;
  partyEl('under').disabled = true;
  syncPartyVariant();
}

// New Supplier / New Customer (the list pages' New button): only the supplier (Creditors) or customer (Debtors)
// form, titled Supplier / Customer Creation, without the Under choice. Not an undo step.
for (const [route, under] of [['masters/supplier/new', 'creditors'], ['masters/customer/new', 'debtors']]) {
  FORM_PAGES[route] = {
    page: 'party',
    alwaysReset: true,                     // coming from Parties (same page) must still hide Under
    reset() {
      FORM_PAGES['masters/party/new'].reset();
      partyEl('under').value = under;
      partyEl('form').setAttribute('data-fixed-under', '');
      syncPartyVariant();
      partyForm.absorb();
    },
    firstField: FORM_PAGES['masters/party/new'].firstField,
    isEditing: partyForm.isEditing,
  };
}

const MASTER_FORMS = [uomForm, brandForm, categoryForm, warehouseForm, partyForm];

/* =====================================================================
   Hash router: #/home (dashboard), the form pages in FORM_PAGES and the
   edit pages (#/masters/<list>/edit/<id>: the creation form in edit mode,
   see masterEditPage). Routes for screens not built yet fall back to the dashboard.
   ===================================================================== */

FORM_PAGES[ITEM_ROUTE] = { page: 'item', reset: resetItemForm, firstField: () => itemEl('name'), isEditing: () => itemEditing !== null };

let currentPage = 'dashboard';
let pageOriginView = null;                // quick-menu view the open page was launched from
let pendingMenuReturn = null;             // { view, focusSelector } to open once the dashboard is back
const routeTrail = [];                    // routes visited before the current one, oldest first
let currentRoute = null;
let routeGoingBack = false;               // the next route change is goBack(): do not add to the trail

// Esc (and the list pages' Back button): back to the page before this one, e.g. New Supplier → Supplier Master,
// Edit Item → Item Master. When the page before was the dashboard (or there is none, after a reload),
// back to the dashboard with the popup that opened the page.
function goBack() {
  while (routeTrail.length) {
    const previous = routeTrail.pop();
    if (previous === currentRoute) continue;
    if (previous === '' || previous === 'home') break;
    routeGoingBack = true;
    location.hash = `#/${previous}`;
    return;
  }
  leavePageToMenu();
}

// After a save, back to the master's list page with focus on the saved record's row, when the form was
// opened from that list (New … on the list page) or is an edit. A form opened from Masters › Create stays
// open for the next record instead: returns false and the caller resets the form.
function showSavedInList(route, code, { edited = false } = {}) {
  const fromList = routeTrail.at(-1) === route;
  if (!fromList && !edited) return false;
  const list = allLists().find(entry => entry.config.route === route);
  if (list) list.returnTo = code;
  if (fromList) {
    goBack();
  } else {                                 // an edit opened by a link: open its list in the form's place
    routeGoingBack = true;
    location.hash = `#/${route}`;
  }
  return true;
}

// Every list page: the masters and the Purchase Book documents.
const allLists = () => [...MASTER_LISTS, ...PURCHASE_LISTS];

// An edit route opens the list's creation form with the record (see the lists' edit()).
function masterEditPage(route) {
  const match = /^((?:masters|purchase-book)\/[a-z-]+)\/edit\/(\d+)$/.exec(route);
  const list = match && allLists().find(entry => entry.config.route === match[1]);
  if (!list) return null;
  const id = Number(match[2]);
  return {
    page: list.config.formPage,
    alwaysReset: true,                     // another record may be opened while this page is showing
    reset: () => list.config.edit(id),
    firstField: () => [...byId(`${list.config.formPage}-form`).querySelectorAll('input:not([readonly]):not([type="hidden"]):not([disabled]), select:not([disabled])')]
      .find(node => node.getClientRects().length > 0) || byId('app'),
  };
}

// Back to the dashboard with the popup that opened the page.
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
  if (routeGoingBack) routeGoingBack = false;
  else if (currentRoute !== null && currentRoute !== route) {
    routeTrail.push(currentRoute);
    if (routeTrail.length > 50) routeTrail.shift();
  }
  currentRoute = route;
  closeSuggest();
  const formPage = FORM_PAGES[route] || masterEditPage(route);
  if (formPage) {
    // A form left open in edit mode starts over as a new record.
    if (currentPage !== formPage.page || formPage.alwaysReset || formPage.isEditing?.()) {
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
    currentRoute = 'home';
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
   Purchase Book  (Quick Menu › Purchase Book): Purchase Request, Quotation Request (RFQ),
   Purchase Order and Goods Receipt Note (GRN). Each is a createFormPage() form with item lines.

   A line's Item Code and Item Name search the item master; picking either fills the other, the
   item's brands (Brand) and its unit. A name typed without picking is kept as a free-text item.
   Selects with data-bind (row) or data-bind-id (header) show a hidden input that holds the value,
   so undo restores them even when their options load later (a row's brands, a supplier's contacts).
   Purchase orders and GRNs total their lines as the server does (backend/src/purchase_book.php):
   the Discount Amount is shared across the lines by value before tax; VAT is each line's VAT % on
   what is left, included in the prices or added on top (Include / Exclude VAT); Shipping is added last.
   Keys: Enter next field, Ctrl+S or Shift+Enter save, Alt+A add an item row, Ctrl+Z undo, Esc back.
   ===================================================================== */

const pbData = { items: new Map(), suppliers: new Map(), racks: [] };
const pbNum = value => {
  const number = parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(number) ? number : 0;
};
const pbMoney = number => (Number.isFinite(number) ? number : 0).toFixed(3);
const pbQty = number => String(Math.round(number * 1000) / 1000);
const pbCell = (row, field) => row.querySelector(`[data-field="${field}"]`);

// The row templates share their item, unit and remove cells (index.html keeps them once).
function composePurchaseTemplates() {
  const cells = id => [...byId(id).content.cloneNode(true).children];
  for (const id of ['pb-line-simple', 'pb-line-po', 'pb-line-grn']) {
    const row = byId(id).content.firstElementChild;
    row.prepend(...cells('pb-cell-item'));
    const unitSlot = row.querySelector('[data-unit-cell]');
    if (unitSlot) unitSlot.replaceWith(...cells('pb-cell-unit'));
    else row.append(...cells('pb-cell-unit'), ...cells('pb-cell-remove'));
  }
}

function fillSelect(select, options, placeholder) {
  const keep = select.value;
  select.replaceChildren(...(placeholder === undefined ? [] : [new Option(placeholder, '')]),
    ...options.map(option => new Option(option.label, String(option.value))));
  select.value = keep;
  if (select.value !== keep) select.value = '';
}

const boundHidden = select => (select.dataset.bindId
  ? byId(select.dataset.bindId)
  : select.closest('td').querySelector(`input[type="hidden"][data-field="${select.dataset.bind}"]`));

function syncBoundSelects(root) {
  for (const select of root.querySelectorAll('select[data-bind], select[data-bind-id]')) {
    const value = boundHidden(select).value;
    select.value = value;
    if (select.value !== value) select.value = '';
  }
}

// Cached master records the rows need: an item's brands, a supplier's contacts and currency.
function pbItem(id) {
  if (!pbData.items.has(id)) {
    pbData.items.set(id, apiRequest(`api/items.php?id=${id}`).catch(error => { pbData.items.delete(id); throw error; }));
  }
  return pbData.items.get(id);
}
function pbSupplier(id) {
  if (!pbData.suppliers.has(id)) {
    pbData.suppliers.set(id, apiRequest(`api/suppliers.php?id=${id}`).catch(error => { pbData.suppliers.delete(id); throw error; }));
  }
  return pbData.suppliers.get(id);
}

const itemBrands = item => {
  const seen = new Map();
  for (const source of item.sourcing || []) if (source.brandId && !seen.has(source.brandId)) seen.set(source.brandId, source.brandName);
  if (item.brandId && !seen.has(item.brandId)) seen.set(item.brandId, item.brandName);
  return [...seen].map(([value, label]) => ({ value, label }));
};

function setRowBrands(row, item) {
  const select = row.querySelector('select[data-bind="brandId"]');
  if (!item) {
    fillSelect(select, [], 'Select item first');
    select.disabled = true;
    return;
  }
  const brands = itemBrands(item);
  fillSelect(select, brands, brands.length ? 'Select brand' : 'No brand');
  select.disabled = brands.length === 0;
  select.value = pbCell(row, 'brandId').value;
  if (select.value !== pbCell(row, 'brandId').value) select.value = '';
}

function setRowRacks(row, warehouseId) {
  const select = row.querySelector('select[data-bind="rackId"]');
  if (!select) return;
  const racks = pbData.racks.filter(rack => String(rack.warehouseId) === String(warehouseId));
  fillSelect(select, racks.map(rack => ({ value: rack.id, label: rack.code })), '—');
  const hidden = pbCell(row, 'rackId');
  select.value = hidden.value;
  if (select.value !== hidden.value) { select.value = ''; hidden.value = ''; }
}

// Shows a row's selects from its hidden values (after undo, a fetched document, or a new row).
async function syncPurchaseRow(row, warehouseId) {
  syncBoundSelects(row);
  const itemId = pbCell(row, 'itemId').value;
  row.querySelector('[data-code-id]').value = itemId;
  row.dataset.itemApplied = itemId;
  setRowRacks(row, warehouseId);
  if (!itemId) { setRowBrands(row, null); return; }
  try {
    const item = await pbItem(itemId);
    if (pbCell(row, 'itemId').value === itemId) setRowBrands(row, item);
  } catch { setRowBrands(row, null); }
}

// Fills a row from a picked item: code, name, brand list (one brand is picked for you), unit and cost.
async function applyPurchaseItem(form, row, itemId) {
  row.dataset.itemApplied = itemId;
  let item;
  try {
    item = await pbItem(itemId);
  } catch (error) {
    showToast('The item could not be loaded', error.message, true);
    return;
  }
  if (row.dataset.itemApplied !== itemId || !row.isConnected) return;
  pbCell(row, 'itemCode').value = item.code;
  row.querySelector('[data-code-id]').value = String(item.id);
  pbCell(row, 'itemName').value = item.name;
  pbCell(row, 'itemId').value = String(item.id);
  const brands = itemBrands(item);
  pbCell(row, 'brandId').value = brands.length === 1 ? String(brands[0].value) : '';
  pbCell(row, 'brandName').value = brands.length === 1 ? brands[0].label : '';
  setRowBrands(row, item);
  pbCell(row, 'uomId').value = item.uomId ? String(item.uomId) : '';
  pbCell(row, 'unit').value = item.unit || '';
  syncBoundSelects(row);
  for (const field of ['price', 'unitCost']) {
    const cell = pbCell(row, field);
    if (cell && pbNum(cell.value) === 0 && pbNum(item.buyingRate) > 0) cell.value = pbMoney(pbNum(item.buyingRate));
  }
  form.page.absorb();
  form.refresh();
}

// A document's lines (from a purchase request, quotation request or purchase order) into the item table.
async function loadPurchaseLines(form, lines, toRow) {
  form.page.setRows('items', lines.map(toRow));
  const rows = form.page.rowsOf('items');
  await Promise.all(rows.map(row => syncPurchaseRow(row, form.warehouseId?.())));
  form.page.record();
}

/* Line maths, the same as pb_totals() on the server. */
function purchaseTotals(rows, kind, vatMode, discount, shipping) {
  const nets = rows.map(row => {
    const value = field => pbNum(pbCell(row, field)?.value);
    if (kind === 'grn') {
      const gross = value('acceptedQty') * value('unitCost');
      return gross - gross * value('discountPct') / 100;
    }
    const gross = pbCell(row, 'foc').value === 'Yes' ? 0 : value('quantity') * value('price');
    return Math.max(0, gross - value('discountAmount'));
  });
  const subtotal = nets.reduce((sum, net) => sum + net, 0);
  const shared = Math.min(discount, subtotal);
  let vat = 0;
  const lineTotals = rows.map((row, i) => {
    const rate = pbNum(pbCell(row, 'vatRate').value);
    const taxable = nets[i] - (subtotal > 0 ? shared * nets[i] / subtotal : 0);
    vat += vatMode === 'include' ? taxable * rate / (100 + rate) : taxable * rate / 100;
    return vatMode === 'include' ? nets[i] : nets[i] * (1 + rate / 100);
  });
  return { lineTotals, subtotal, vat, discount: shared, grand: subtotal - shared + (vatMode === 'exclude' ? vat : 0) + shipping };
}

/*
 * One Purchase Book form. spec: key, route, noun, api, firstField, kind ('simple' | 'po' | 'grn'),
 * header() → payload keys, check(check, errors) adds header errors, fieldNodes, onReset(), init(form),
 * extra (chips), lookups (dropped after a save).
 */
function createPurchaseForm(spec) {
  const el = suffix => byId(`${spec.key}-${suffix}`);
  const form = { el, spec };
  const priced = spec.kind !== 'simple';
  const printBox = () => byId(`${spec.key}-form`).querySelector('.pb-print');
  const flags = () => ({
    includeSignatory: printBox().querySelector('[data-print-field="includeSignatory"]').checked,
    attachSeal: printBox().querySelector('[data-print-field="attachSeal"]').checked,
  });
  const rows = () => form.page.rowsOf('items');
  const isBlankRow = row => !pbCell(row, 'itemName').value.trim() && !pbCell(row, 'itemId').value && !pbCell(row, 'itemCode').value.trim();
  const vatMode = () => el('vat-mode')?.value || 'include';

  form.refresh = function refresh() {
    if (!priced) return;
    const totals = purchaseTotals(rows(), spec.kind, vatMode(), pbNum(el('discount').value), pbNum(el('shipping').value));
    rows().forEach((row, i) => {
      const filled = !isBlankRow(row) || totals.lineTotals[i] > 0;
      row.querySelector('[data-total]').textContent = spec.kind === 'po' && !filled ? '—' : pbMoney(totals.lineTotals[i]);
    });
    el('subtotal').textContent = pbMoney(totals.subtotal);
    el('vat').textContent = pbMoney(totals.vat);
    el('grand').textContent = pbMoney(totals.grand);
    el('vat-label').textContent = spec.kind === 'po'
      ? (vatMode() === 'include' ? 'VAT (included)' : 'VAT (added)')
      : (vatMode() === 'include' ? 'Total VAT Amount (included)' : 'Total VAT Amount');
  };

  function syncVatToggle() {
    const toggle = byId(`${spec.key}-form`).querySelector('[data-vat-toggle]');
    if (!toggle) return;
    for (const button of toggle.querySelectorAll('[data-vat]')) button.setAttribute('aria-pressed', String(button.dataset.vat === vatMode()));
  }

  function readLines(errors) {
    const lines = [];
    rows().forEach((row, index) => {
      if (isBlankRow(row)) return;
      const value = field => pbCell(row, field)?.value.trim() ?? '';
      const line = {
        itemId: value('itemId') || null, itemCode: value('itemCode'), itemName: value('itemName'),
        brandId: value('brandId') || null, brandName: value('brandName'), uomId: value('uomId') || null, unit: value('unit'),
      };
      const fail = (field, message) => errors.push({ node: pbCell(row, field), message: `Row ${index + 1}: ${message}` });
      if (!line.itemName) fail('itemName', 'enter the item name or pick an item.');
      if (spec.kind === 'grn') {
        Object.assign(line, {
          receivedQty: value('receivedQty'), acceptedQty: value('acceptedQty'), rejectedQty: value('rejectedQty'),
          expiryDate: value('expiryDate'), rackId: value('rackId') || null, unitCost: value('unitCost'),
          vatRate: value('vatRate'), discountPct: value('discountPct'),
        });
        if (!(pbNum(line.receivedQty) > 0)) fail('receivedQty', 'enter the received quantity.');
        else if (pbNum(line.acceptedQty) + pbNum(line.rejectedQty) > pbNum(line.receivedQty) + 0.0005) {
          fail('acceptedQty', 'accepted and rejected together cannot be more than received.');
        }
      } else {
        line.quantity = value('quantity');
        if (!(pbNum(line.quantity) > 0)) fail('quantity', 'the quantity must be more than 0.');
      }
      if (spec.kind === 'po') {
        Object.assign(line, {
          price: value('price'), vatRate: value('vatRate'), discountPct: value('discountPct'),
          discountAmount: value('discountAmount'), foc: value('foc') === 'Yes',
        });
      }
      for (const [field, ok] of Object.entries(line)) {
        if (['quantity', 'receivedQty', 'acceptedQty', 'rejectedQty', 'price', 'unitCost', 'discountAmount'].includes(field)
          && ok !== '' && !/^\d{1,11}(\.\d{1,3})?$/.test(ok)) fail(field, 'enter a number with up to 3 decimals.');
        if (['vatRate', 'discountPct'].includes(field) && ok !== '' && (!/^\d{1,3}(\.\d{1,2})?$/.test(ok) || pbNum(ok) > 100)) {
          fail(field, 'enter a percentage from 0 to 100.');
        }
      }
      lines.push(line);
    });
    if (!lines.length && !errors.length) {
      errors.push({ node: pbCell(rows()[0], 'itemName'), message: 'Add at least one item.' });
    }
    return lines;
  }

  const extra = {
    read: () => ({ flags: flags(), chips: spec.chips ? spec.chips.get() : null }),
    write(state) {
      printBox().querySelector('[data-print-field="includeSignatory"]').checked = state.flags.includeSignatory;
      printBox().querySelector('[data-print-field="attachSeal"]').checked = state.flags.attachSeal;
      if (spec.chips) { spec.chips.set(state.chips); spec.onChips?.(); }
    },
    reset() { if (spec.chips) { spec.chips.set([]); spec.onChips?.(); } },
  };

  // Edit mode (#/purchase-book/<list>/edit/<id>): the saved document back in the form, once the
  // dropdowns it needs (suppliers, requests …) have loaded.
  async function fillDocument(record) {
    showRecordCode(el('code'), record.code);
    await form.ready;
    const formNode = byId(`${spec.key}-form`);
    spec.fill(form, record);
    el('remarks').value = record.remarks || '';
    formNode.querySelector('[data-print-field="includeSignatory"]').checked = Boolean(record.includeSignatory);
    formNode.querySelector('[data-print-field="attachSeal"]').checked = Boolean(record.attachSeal);
    if (priced) {
      el('vat-mode').value = record.vatMode || 'include';
      el('discount').value = pbMoney(pbNum(record.discountAmount));
      el('shipping').value = pbMoney(pbNum(record.shipping));
      syncVatToggle();
    }
    form.page.setRows('items', record.items.map(line => purchaseLineValues(spec.kind, line)));
    await Promise.all(rows().map(row => syncPurchaseRow(row, form.warehouseId?.())));
    await spec.afterFill?.(form, record);
    form.page.absorb();                       // the filled document is where undo stops
    form.refresh();
  }

  form.page = createFormPage({
    key: spec.key, route: spec.route, noun: spec.noun, api: spec.api, ctrlSave: true, lookups: spec.lookups, listRoute: spec.listRoute,
    firstField: () => spec.firstField(),
    setCode: () => showNextCode(el('code'), spec.api),
    lists: { items: { body: `${spec.key}-items`, template: spec.template, initial: 1, label: i => String(i + 1) } },
    addRowList: () => 'items',
    extra,
    extraFocus: () => spec.chips?.input,
    fieldNodes: {
      items: () => pbCell(rows()[0], 'itemName'),
      remarks: () => el('remarks'),
      ...Object.fromEntries(Object.entries(spec.fieldNodes || {}).map(([key, id]) => [key, () => byId(id)])),
    },
    refresh: () => form.refresh(),
    afterRestore() {
      syncBoundSelects(byId(`${spec.key}-form`));
      syncVatToggle();
      for (const row of rows()) syncPurchaseRow(row, form.warehouseId?.());
      spec.afterRestore?.(form);
    },
    onReset() {
      for (const input of byId(`${spec.key}-form`).querySelectorAll('input[type="hidden"][id]')) input.value = '';
      if (el('vat-mode')) el('vat-mode').value = 'include';
      syncVatToggle();
      for (const row of rows()) syncPurchaseRow(row, form.warehouseId?.());
      form.ready = Promise.resolve(spec.onReset?.(form)).catch(() => {});
    },
    read() {
      const errors = [];
      const header = spec.header(form);
      spec.check?.(form, errors);
      const lines = readLines(errors);
      const payload = { ...header, ...flags(), remarks: el('remarks').value.trim(), items: lines };
      if (priced) Object.assign(payload, { vatMode: vatMode(), discountAmount: el('discount').value.trim() || '0', shipping: el('shipping').value.trim() || '0' });
      for (const id of ['discount', 'shipping']) {
        if (priced && el(id).value.trim() !== '' && !/^\d{1,11}(\.\d{1,3})?$/.test(el(id).value.trim())) {
          errors.push({ node: el(id), message: 'Enter an amount with up to 3 decimals.' });
        }
      }
      return { payload, errors };
    },
    fill: fillDocument,
    init() { initPurchaseForm(form); spec.init?.(form); },
  });
  return form;
}

function initPurchaseForm(form) {
  const { spec, el } = form;
  const formNode = el('form');
  const body = el('items');

  // The PDF print box: Include Signatory Slots, Attach Seal with Replace / Remove.
  const box = formNode.querySelector('.pb-print');
  box.append(byId('pb-print-box').content.cloneNode(true));
  box.querySelector('[data-print-field="includeSignatory"]').id = `${spec.key}-signatory`;
  box.querySelector('[data-print-field="attachSeal"]').id = `${spec.key}-seal`;

  // Before the form's own input handler records the change: keep hidden values and linked cells in step.
  formNode.addEventListener('input', event => {
    const target = event.target;
    if (target.matches('select[data-bind], select[data-bind-id]')) {
      boundHidden(target).value = target.value;
      if (target.dataset.bind === 'brandId') pbCell(target.closest('tr'), 'brandName').value = target.value ? target.selectedOptions[0].text : '';
      if (target.dataset.bind === 'uomId') pbCell(target.closest('tr'), 'unit').value = target.value ? target.selectedOptions[0].text : '';
    }
    const row = target.closest('.fp-row');
    if (!row) return;
    const field = target.dataset.field;
    if (isSuggestField(target)) {
      if (suggest.picking) {
        const id = lookupIdInput(target).value;
        if (id) applyPurchaseItem(form, row, id);
      } else if (field === 'itemName' || field === 'itemCode') {
        // Typing over a picked item makes the row a typed item: the other cell and the brand let go of it.
        const other = field === 'itemName' ? pbCell(row, 'itemCode') : pbCell(row, 'itemName');
        if (row.dataset.itemApplied) {
          if (field === 'itemName') other.value = '';
          lookupIdInput(other).value = '';
          pbCell(row, 'itemId').value = '';
          pbCell(row, 'brandId').value = '';
          pbCell(row, 'brandName').value = '';
          row.dataset.itemApplied = '';
          setRowBrands(row, null);
        }
      }
    }
    linkRowNumbers(row, field);
  }, true);

  // A code or name that matches an item exactly is taken when the cell is left (settleSuggest fills the id).
  body.addEventListener('focusout', event => {
    const row = event.target.closest('.fp-row');
    if (!row || !isSuggestField(event.target)) return;
    setTimeout(() => {
      const id = lookupIdInput(event.target).value;
      if (id && row.dataset.itemApplied !== id) applyPurchaseItem(form, row, id);
    }, 40);
  });

  // Numbers read as money / percentages once a cell is left.
  formNode.addEventListener('change', event => {
    const target = event.target;
    const field = target.dataset.field;
    if (target.value.trim() === '' || !/^[\d.,]+$/.test(target.value.trim())) return;
    const value = pbNum(target.value);
    if (['price', 'unitCost', 'discountAmount'].includes(field) || target.classList.contains('pb-sum-input')) target.value = pbMoney(value);
    else if (spec.kind === 'po' && ['vatRate', 'discountPct'].includes(field)) target.value = value.toFixed(2);
    else if (['quantity', 'receivedQty', 'acceptedQty', 'rejectedQty', 'vatRate', 'discountPct'].includes(field)) target.value = pbQty(value);
    else return;
    form.page.absorb();
    form.refresh();
  });

  formNode.addEventListener('click', event => {
    const vat = event.target.closest('[data-vat]');
    if (vat) {
      el('vat-mode').value = vat.dataset.vat;
      for (const button of vat.parentElement.querySelectorAll('[data-vat]')) button.setAttribute('aria-pressed', String(button === vat));
      form.page.record();
      return;
    }
    if (event.target.closest('[data-create-item]')) {
      window.open(`${location.pathname}#/${ITEM_ROUTE}`, '_blank', 'noopener');
      return;
    }
    const move = event.target.closest('[data-action="move-up"], [data-action="move-down"]');
    if (move) {
      const row = move.closest('tr');
      const up = move.dataset.action === 'move-up';
      const sibling = up ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling) return;
      if (up) sibling.before(row); else sibling.after(row);
      form.page.record();
      move.focus();
    }
  });

  function linkRowNumbers(row, field) {
    const cell = name => pbCell(row, name);
    if (spec.kind === 'grn') {
      const received = pbNum(cell('receivedQty').value);
      if (field === 'receivedQty' || field === 'rejectedQty') cell('acceptedQty').value = pbQty(Math.max(0, received - pbNum(cell('rejectedQty').value)));
      if (field === 'acceptedQty') cell('rejectedQty').value = pbQty(Math.max(0, received - pbNum(cell('acceptedQty').value)));
    }
    if (spec.kind === 'po') {
      const gross = cell('foc').value === 'Yes' ? 0 : pbNum(cell('quantity').value) * pbNum(cell('price').value);
      if (['quantity', 'price', 'discountPct', 'foc'].includes(field)) cell('discountAmount').value = pbMoney(gross * pbNum(cell('discountPct').value) / 100);
      if (field === 'discountAmount') cell('discountPct').value = gross > 0 ? (pbNum(cell('discountAmount').value) / gross * 100).toFixed(2) : '0.00';
    }
  }
}

// Units for every row's Unit list, racks for the GRN; the seal's name beside Replace / Remove.
async function loadPurchaseMasters() {
  const units = await loadLookup('uom');
  const options = units.map(unit => ({ value: unit.id, label: unit.name }));
  for (const id of ['pb-line-simple', 'pb-line-po', 'pb-line-grn']) fillSelect(byId(id).content.querySelector('select[data-bind="uomId"]'), options, 'Unit');
  for (const select of document.querySelectorAll('.fp-theme-purchase select[data-bind="uomId"]')) {
    fillSelect(select, options, 'Unit');
    select.value = boundHidden(select).value;
  }
  try { pbData.racks = await apiRequest('api/rack-bins.php'); } catch { pbData.racks = []; }
  showSealName();
}

async function showSealName() {
  let seal = null;
  try { seal = await apiRequest('api/company-seal.php'); } catch { /* shown as no seal */ }
  for (const label of document.querySelectorAll('[data-seal-name]')) label.textContent = seal ? '(seal on file)' : '(no seal yet)';
  for (const button of document.querySelectorAll('[data-seal="remove"]')) button.disabled = !seal;
}

function initSealButtons() {
  const picker = byId('pb-seal-file');
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-seal]');
    if (!button) return;
    if (button.dataset.seal === 'replace') { picker.click(); return; }
    try {
      await apiRequest('api/company-seal.php', { method: 'DELETE' });
      showToast('Seal removed', 'Purchase Book PDFs will print without a seal.');
    } catch (error) { showToast('The seal could not be removed', error.message, true); }
    showSealName();
  });
  picker.addEventListener('change', async () => {
    const file = picker.files[0];
    picker.value = '';
    if (!file) return;
    const body = new FormData();
    body.append('seal', file);
    try {
      await apiRequest('api/company-seal.php', { method: 'POST', body });
      showToast('Seal saved', `${file.name} will be printed when Attach Seal is ticked.`);
    } catch (error) { showToast('The seal could not be saved', error.message, true); }
    showSealName();
  });
}

const purchaseLineRow = line => ({
  itemId: line.itemId ?? '', itemCode: line.itemCode, itemName: line.itemName, brandId: line.brandId ?? '', brandName: line.brandName,
  uomId: line.uomId ?? '', unit: line.unit,
});

// A saved line as a row's cell values (edit mode), formatted as the form shows them.
function purchaseLineValues(kind, line) {
  const values = purchaseLineRow(line);
  if (kind === 'grn') {
    return { ...values, receivedQty: pbQty(pbNum(line.receivedQty)), acceptedQty: pbQty(pbNum(line.acceptedQty)), rejectedQty: pbQty(pbNum(line.rejectedQty)),
      expiryDate: line.expiryDate || '', rackId: line.rackId ?? '', unitCost: pbMoney(pbNum(line.unitCost)),
      vatRate: pbQty(pbNum(line.vatRate)), discountPct: pbQty(pbNum(line.discountPct)) };
  }
  values.quantity = pbQty(pbNum(line.quantity));
  if (kind === 'po') {
    Object.assign(values, { price: pbMoney(pbNum(line.price)), vatRate: pbNum(line.vatRate).toFixed(2), discountPct: pbNum(line.discountPct).toFixed(2),
      discountAmount: pbMoney(pbNum(line.discountAmount)), foc: line.foc ? 'Yes' : 'No' });
  }
  return values;
}

// Sets a select, adding the option first when the list does not have it (an inactive supplier on an old document).
function setSelectValue(select, value, label) {
  const text = String(value ?? '');
  if (text && ![...select.options].some(option => option.value === text)) select.append(new Option(label || text, text));
  select.value = text;
}

async function purchaseOptions(select, api, label) {
  try {
    const rows = await apiRequest(api);
    fillSelect(select, rows.map(row => ({ value: row.id, label: label(row) })), select.options[0]?.text ?? '');
  } catch (error) {
    showToast('A list could not be loaded', error.message, true);
  }
}

/* ---------- Purchase Request ---------- */
const prForm = createPurchaseForm({
  key: 'pr', route: 'purchase-book/purchase-request/new', noun: 'Purchase Request', api: 'api/purchase-requests.php',
  kind: 'simple', template: 'pb-line-simple', lookups: [],
  firstField: () => byId('pr-reference'),
  fieldNodes: { referenceNo: 'pr-reference', purchaseType: 'pr-type', requestedDate: 'pr-date', requiredDate: 'pr-required', deliveryLocation: 'pr-location' },
  header: () => ({
    referenceNo: byId('pr-reference').value.trim(), purchaseType: byId('pr-type').value, requestedDate: byId('pr-date').value,
    requiredDate: byId('pr-required').value, requestedBy: byId('pr-requested-by').value, deliveryLocation: byId('pr-location').value.trim(),
  }),
  check(form, errors) {
    if (!byId('pr-date').value) errors.push({ node: byId('pr-date'), message: 'Enter the requested date.' });
    if (byId('pr-required').value && byId('pr-required').value < byId('pr-date').value) {
      errors.push({ node: byId('pr-required'), message: 'The required delivery date cannot be before the requested date.' });
    }
  },
  onReset() { byId('pr-date').value = todayInputValue(); byId('pr-requested-by').value = 'admin'; },
  listRoute: 'purchase-book/purchase-request',
  fill(form, pr) {
    byId('pr-reference').value = pr.referenceNo;
    setSelectValue(byId('pr-type'), pr.purchaseType);
    byId('pr-date').value = pr.requestedDate;
    byId('pr-required').value = pr.requiredDate || '';
    byId('pr-requested-by').value = pr.requestedBy || 'admin';
    byId('pr-location').value = pr.deliveryLocation;
  },
});

/* ---------- Quotation Request (RFQ) ---------- */
const rfqSuppliers = createLookupChips({ container: 'rfq-suppliers', entry: 'rfq-supplier-entry', onChange: () => { rfqNote(); rfqForm.page.record(); } });
function rfqNote() {
  const count = rfqSuppliers.get().length;
  byId('rfq-supplier-note').lastElementChild.textContent = count ? `${count} supplier${count === 1 ? '' : 's'} selected.` : 'No suppliers selected.';
}
const rfqForm = createPurchaseForm({
  key: 'rfq', route: 'purchase-book/quotation-request/new', noun: 'Quotation Request', api: 'api/quotation-requests.php',
  kind: 'simple', template: 'pb-line-simple', lookups: [], chips: rfqSuppliers, onChips: rfqNote,
  firstField: () => byId('rfq-pr'),
  fieldNodes: { purchaseRequestId: 'rfq-pr', requestDate: 'rfq-date', submissionDeadline: 'rfq-deadline', supplierIds: 'rfq-supplier-entry' },
  header: () => ({
    purchaseRequestId: byId('rfq-pr').value || null, requestDate: byId('rfq-date').value,
    submissionDeadline: byId('rfq-deadline').value, supplierIds: rfqSuppliers.ids(),
  }),
  check(form, errors) {
    if (!rfqSuppliers.get().length) errors.push({ node: rfqSuppliers.input, message: 'Select at least one supplier.' });
    if (byId('rfq-deadline').value && byId('rfq-deadline').value < byId('rfq-date').value) {
      errors.push({ node: byId('rfq-deadline'), message: 'The submission deadline cannot be before the request date.' });
    }
  },
  onReset() {
    byId('rfq-date').value = todayInputValue();
    return purchaseOptions(byId('rfq-pr'), 'api/purchase-requests.php', row => `${row.code} · ${row.purchaseType} · ${row.itemCount} item${row.itemCount === 1 ? '' : 's'}`);
  },
  listRoute: 'purchase-book/quotation-request',
  fill(form, rfq) {
    setSelectValue(byId('rfq-pr'), rfq.purchaseRequestId, rfq.purchaseRequestCode);
    byId('rfq-date').value = rfq.requestDate;
    byId('rfq-deadline').value = rfq.submissionDeadline || '';
    rfqSuppliers.set(rfq.suppliers);
    rfqNote();
  },
  init(form) {
    byId('rfq-pr').addEventListener('change', async () => {
      const id = byId('rfq-pr').value;
      if (!id) return;
      try {
        const pr = await apiRequest(`api/purchase-requests.php?id=${id}`);
        await loadPurchaseLines(form, pr.items, line => ({ ...purchaseLineRow(line), quantity: pbQty(pbNum(line.quantity)) }));
        showToast('Items fetched', `${pr.items.length} item${pr.items.length === 1 ? '' : 's'} from ${pr.code}.`);
      } catch (error) { showToast('The purchase request could not be loaded', error.message, true); }
    });
  },
});

/* ---------- Purchase Order ---------- */
async function poShowSupplier({ keepContact = true } = {}) {
  const id = byId('po-supplier').value;
  const contactSelect = byId('po-contact-select');
  const currency = byId('po-currency');
  if (!id) {
    fillSelect(contactSelect, [], 'Select contact person');
    fillSelect(currency, [], 'Select a supplier first');
    byId('po-contact-hint').hidden = false;
    return null;
  }
  let supplier;
  try { supplier = await pbSupplier(id); } catch (error) { showToast('The supplier could not be loaded', error.message, true); return null; }
  if (byId('po-supplier').value !== id) return null;
  const contacts = (supplier.contacts || []).filter(contact => contact.name);
  fillSelect(contactSelect, contacts.map(contact => ({ value: contact.name, label: contact.designation ? `${contact.name} · ${contact.designation}` : contact.name })),
    contacts.length ? 'Select contact person' : 'No contacts on file');
  if (!keepContact) byId('po-contact').value = '';
  contactSelect.value = byId('po-contact').value;
  fillSelect(currency, [{ value: supplier.currency, label: supplier.currency }]);
  currency.value = supplier.currency;
  byId('po-contact-hint').hidden = true;
  return supplier;
}

const poForm = createPurchaseForm({
  key: 'po', route: 'purchase-book/purchase-order/new', noun: 'Purchase Order', api: 'api/purchase-orders.php',
  kind: 'po', template: 'pb-line-po', lookups: ['purchaseorder'],
  firstField: () => byId('po-date'),
  fieldNodes: { poDate: 'po-date', purchaseRequestId: 'po-reference', quotationRequestId: 'po-reference', quotationNumber: 'po-quotation-no',
    status: 'po-status', deliveryDate: 'po-delivery-date', deliveryLocation: 'po-location', deliveryTerms: 'po-terms', paymentMode: 'po-payment',
    supplierId: 'po-supplier', contactName: 'po-contact-select', email: 'po-email', discountAmount: 'po-discount', shipping: 'po-shipping' },
  header() {
    const [kind, id] = byId('po-reference').value.split(':');
    return {
      poDate: byId('po-date').value, purchaseRequestId: kind === 'pr' ? id : null, quotationRequestId: kind === 'rfq' ? id : null,
      quotationNumber: byId('po-quotation-no').value.trim(), status: byId('po-status').value, deliveryDate: byId('po-delivery-date').value,
      deliveryLocation: byId('po-location').value.trim(), deliveryTerms: byId('po-terms').value.trim(), paymentMode: byId('po-payment').value,
      supplierId: byId('po-supplier').value || null, contactName: byId('po-contact').value, email: byId('po-email').value.trim(),
    };
  },
  check(form, errors) {
    if (!byId('po-supplier').value) errors.push({ node: byId('po-supplier'), message: 'Select the supplier.' });
    if (byId('po-delivery-date').value && byId('po-delivery-date').value < byId('po-date').value) {
      errors.push({ node: byId('po-delivery-date'), message: 'The delivery date cannot be before the PO date.' });
    }
  },
  afterRestore: () => poShowSupplier(),
  listRoute: 'purchase-book/purchase-order',
  fill(form, po) {
    byId('po-date').value = po.poDate;
    const reference = po.purchaseRequestId ? [`pr:${po.purchaseRequestId}`, po.purchaseRequestCode]
      : po.quotationRequestId ? [`rfq:${po.quotationRequestId}`, po.quotationRequestCode] : ['', ''];
    setSelectValue(byId('po-reference'), ...reference);
    byId('po-quotation-no').value = po.quotationNumber;
    setSelectValue(byId('po-status'), po.status);
    byId('po-delivery-date').value = po.deliveryDate || '';
    byId('po-location').value = po.deliveryLocation;
    byId('po-terms').value = po.deliveryTerms;
    setSelectValue(byId('po-payment'), po.paymentMode);
    setSelectValue(byId('po-supplier'), po.supplierId, po.supplierName);
    byId('po-contact').value = po.contactName;
    byId('po-email').value = po.email;
  },
  afterFill: () => poShowSupplier(),
  async onReset() {
    byId('po-date').value = todayInputValue();
    poShowSupplier();
    const suppliers = purchaseOptions(byId('po-supplier'), 'api/suppliers.php', row => row.name);
    const reference = byId('po-reference');
    try {
      const [requests, quotations] = await Promise.all([apiRequest('api/purchase-requests.php'), apiRequest('api/quotation-requests.php')]);
      const group = (label, rows, kind, text) => {
        const node = document.createElement('optgroup');
        node.label = label;
        node.append(...rows.map(row => new Option(text(row), `${kind}:${row.id}`)));
        return node;
      };
      const keep = reference.value;
      reference.replaceChildren(new Option('None (direct order)', ''),
        ...(requests.length ? [group('Purchase Request', requests, 'pr', row => `${row.code} · ${row.itemCount} item${row.itemCount === 1 ? '' : 's'}`)] : []),
        ...(quotations.length ? [group('Quotation Request', quotations, 'rfq', row => `${row.code} · ${row.name}`)] : []));
      reference.value = keep;
    } catch (error) { showToast('Purchase and quotation requests could not be loaded', error.message, true); }
    await suppliers;
  },
  init(form) {
    byId('po-supplier').addEventListener('change', async () => {
      byId('po-contact').value = '';
      const supplier = await poShowSupplier({ keepContact: false });
      if (supplier && !byId('po-email').value.trim() && supplier.email) byId('po-email').value = supplier.email;
      form.page.absorb();
    });
    byId('po-contact-select').addEventListener('change', async () => {
      const supplier = byId('po-supplier').value ? await pbSupplier(byId('po-supplier').value) : null;
      const contact = supplier?.contacts?.find(entry => entry.name === byId('po-contact').value);
      if (contact?.email) { byId('po-email').value = contact.email; form.page.absorb(); }
    });
    byId('po-reference').addEventListener('change', async () => {
      const [kind, id] = byId('po-reference').value.split(':');
      if (!id) return;
      try {
        const doc = await apiRequest(`api/${kind === 'pr' ? 'purchase-requests' : 'quotation-requests'}.php?id=${id}`);
        if (kind === 'rfq' && doc.suppliers.length === 1 && !byId('po-supplier').value) {
          byId('po-supplier').value = String(doc.suppliers[0].id);
          const supplier = await poShowSupplier({ keepContact: false });
          if (supplier?.email && !byId('po-email').value.trim()) byId('po-email').value = supplier.email;
        }
        await loadPurchaseLines(form, doc.items, line => ({ ...purchaseLineRow(line), quantity: pbQty(pbNum(line.quantity)) }));
        // The item's buying rate as the starting price.
        for (const row of form.page.rowsOf('items')) {
          const itemId = pbCell(row, 'itemId').value;
          if (!itemId) continue;
          const item = await pbItem(itemId).catch(() => null);
          if (item && pbNum(item.buyingRate) > 0) pbCell(row, 'price').value = pbMoney(pbNum(item.buyingRate));
        }
        form.page.absorb();
        form.refresh();
        showToast('Items fetched', `${doc.items.length} item${doc.items.length === 1 ? '' : 's'} from ${doc.code}.`);
      } catch (error) { showToast('The items could not be fetched', error.message, true); }
    });
  },
});

/* ---------- Goods Receipt Note ---------- */
const grnForm = createPurchaseForm({
  key: 'grn', route: 'purchase-book/grn/new', noun: 'GRN', api: 'api/grns.php',
  kind: 'grn', template: 'pb-line-grn', lookups: [],
  firstField: () => byId('grn-date'),
  fieldNodes: { grnDate: 'grn-date', supplierId: 'grn-supplier', warehouseId: 'grn-warehouse', poNumber: 'grn-po', purchaseOrderId: 'grn-po',
    discountAmount: 'grn-discount', shipping: 'grn-shipping' },
  header: () => ({
    grnDate: byId('grn-date').value, supplierId: byId('grn-supplier').value || null, warehouseId: byId('grn-warehouse').value || null,
    purchaseOrderId: byId('grn-po-id').value || null, poNumber: byId('grn-po').value.trim(),
  }),
  check(form, errors) {
    if (!byId('grn-supplier').value) errors.push({ node: byId('grn-supplier'), message: 'Select the supplier.' });
    if (!byId('grn-warehouse').value) errors.push({ node: byId('grn-warehouse'), message: 'Select the warehouse the goods are received into.' });
  },
  onReset() {
    byId('grn-date').value = todayInputValue();
    forgetLookups('purchaseorder');
    return Promise.all([
      purchaseOptions(byId('grn-supplier'), 'api/suppliers.php', row => row.name),
      purchaseOptions(byId('grn-warehouse'), 'api/warehouses.php', row => `${row.name} (${row.type})`),
    ]);
  },
  listRoute: 'purchase-book/grn',
  fill(form, grn) {
    byId('grn-date').value = grn.grnDate;
    setSelectValue(byId('grn-supplier'), grn.supplierId, grn.supplierName);
    setSelectValue(byId('grn-warehouse'), grn.warehouseId, grn.warehouseName);
    byId('grn-po').value = grn.poNumber;
    byId('grn-po-id').value = grn.purchaseOrderId ?? '';
  },
  init(form) {
    form.warehouseId = () => byId('grn-warehouse').value;
    byId('grn-warehouse').addEventListener('change', () => {
      for (const row of form.page.rowsOf('items')) setRowRacks(row, byId('grn-warehouse').value);
      form.page.absorb();
    });
    // Picking a purchase order fills the supplier and its lines (received = ordered, all accepted).
    byId('grn-form').addEventListener('input', async event => {
      if (event.target.id !== 'grn-po' || !suggest.picking) return;
      const id = byId('grn-po-id').value;
      if (!id) return;
      try {
        const po = await apiRequest(`api/purchase-orders.php?id=${id}`);
        if (po.supplierId) byId('grn-supplier').value = String(po.supplierId);
        byId('grn-vat-mode').value = po.vatMode;
        await loadPurchaseLines(form, po.items, line => ({
          ...purchaseLineRow(line), receivedQty: pbQty(pbNum(line.quantity)), acceptedQty: pbQty(pbNum(line.quantity)), rejectedQty: '0',
          unitCost: pbMoney(pbNum(line.price)), vatRate: pbQty(pbNum(line.vatRate)), discountPct: pbQty(pbNum(line.discountPct)),
        }));
        form.page.el('form').querySelectorAll('[data-vat]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.vat === po.vatMode)));
        showToast('Items fetched', `${po.items.length} item${po.items.length === 1 ? '' : 's'} from ${po.code}.`);
      } catch (error) { showToast('The purchase order could not be loaded', error.message, true); }
    });
  },
});

const PURCHASE_FORMS = [prForm, rfqForm, poForm, grnForm];

/* ---------- Purchase Book list pages  (#/purchase-book/purchase-request, quotation-request, purchase-order, grn) ----------
   The master list page (createMasterList) for each document: search, Filter (by document and date), View with the
   item lines, Edit (the form with the document filled in), PDF, Delete, Import and CSV export. Quick Menu ›
   Purchase Book opens these; Purchase Book › Create still opens the empty forms. */

const pbDate = value => (value ? shortDate(String(value).slice(0, 10)) : '');
const pbAmount = value => (value === null || value === undefined || value === '' ? '' : pbMoney(pbNum(value)));

// The View popup's item table for one document kind.
function purchaseItemsSection(kind) {
  return record => {
    const item = line => [line.itemCode, line.itemName, line.brandName];
    const table = kind === 'grn'
      ? viewTable(['Code', 'Item', 'Brand', 'Received', 'Accepted', 'Rejected', 'Unit', 'Expiry', 'Rack', 'Unit Cost', 'VAT %', 'Disc %', 'Total'],
        record.items.map(l => [...item(l), pbQty(pbNum(l.receivedQty)), pbQty(pbNum(l.acceptedQty)), pbQty(pbNum(l.rejectedQty)), l.unit,
          pbDate(l.expiryDate), l.rackCode, pbAmount(l.unitCost), pbQty(pbNum(l.vatRate)), pbQty(pbNum(l.discountPct)), pbAmount(l.lineTotal)]), 'No items.')
      : kind === 'po'
        ? viewTable(['Code', 'Item', 'Brand', 'Qty', 'Unit', 'Price', 'VAT %', 'Disc %', 'Disc. Amt', 'FOC', 'Line Total'],
          record.items.map(l => [...item(l), pbQty(pbNum(l.quantity)), l.unit, pbAmount(l.price), pbQty(pbNum(l.vatRate)), pbQty(pbNum(l.discountPct)),
            pbAmount(l.discountAmount), l.foc ? 'Yes' : 'No', pbAmount(l.lineTotal)]), 'No items.')
        : viewTable(['Code', 'Item', 'Brand', 'Quantity', 'Unit'],
          record.items.map(l => [...item(l), pbQty(pbNum(l.quantity)), l.unit]), 'No items.');
    const sections = [viewSection(`Items (${record.items.length})`, table)];
    if (kind === 'po' || kind === 'grn') {
      sections.push(viewSection('Summary', viewFields([
        { label: 'Prices', value: record.vatMode === 'exclude' ? 'Exclude VAT (added on top)' : 'Include VAT' },
        { label: 'Subtotal', value: pbAmount(record.subtotal) }, { label: 'VAT', value: pbAmount(record.vatAmount) },
        { label: 'Discount Amount', value: pbAmount(record.discountAmount) }, { label: 'Shipping Price', value: pbAmount(record.shipping) },
        { label: 'Grand Total', value: pbAmount(record.grandTotal) },
      ])));
    }
    sections.push(viewSection('Remarks & Print', viewFields([
      { label: 'Remarks', value: record.remarks, column: { type: 'wrap' } },
      { label: 'Signatory Slots', value: record.includeSignatory ? 'Included' : 'Not included' },
      { label: 'Seal', value: record.attachSeal ? 'Attached' : 'Not attached' },
    ])));
    return sections;
  };
}

/* Import: one item line per sheet row. Rows with the same Document No become one document (a blank
   Document No makes the row a document of its own); the first row of a group gives the header fields. */
const readSheetDate = label => value => {
  if (!value) return '';
  if (/^\d{4,6}(\.\d+)?$/.test(value)) {               // an Excel date serial (days since 1899-12-30)
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(value)) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value);   // day first (11/06/2026 is 11 June)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  throw new Error(`${label} "${value}" is not a date (use YYYY-MM-DD or DD-MM-YYYY)`);
};
const readSheetNumber = (label, decimals = 3) => value => {
  if (!value) return '';
  const text = value.replace(/,/g, '');
  if (!new RegExp(`^\\d{1,11}(\\.\\d{1,${decimals}})?$`).test(text)) throw new Error(`${label} "${value}" must be a number with up to ${decimals} decimals`);
  return text;
};
const readVatMode = value => {
  if (!value) return '';
  if (/^incl/i.test(value)) return 'include';
  if (/^excl/i.test(value)) return 'exclude';
  throw new Error(`VAT "${value}" must be Include or Exclude`);
};

const PB_IMPORT_GROUP = { key: 'docNo', label: 'Document No', headers: ['document', 'document number', 'doc no', 'group', 'sl no'] };
const PB_IMPORT_ITEM = [
  { key: 'itemCode', label: 'Item Code', headers: ['code', 'sku', 'part no'] },
  { key: 'itemName', label: 'Item Name', headers: ['item', 'description', 'item description', 'product'] },
  { key: 'brand', label: 'Brand', headers: ['make', 'brand name'] },
];
const pbImportQty = { key: 'quantity', label: 'Quantity', headers: ['qty'], read: readSheetNumber('Quantity') };
const pbImportUnit = { key: 'unit', label: 'Unit', headers: ['uom', 'unit of measure'] };
const pbImportRemarks = { key: 'remarks', label: 'Remarks', headers: ['notes', 'comments'] };

function groupSheetDocuments(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.docNo ? `doc:${row.docNo.toLowerCase()}` : `line:${row.sheetLine}`;
    if (!groups.has(key)) groups.set(key, { ...row, code: '', name: row.docNo || row.itemName, lines: [] });
    groups.get(key).lines.push(row);
  }
  return [...groups.values()];
}

// Looks a master record up by name or code; a typed item that is not in the master stays free text.
async function optionalLookupId(kind, text) {
  if (!text) return null;
  try { return await importLookupId(kind, text); } catch { return null; }
}
async function importItemLine(row) {
  const itemId = await optionalLookupId('item', row.itemName) ?? await optionalLookupId('itemcode', row.itemCode);
  return {
    itemId, itemCode: row.itemCode, itemName: row.itemName, brandId: await optionalLookupId('brand', row.brand), brandName: row.brand,
    uomId: await optionalLookupId('uom', row.unit), unit: row.unit,
  };
}

function purchaseList(spec) {
  return createMasterList({
    key: spec.key, route: spec.route, newRoute: `#/${spec.route}/new`, noun: spec.noun, nouns: spec.nouns,
    api: spec.api, lookups: spec.lookups || [], formPage: spec.key, edit: id => spec.form.page.edit(id),
    dateOf: spec.dateOf, pdf: row => printPurchaseDocument(spec, row.id), related: purchaseItemsSection(spec.kind),
    columns: spec.columns, fromApi: spec.fromApi, sample: {},
    importColumns: [PB_IMPORT_GROUP, ...spec.importColumns], importKey: 'itemName', importSamples: spec.importSamples,
    importHint: 'One item per row. Rows with the same Document No become one document; a blank Document No makes a document of one item.',
    matchRow: () => undefined,                  // every import adds new documents (the server numbers them)
    groupRows: groupSheetDocuments,
    async toPayload(group) {
      const items = [];
      for (const line of group.lines) items.push({ ...await importItemLine(line), ...spec.importLine(line) });
      return { ...await spec.importHeader(group), remarks: group.remarks, items };
    },
  });
}

const prList = purchaseList({
  key: 'pr', route: 'purchase-book/purchase-request', noun: 'Purchase Request', nouns: 'Purchase Requests', api: 'api/purchase-requests.php',
  kind: 'simple', form: prForm, dateOf: record => record.requestedDate,
  columns: [
    { key: 'code', label: 'PR ID', type: 'code', group: 'Request' },
    { key: 'date', label: 'Date', type: 'mono', group: 'Request' },
    { key: 'referenceNo', label: 'Reference ID', type: 'mono', group: 'Request' },
    { key: 'purchaseType', label: 'Purchase Type', type: 'pill', group: 'Request' },
    { key: 'requestedBy', label: 'Requested By', type: 'name', group: 'Requester & Delivery' },
    { key: 'requiredDate', label: 'Required By', type: 'mono', group: 'Schedule' },
    { key: 'itemCount', label: 'Items', type: 'qty', group: 'Request' },
    { key: 'totalQty', label: 'Total Qty', type: 'qty-ok', group: 'Request' },
    detail({ key: 'deliveryLocation', label: 'Delivery Location', group: 'Requester & Delivery' }),
  ],
  fromApi: r => ({ ...r, date: r.requestedDate, requiredDate: r.requiredDate || '' }),
  importColumns: [{ key: 'referenceNo', label: 'Reference ID', headers: ['reference', 'ref'] },
    { key: 'purchaseType', label: 'Purchase Type', headers: ['type'], read: value => (value ? readChoice('purchase type', ['Against Order', 'Stock Replenishment', 'Direct Purchase', 'Urgent'])(value) : '') },
    { key: 'requestedDate', label: 'Requested Date', headers: ['date', 'request date'], read: readSheetDate('Requested date') },
    { key: 'requiredDate', label: 'Required Delivery Date', headers: ['required date', 'required by'], read: readSheetDate('Required date') },
    { key: 'deliveryLocation', label: 'Delivery Location', headers: ['location'] },
    ...PB_IMPORT_ITEM, pbImportQty, pbImportUnit, pbImportRemarks],
  importSamples: [
    { docNo: '1', referenceNo: 'SO-2026-014', purchaseType: 'Against Order', requestedDate: '2026-11-10', deliveryLocation: 'Main Store', itemName: 'GATE VALVE 2"', quantity: '10', unit: 'Pieces' },
    { docNo: '1', itemName: 'PTFE TAPE', quantity: '25', unit: 'Pieces' },
  ],
  importHeader: async g => ({ referenceNo: g.referenceNo, purchaseType: g.purchaseType, requestedDate: g.requestedDate, requiredDate: g.requiredDate, deliveryLocation: g.deliveryLocation }),
  importLine: line => ({ quantity: line.quantity || '1' }),
});

const rfqList = purchaseList({
  key: 'rfq', route: 'purchase-book/quotation-request', noun: 'Quotation Request', nouns: 'Quotation Requests', api: 'api/quotation-requests.php',
  kind: 'simple', form: rfqForm, dateOf: record => record.requestDate,
  columns: [
    { key: 'code', label: 'RFQ ID', type: 'code', group: 'Request' },
    { key: 'date', label: 'Date', type: 'mono', group: 'Request' },
    { key: 'purchaseRequestCode', label: 'PR ID', type: 'mono', group: 'Request' },
    { key: 'name', label: 'Suppliers', type: 'name', group: 'Suppliers' },
    { key: 'submissionDeadline', label: 'Deadline', type: 'mono', group: 'Schedule' },
    { key: 'itemCount', label: 'Items', type: 'qty', group: 'Request' },
    { key: 'totalQty', label: 'Total Qty', type: 'qty-ok', group: 'Request' },
  ],
  fromApi: r => ({ ...r, date: r.requestDate, submissionDeadline: r.submissionDeadline || '' }),
  importColumns: [{ key: 'prCode', label: 'PR ID', headers: ['purchase request', 'pr', 'pr no'] },
    { key: 'requestDate', label: 'Quotation Req Date', headers: ['date', 'request date', 'rfq date'], read: readSheetDate('Request date') },
    { key: 'deadline', label: 'Submission Deadline', headers: ['deadline'], read: readSheetDate('Submission deadline') },
    { key: 'suppliers', label: 'Suppliers', headers: ['supplier', 'supplier names', 'vendors'] },
    ...PB_IMPORT_ITEM, pbImportQty, pbImportUnit, pbImportRemarks],
  importSamples: [
    { docNo: '1', requestDate: '2026-11-10', deadline: '2026-11-17', suppliers: 'GULF VALVES LLC, OMAN PIPES', itemName: 'GATE VALVE 2"', quantity: '10', unit: 'Pieces' },
    { docNo: '1', itemName: 'PTFE TAPE', quantity: '25', unit: 'Pieces' },
  ],
  async importHeader(g) {
    const names = String(g.suppliers || '').split(/[,;]/).map(name => name.trim()).filter(Boolean);
    const supplierIds = [];
    for (const name of names) supplierIds.push(await importLookupId('supplier', name));
    const prs = g.prCode ? await apiRequest('api/purchase-requests.php') : [];
    const pr = prs.find(row => sameText(row.code, g.prCode));
    if (g.prCode && !pr) throw new Error(`there is no purchase request "${g.prCode}"`);
    return { purchaseRequestId: pr?.id ?? null, requestDate: g.requestDate, submissionDeadline: g.deadline, supplierIds };
  },
  importLine: line => ({ quantity: line.quantity || '1' }),
});

const poList = purchaseList({
  key: 'po', route: 'purchase-book/purchase-order', noun: 'Purchase Order', nouns: 'Purchase Orders', api: 'api/purchase-orders.php',
  kind: 'po', form: poForm, lookups: ['purchaseorder'], dateOf: record => record.poDate,
  columns: [
    { key: 'code', label: 'PO ID', type: 'code', group: 'Order' },
    { key: 'date', label: 'Date', type: 'mono', group: 'Order' },
    { key: 'name', label: 'Supplier', type: 'name', group: 'Supplier' },
    { key: 'reference', label: 'Reference', type: 'mono', group: 'Order' },
    { key: 'status', label: 'Status', type: 'pill', group: 'Order' },
    { key: 'totalQty', label: 'Total Qty', type: 'qty', group: 'Order' },
    { key: 'grandTotal', label: 'Grand Total', type: 'qty-ok', group: 'Order' },
    detail({ key: 'quotationNumber', label: 'Quotation Number', group: 'Order' }),
    detail({ key: 'deliveryDate', label: 'Delivery Date', group: 'Delivery & Payment' }),
    detail({ key: 'deliveryLocation', label: 'Delivery Location', group: 'Delivery & Payment' }),
    detail({ key: 'deliveryTerms', label: 'Delivery Terms', group: 'Delivery & Payment' }),
    detail({ key: 'paymentMode', label: 'Payment Mode', group: 'Delivery & Payment' }),
    detail({ key: 'contactName', label: 'Contact Person', group: 'Supplier' }),
    detail({ key: 'email', label: 'Email ID', type: 'upper', group: 'Supplier' }),
    detail({ key: 'currency', label: 'Currency', type: 'pill', group: 'Supplier' }),
  ],
  fromApi: r => ({ ...r, date: r.poDate, reference: r.purchaseRequestCode || r.quotationRequestCode || '', grandTotal: pbAmount(r.grandTotal), deliveryDate: r.deliveryDate || '' }),
  importColumns: [{ key: 'poDate', label: 'PO Date', headers: ['date', 'order date'], read: readSheetDate('PO date') },
    { key: 'supplier', label: 'Supplier', headers: ['supplier name', 'vendor'] },
    { key: 'status', label: 'Status', read: value => (value ? readChoice('status', ['Draft', 'Sent', 'Confirmed', 'Partially Received', 'Received', 'Cancelled'])(value) : '') },
    { key: 'quotationNumber', label: 'Quotation Number', headers: ['quotation no', 'quote no'] },
    { key: 'paymentMode', label: 'Payment Mode', headers: ['payment'], read: value => (value ? readChoice('payment mode', ['Cash', 'Bank Transfer', 'Cheque', 'Credit', 'Card'])(value) : '') },
    { key: 'deliveryDate', label: 'Delivery Date', read: readSheetDate('Delivery date') },
    { key: 'deliveryLocation', label: 'Delivery Location', headers: ['location'] },
    { key: 'deliveryTerms', label: 'Delivery Terms', headers: ['terms'] },
    { key: 'vatMode', label: 'VAT', headers: ['vat mode', 'prices'], read: readVatMode },
    ...PB_IMPORT_ITEM, pbImportQty, pbImportUnit,
    { key: 'price', label: 'Price', headers: ['rate', 'unit price'], read: readSheetNumber('Price') },
    { key: 'vatRate', label: 'VAT %', headers: ['vat rate', 'vat percent'], read: readSheetNumber('VAT %', 2) },
    { key: 'discountPct', label: 'Disc %', headers: ['discount', 'discount %'], read: readSheetNumber('Disc %', 2) },
    pbImportRemarks],
  importSamples: [
    { docNo: '1', poDate: '2026-11-10', supplier: 'GULF VALVES LLC', status: 'Draft', paymentMode: 'Credit', vatMode: 'Include', itemName: 'GATE VALVE 2"', quantity: '10', unit: 'Pieces', price: '12.500', vatRate: '5' },
    { docNo: '1', itemName: 'PTFE TAPE', quantity: '25', unit: 'Pieces', price: '0.350', vatRate: '5' },
  ],
  importHeader: async g => ({
    poDate: g.poDate, supplierId: await importLookupId('supplier', g.supplier), status: g.status, quotationNumber: g.quotationNumber,
    paymentMode: g.paymentMode, deliveryDate: g.deliveryDate, deliveryLocation: g.deliveryLocation, deliveryTerms: g.deliveryTerms, vatMode: g.vatMode || 'include',
  }),
  importLine: line => ({ quantity: line.quantity || '1', price: line.price || '0', vatRate: line.vatRate || '5', discountPct: line.discountPct || '0' }),
});

const grnList = purchaseList({
  key: 'grn', route: 'purchase-book/grn', noun: 'GRN', nouns: 'GRNs', api: 'api/grns.php',
  kind: 'grn', form: grnForm, dateOf: record => record.grnDate,
  columns: [
    { key: 'code', label: 'GRN ID', type: 'code', group: 'Document' },
    { key: 'date', label: 'Date', type: 'mono', group: 'Document' },
    { key: 'poNumber', label: 'PO Number', type: 'mono', group: 'Document' },
    { key: 'name', label: 'Supplier', type: 'name', group: 'Document' },
    { key: 'totalQty', label: 'Total Qty', type: 'qty', group: 'Quantities' },
    { key: 'acceptedQty', label: 'Accepted Qty', type: 'qty-ok', group: 'Quantities' },
    detail({ key: 'warehouseName', label: 'Warehouse', group: 'Document' }),
    detail({ key: 'grandTotal', label: 'Grand Total', type: 'mono', group: 'Quantities' }),
  ],
  fromApi: r => ({ ...r, date: r.grnDate, grandTotal: pbAmount(r.grandTotal) }),
  importColumns: [{ key: 'grnDate', label: 'GRN Date', headers: ['date', 'receipt date'], read: readSheetDate('GRN date') },
    { key: 'supplier', label: 'Supplier', headers: ['supplier name', 'vendor'] },
    { key: 'warehouse', label: 'Warehouse', headers: ['stock point', 'store'] },
    { key: 'poNumber', label: 'PO Number', headers: ['po', 'po no', 'reference'] },
    { key: 'vatMode', label: 'VAT', headers: ['vat mode', 'costs'], read: readVatMode },
    ...PB_IMPORT_ITEM,
    { key: 'receivedQty', label: 'Received Qty', headers: ['received', 'quantity', 'qty'], read: readSheetNumber('Received qty') },
    { key: 'acceptedQty', label: 'Accepted Qty', headers: ['accepted'], read: readSheetNumber('Accepted qty') },
    { key: 'rejectedQty', label: 'Rejected Qty', headers: ['rejected'], read: readSheetNumber('Rejected qty') },
    pbImportUnit,
    { key: 'expiryDate', label: 'Expiry', headers: ['expiry date', 'batch expiry'], read: readSheetDate('Expiry') },
    { key: 'unitCost', label: 'Unit Cost', headers: ['cost', 'rate', 'price'], read: readSheetNumber('Unit cost') },
    { key: 'vatRate', label: 'VAT %', headers: ['vat rate'], read: readSheetNumber('VAT %', 2) },
    { key: 'discountPct', label: 'Disc %', headers: ['discount'], read: readSheetNumber('Disc %', 2) },
    pbImportRemarks],
  importSamples: [
    { docNo: '1', grnDate: '2026-11-10', supplier: 'GULF VALVES LLC', warehouse: 'Central WH North', poNumber: 'PO-0001', vatMode: 'Include', itemName: 'GATE VALVE 2"', receivedQty: '10', acceptedQty: '9', rejectedQty: '1', unit: 'Pieces', unitCost: '12.500', vatRate: '5' },
  ],
  async importHeader(g) {
    const pos = g.poNumber ? await apiRequest('api/purchase-orders.php') : [];
    const po = pos.find(row => sameText(row.code, g.poNumber));
    return {
      grnDate: g.grnDate, supplierId: await importLookupId('supplier', g.supplier), warehouseId: await importLookupId('warehouse', g.warehouse),
      purchaseOrderId: po?.id ?? null, poNumber: g.poNumber, vatMode: g.vatMode || 'include',
    };
  },
  importLine(line) {
    const received = pbNum(line.receivedQty);
    const rejected = pbNum(line.rejectedQty);
    const accepted = line.acceptedQty !== '' ? line.acceptedQty : pbQty(Math.max(0, received - rejected));
    return { receivedQty: line.receivedQty || '0', acceptedQty: accepted, rejectedQty: line.rejectedQty || pbQty(Math.max(0, received - pbNum(accepted))),
      expiryDate: line.expiryDate, unitCost: line.unitCost || '0', vatRate: line.vatRate || '5', discountPct: line.discountPct || '0' };
  },
});

const PURCHASE_LISTS = [prList, rfqList, poList, grnList];

/* ---------- PDF: the document laid out on A4 and handed to the browser's print dialog ("Save as PDF") ----------
   Ticked "Include Signatory Slots" adds Prepared / Checked / Approved boxes; "Attach Seal" prints the company seal. */
async function printPurchaseDocument(spec, id) {
  let doc;
  try { doc = await apiRequest(`${spec.api}?id=${id}`); } catch (error) { showToast('The document could not be opened', error.message, true); return; }
  const sheet = byId('pb-print-sheet');
  const title = { pr: 'Purchase Request', rfq: 'Request for Quotation', po: 'Purchase Order', grn: 'Goods Receipt Note' }[spec.key];
  const cell = (tag, className, text) => el(tag, className, String(text ?? '') || '—');
  const meta = {                     // functions: only the printed kind's fields are read
    pr: () => [['PR ID', doc.code], ['Requested Date', pbDate(doc.requestedDate)], ['Required By', pbDate(doc.requiredDate)], ['Reference ID', doc.referenceNo],
      ['Purchase Type', doc.purchaseType], ['Requested By', doc.requestedBy], ['Delivery Location', doc.deliveryLocation]],
    rfq: () => [['RFQ ID', doc.code], ['Request Date', pbDate(doc.requestDate)], ['Submission Deadline', pbDate(doc.submissionDeadline)], ['PR ID', doc.purchaseRequestCode],
      ['Suppliers', doc.suppliers.map(s => s.name).join(', ')]],
    po: () => [['PO ID', doc.code], ['PO Date', pbDate(doc.poDate)], ['Status', doc.status], ['Supplier', doc.supplierName], ['Contact Person', doc.contactName],
      ['Email', doc.email], ['Currency', doc.currency], ['Quotation No', doc.quotationNumber], ['Reference', doc.purchaseRequestCode || doc.quotationRequestCode],
      ['Delivery Date', pbDate(doc.deliveryDate)], ['Delivery Location', doc.deliveryLocation], ['Delivery Terms', doc.deliveryTerms], ['Payment Mode', doc.paymentMode]],
    grn: () => [['GRN ID', doc.code], ['GRN Date', pbDate(doc.grnDate)], ['Supplier', doc.supplierName], ['Warehouse', doc.warehouseName], ['PO Number', doc.poNumber]],
  }[spec.key]();
  const heads = {
    simple: ['#', 'Item Code', 'Item', 'Brand', 'Qty', 'Unit'],
    po: ['#', 'Item Code', 'Item', 'Brand', 'Qty', 'Unit', 'Price', 'VAT %', 'Disc.', 'Total'],
    grn: ['#', 'Item Code', 'Item', 'Received', 'Accepted', 'Rejected', 'Unit', 'Unit Cost', 'VAT %', 'Total'],
  }[spec.kind];
  const lineCells = (l, i) => ({
    simple: [i + 1, l.itemCode, l.itemName, l.brandName, pbQty(pbNum(l.quantity)), l.unit],
    po: [i + 1, l.itemCode, l.itemName, l.brandName, pbQty(pbNum(l.quantity)), l.unit, l.foc ? 'FOC' : pbAmount(l.price), pbQty(pbNum(l.vatRate)), pbAmount(l.discountAmount), pbAmount(l.lineTotal)],
    grn: [i + 1, l.itemCode, l.itemName, pbQty(pbNum(l.receivedQty)), pbQty(pbNum(l.acceptedQty)), pbQty(pbNum(l.rejectedQty)), l.unit, pbAmount(l.unitCost), pbQty(pbNum(l.vatRate)), pbAmount(l.lineTotal)],
  }[spec.kind]);

  const head = el('header', 'ps-head');
  const brand = el('div', 'ps-brand');
  brand.append(el('div', 'ps-company', byId('app')?.querySelector('.brand-name')?.textContent || 'Growth Engine'), el('div', 'ps-sub', 'Purchase Book'));
  const titleBox = el('div', 'ps-title-box');
  titleBox.append(el('h1', 'ps-title', title), el('div', 'ps-code', doc.code));
  head.append(brand, titleBox);

  const metaGrid = el('dl', 'ps-meta');
  for (const [label, value] of meta) {
    const item = el('div', 'ps-meta-item');
    item.append(cell('dt', '', label), cell('dd', '', value));
    metaGrid.append(item);
  }

  const table = el('table', 'ps-table');
  const thead = el('thead');
  const headRow = el('tr');
  headRow.append(...heads.map(text => el('th', '', text)));
  thead.append(headRow);
  const tbody = el('tbody');
  doc.items.forEach((line, i) => {
    const tr = el('tr');
    tr.append(...lineCells(line, i).map(value => cell('td', '', value)));
    tbody.append(tr);
  });
  table.append(thead, tbody);

  const parts = [head, metaGrid, table];
  if (spec.kind !== 'simple') {
    const totals = el('dl', 'ps-totals');
    for (const [label, value, strong] of [['Subtotal', doc.subtotal], [doc.vatMode === 'exclude' ? 'VAT' : 'VAT (included)', doc.vatAmount],
      ['Discount', doc.discountAmount], ['Shipping', doc.shipping], [`Grand Total${doc.currency ? ` (${doc.currency})` : ''}`, doc.grandTotal, true]]) {
      const row = el('div', strong ? 'ps-total-grand' : '');
      row.append(el('dt', '', label), el('dd', '', pbAmount(value)));
      totals.append(row);
    }
    parts.push(totals);
  }
  if (doc.remarks) {
    const remarks = el('div', 'ps-remarks');
    remarks.append(el('strong', '', 'Remarks: '), document.createTextNode(doc.remarks));
    parts.push(remarks);
  }
  const foot = el('footer', 'ps-foot');
  if (doc.includeSignatory) {
    const signs = el('div', 'ps-signs');
    for (const label of ['Prepared By', 'Checked By', 'Approved By']) signs.append(el('div', 'ps-sign', label));
    foot.append(signs);
  }
  let sealLoaded = Promise.resolve();
  if (doc.attachSeal) {
    const seal = el('img', 'ps-seal');
    seal.alt = 'Company seal';
    sealLoaded = new Promise(resolve => { seal.onload = resolve; seal.onerror = () => { seal.remove(); resolve(); }; });
    seal.src = `api/company-seal.php?file=1&t=${Date.now()}`;
    foot.append(seal);
  }
  parts.push(foot);
  sheet.replaceChildren(...parts);
  await sealLoaded;

  const pageTitle = document.title;
  document.title = `${doc.code} ${title}`;              // the browser's suggested PDF file name
  document.body.classList.add('is-printing');
  const done = () => {
    document.body.classList.remove('is-printing');
    document.title = pageTitle;
    sheet.replaceChildren();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

function initPurchaseBook() {
  composePurchaseTemplates();
  for (const form of PURCHASE_FORMS) form.page.init();
  for (const list of PURCHASE_LISTS) list.init();
  initSealButtons();
  loadPurchaseMasters();
  // Items made in another tab (Create Item) show up in the searches once this tab is back in front.
  window.addEventListener('focus', () => {
    if (!PURCHASE_FORMS.some(form => form.spec.key === currentPage)) return;
    forgetLookups('item', 'itemcode');
    pbData.items.clear();
  });
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
  initInputFilters();
  initUppercaseFields();
  initFieldChecks();
  initFocusScrolling();
  initQuickMenu();
  initLookups();
  initSuggestFields();
  initItemPage();
  for (const form of MASTER_FORMS) form.init();
  initPurchaseBook();
  initMasterFilter();
  initMasterImport();
  initMasterView();
  initMasterConfirm();
  for (const list of MASTER_LISTS) list.init();
  loadDashboard();
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
});
