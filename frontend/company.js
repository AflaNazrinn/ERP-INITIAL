/* Create a Company (company.html), opened from "Create a company" on the sign-in page.
   GET api/session.php gives the CSRF token; GET api/companies.php says whether companies may be created here
   and whether an access key is asked for. POST api/companies.php (multipart: every field + logo, letterhead,
   crCertificate, vatCertificate) creates the company with a database of its own, then the page offers the
   sign-in page with the new company code filled in.
   Keys as on the other modules (see "keyboard" below): Enter next field, arrows and Tab move around,
   Shift+Enter creates the company, Esc goes back to sign in. */

'use strict';

const $ = id => document.getElementById(id);
const form = $('cc-form');
let csrfToken = null;
let codeIsAuto = true;
let busy = false;

const SECTIONS = {
  basic:        ['companyName', 'companyCode', 'companyType', 'businessType'],
  registration: ['crNumber', 'crExpiry', 'vatNumber', 'legalStructure'],
  financial:    ['financialYearStart', 'vatApplicable', 'vatPercentage'],
  address:      ['building', 'street', 'area', 'city', 'country', 'baseCurrency', 'poBox', 'postalCode', 'phone', 'email', 'website'],
  bank:         ['bankName', 'accountHolder', 'accountNumber', 'iban', 'swiftCode'],
  documents:    ['logo', 'letterhead', 'crCertificate', 'vatCertificate'],
  login:        ['username', 'password', 'confirmPassword'],
};
const FILE_KEYS = SECTIONS.documents;
// The countries and currencies of the other modules, in the same order (COUNTRIES and PO_CURRENCIES in dashboard.js).
// Each with its currency and calling code, and the fewest / most digits a phone number has after the code
// (the same list as COUNTRIES in dashboard.js and PHONE_DIGITS in backend/src/master_validation.php).
const COUNTRIES = [
  ['OM', 'Oman', 'OMR', '+968', 8, 8], ['AE', 'United Arab Emirates', 'AED', '+971', 8, 9], ['IN', 'India', 'INR', '+91', 10, 10],
  ['SA', 'Saudi Arabia', 'SAR', '+966', 8, 9], ['QA', 'Qatar', 'QAR', '+974', 8, 8], ['KW', 'Kuwait', 'KWD', '+965', 8, 8], ['BH', 'Bahrain', 'BHD', '+973', 8, 8],
  ['PK', 'Pakistan', 'PKR', '+92', 9, 10], ['EG', 'Egypt', 'EGP', '+20', 8, 10], ['JO', 'Jordan', 'JOD', '+962', 8, 9], ['TR', 'Türkiye', 'TRY', '+90', 10, 10],
  ['CN', 'China', 'CNY', '+86', 10, 11], ['JP', 'Japan', 'JPY', '+81', 9, 10], ['KR', 'South Korea', 'KRW', '+82', 8, 10], ['DE', 'Germany', 'EUR', '+49', 6, 11],
  ['IT', 'Italy', 'EUR', '+39', 6, 11], ['GB', 'United Kingdom', 'GBP', '+44', 9, 10], ['US', 'United States', 'USD', '+1', 10, 10],
].map(([code, name, currency, dial, min, max]) => ({ id: name, code, name, currency, dial, min, max }));

/* Phone: a calling-code dropdown in front of the number, as on the other modules. The code follows the Country;
   Enter passes it by (data-enter-skip), ← from the start of the number, Tab or a click reach it. The value sent and
   printed is one string, "+968 2450 4278"; a number typed with its own + code is kept as typed. */
function fillPhoneCodes(select) {
  select.replaceChildren(...COUNTRIES.map(country => {
    const option = document.createElement('option');
    option.value = option.textContent = country.dial;
    option.dataset.country = country.name;                     // shown beside the code in the open list
    return option;
  }));
}
function phoneValue() {
  const number = field('phone').value.trim();
  if (!number) return '';
  return number.startsWith('+') ? number : `${$('cc-phoneCode').value} ${number}`;
}
/* Email and phone checks, the same flow as the other modules (initFieldChecks in dashboard.js): fields with
   data-check="email" / "phone" are checked when the user leaves them (marked red with the message; moving between
   the number and its own calling code is not leaving it), typing clears the mark, Create checks them all again,
   and the server repeats the same checks. */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;   // name@domain.tld, as dashboard.js
const emailProblem = value => (!value.trim() || EMAIL.test(value.trim()) ? '' : 'Enter a valid email address, like name@company.com.');
const fieldCheckProblem = input => (input.dataset.check === 'email' ? emailProblem(input.value) : input.dataset.check === 'phone' ? phoneProblem() : '');

// Why the number is not valid for its country ('' when it is), as phoneProblem() in dashboard.js.
function phoneProblem() {
  let text = field('phone').value.trim();
  if (!text) return '';
  let country = COUNTRIES.find(entry => entry.dial === $('cc-phoneCode').value) || null;
  if (text.startsWith('+')) {
    country = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find(entry => text.startsWith(entry.dial)) || null;
    text = country ? text.slice(country.dial.length) : text.slice(1);
  }
  const digits = text.replace(/[\s\-().]/g, '');
  if (!/^\d+$/.test(digits)) return 'Use digits only (spaces and dashes are fine).';
  if (!country) return digits.length >= 6 && digits.length <= 15 ? '' : 'Enter 6 to 15 digits, or start with a country code such as +968.';
  const national = digits.length > country.max && digits.startsWith('0') ? digits.slice(1) : digits;
  if (national.length >= country.min && national.length <= country.max) return '';
  const range = country.min === country.max ? `${country.min} digits` : `${country.min} to ${country.max} digits`;
  return `Numbers in ${country.name} have ${range} after ${country.dial}.`;
}
const CURRENCIES = [['OMR', 'Omani Rial'], ['AED', 'UAE Dirham'], ['INR', 'Indian Rupee'], ['SAR', 'Saudi Riyal'], ['QAR', 'Qatari Riyal'], ['KWD', 'Kuwaiti Dinar'],
  ['BHD', 'Bahraini Dinar'], ['USD', 'US Dollar'], ['EUR', 'Euro'], ['GBP', 'British Pound'], ['PKR', 'Pakistani Rupee'],
  ['EGP', 'Egyptian Pound'], ['JOD', 'Jordanian Dinar'], ['TRY', 'Turkish Lira'], ['CNY', 'Chinese Yuan'], ['JPY', 'Japanese Yen'], ['KRW', 'South Korean Won']]
  .map(([code, name]) => ({ id: code, code, name }));

// The "Select …" popups (the same columns, titles and letters as LOOKUPS in dashboard.js).
const LOOKUPS = {
  country: { title: 'Select Country', letter: 'C', list: 'Country List', plural: 'countries', rows: () => COUNTRIES,
    columns: [['code', 'Code'], ['name', 'Country Name'], ['currency', 'Currency']], display: row => row.name },
  currency: { title: 'Select Currency', letter: '$', list: 'Currency List', plural: 'currencies', rows: () => CURRENCIES,
    columns: [['code', 'Code'], ['name', 'Currency Name']], display: row => `${row.code} – ${row.name}` },
};
// The CR and VAT certificates are optional (they may be added later).
const REQUIRED = [
  ['companyName', 'Company Name'], ['companyCode', 'Company Code'], ['logo', 'Company Logo'], ['letterhead', 'Letterhead'],
  ['username', 'Username'], ['password', 'Password'], ['confirmPassword', 'Confirm Password'],
];
const FILE_RULES = {
  logo:           { label: 'Company logo', types: ['png', 'jpg', 'jpeg', 'svg'], maxMb: 2 },
  letterhead:     { label: 'Letterhead', types: ['pdf', 'png', 'jpg', 'jpeg'], maxMb: 10 },
  crCertificate:  { label: 'CR certificate', types: ['pdf', 'png', 'jpg', 'jpeg'], maxMb: 10 },
  vatCertificate: { label: 'VAT certificate', types: ['pdf', 'png', 'jpg', 'jpeg'], maxMb: 10 },
};

const files = Object.fromEntries(FILE_KEYS.map(key => [key, null]));
const objectUrls = {};
let keyRequired = false;

/* ---------- values and counts ---------- */

const field = key => $(`cc-${key}`);
function hasValue(key) {
  if (FILE_KEYS.includes(key)) return files[key] !== null;
  if (key === 'vatApplicable') return true;
  if (key === 'companyCode' && codeIsAuto) return true;                              // the server gives it
  if (key === 'vatPercentage' && field('vatApplicable').value === '0') return true;   // not needed without VAT
  return field(key).value.trim() !== '';
}

function updateProgress() {
  let complete = 0;
  for (const [name, keys] of Object.entries(SECTIONS)) {
    const filled = keys.filter(hasValue).length;
    const card = form.querySelector(`[data-section="${name}"]`);
    card.querySelector('[data-count]').textContent = `${filled} of ${keys.length}`;
    card.classList.toggle('is-complete', filled === keys.length);
    if (filled === keys.length) complete++;
  }
  const total = Object.keys(SECTIONS).length;
  $('cc-progress-count').textContent = `${complete} of ${total}`;
  $('cc-progress-bar').style.width = `${(complete / total) * 100}%`;

  const missing = REQUIRED.filter(([key]) => !hasValue(key)).map(([, label]) => label);
  if (keyRequired && !field('accessKey').value) missing.push('Access Key');
  const note = $('cc-required');
  note.classList.toggle('is-done', missing.length === 0);
  note.textContent = missing.length === 0
    ? 'All required fields are filled'
    : `Required: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` +${missing.length - 3} more` : ''}`;
}

/* ---------- company code ----------
   Automatic, like every other record's code: the first two letters of the company name and the next number
   for them (BLUESUN INTERNATIONAL → BL0001, the next BL… company BL0002). The page asks the server for it as
   the name is typed (once per two letters); the server assigns it when the company is saved (codeAuto), so two
   people creating companies at once never get the same code. The pencil lets you type your own. */
let nextCode = '';
const CODE_FALLBACK_PREFIX = 'CO';     // a name without two Latin letters, as company_code_prefix() on the server
const codePrefix = name => {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '');
  return letters.length >= 2 ? letters.slice(0, 2) : CODE_FALLBACK_PREFIX;
};
const nextCodes = new Map();           // two letters → the code the server said they get next
async function refreshNextCode() {
  const name = field('companyName').value.trim();
  const prefix = name ? codePrefix(name) : '';
  if (prefix && !nextCodes.has(prefix)) {
    try {
      const response = await fetch(`api/companies.php?name=${encodeURIComponent(prefix)}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      const code = (await response.json()).data?.nextCode;
      if (code) nextCodes.set(prefix, code);
    } catch { return; }                // the server is not reachable: the page says so when it loads
  }
  if (prefix !== (field('companyName').value.trim() ? codePrefix(field('companyName').value.trim()) : '')) return;  // typed on meanwhile
  nextCode = prefix ? nextCodes.get(prefix) || '' : '';
  if (codeIsAuto) { field('companyCode').value = nextCode; updateProgress(); }
}
let nextCodeTimer = 0;
const refreshNextCodeSoon = () => { clearTimeout(nextCodeTimer); nextCodeTimer = setTimeout(refreshNextCode, 200); };
function setCodeMode(auto) {
  codeIsAuto = auto;
  const input = field('companyCode');
  input.readOnly = auto;
  $('cc-code-auto').hidden = !auto;
  $('cc-code-edit').setAttribute('aria-pressed', String(!auto));
  $('cc-code-edit').title = auto ? 'Type the code yourself' : 'Use the automatic code again';
  $('cc-code-edit').setAttribute('aria-label', auto ? 'Type the company code yourself' : 'Use the automatic company code again');
  if (auto) { input.value = nextCode; setFieldError('companyCode', ''); refreshNextCode(); }
  else { input.focus(); input.select(); }
  updateProgress();
}

/* ---------- errors ---------- */

function showAlert(message) {
  $('cc-alert').textContent = message || '';
  $('cc-alert').hidden = !message;
  if (message) $('cc-alert').scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function setFieldError(key, message) {
  if (FILE_KEYS.includes(key)) {
    form.querySelector(`.cc-doc[data-file="${key}"]`).classList.toggle('is-invalid', Boolean(message));
    if (key === 'letterhead') $('cc-preview').classList.toggle('is-invalid', Boolean(message));
    fileErrors[key] = message || '';
    const text = Object.values(fileErrors).filter(Boolean).join(' ');
    $('cc-error-files').textContent = text;
    $('cc-error-files').hidden = !text;
    return;
  }
  const input = field(key);
  if (!input) return;
  const row = input.closest('.cc-row');
  let error = row.querySelector('.cc-error');
  if (!error) {
    error = document.createElement('p');
    error.className = 'cc-error';
    error.id = `cc-error-${key}`;
    row.append(error);
  }
  error.textContent = message || '';
  error.hidden = !message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (message) input.setAttribute('aria-describedby', error.id); else if (key !== 'companyCode') input.removeAttribute('aria-describedby');
}
const fileErrors = {};

function clearErrors() {
  showAlert('');
  for (const keys of Object.values(SECTIONS)) for (const key of keys) setFieldError(key, '');
  setFieldError('accessKey', '');
}

function focusFirstError(keys) {
  const first = Object.values(SECTIONS).flat().concat('accessKey').find(key => keys.includes(key));
  if (!first) return;
  const target = FILE_KEYS.includes(first)
    ? form.querySelector(`[data-pick="${first}"]`) || $('cc-generate')
    : field(first);
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.focus({ preventScroll: true });
}

/* ---------- files ---------- */

function fileProblem(key, file) {
  const rule = FILE_RULES[key];
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  if (!rule.types.includes(extension)) return `${rule.label} must be ${rule.types.filter(t => t !== 'jpeg').join(', ').toUpperCase()}.`;
  if (file.size > rule.maxMb * 1024 * 1024) return `${rule.label} must be at most ${rule.maxMb} MB.`;
  return '';
}

const sizeText = bytes => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const isImage = file => /^image\/(png|jpeg|svg\+xml)$/.test(file.type) || /\.(png|jpe?g|svg)$/i.test(file.name);

function setFile(key, file) {
  if (objectUrls[key]) URL.revokeObjectURL(objectUrls[key]);
  objectUrls[key] = file && isImage(file) ? URL.createObjectURL(file) : null;
  files[key] = file;
  setFieldError(key, '');

  const tile = form.querySelector(`.cc-doc[data-file="${key}"]`);
  tile.classList.toggle('is-set', Boolean(file));
  tile.querySelector('[data-sub]').textContent = file ? `${file.name} · ${sizeText(file.size)}` : tile.dataset.hint;
  tile.querySelector('[data-sub]').title = file ? file.name : '';
  const button = tile.querySelector('.cc-mini-btn');
  if (button) button.textContent = file ? 'Change' : 'Upload';
  const icon = tile.querySelector('.cc-doc-icon');
  icon.querySelector('img')?.remove();
  icon.querySelector('svg').hidden = Boolean(key === 'logo' && objectUrls[key]);
  if (key === 'logo' && objectUrls[key]) {
    const img = document.createElement('img');
    img.src = objectUrls[key];
    img.alt = '';
    icon.append(img);
  }
  if (key === 'letterhead') showLetterhead();
  updateProgress();
}

function showLetterhead() {
  const file = files.letterhead;
  const img = $('cc-preview-img');
  $('cc-preview-open').hidden = !(file && objectUrls.letterhead);
  $('cc-letterhead-view').hidden = !(file && !objectUrls.letterhead);          // a PDF: opens in a new tab
  if (objectUrls.letterhead) img.src = objectUrls.letterhead; else img.removeAttribute('src');
  $('cc-preview-empty').hidden = Boolean(file && objectUrls.letterhead);
  $('cc-preview-title').textContent = file ? file.name : 'No letterhead yet';
  $('cc-preview-text').textContent = file
    ? `PDF letterhead · ${sizeText(file.size)}`
    : 'Upload your letterhead or generate one from the company details';
  $('cc-letterhead-remove').hidden = !file;
  form.querySelector('[data-pick="letterhead"] span').textContent = file ? 'Upload another' : 'Upload';
  $('cc-generate').querySelector('span').textContent = file ? 'Generate again' : 'Generate';
}

/* ---------- letterhead from the company details (A4 at 150 dpi, PNG) ----------
   Generate opens the Generate Letterhead popup (#cc-gen): it makes two letterheads from the designs in
   letterheads.js (in a random order), filled with the logo and the details typed so far, and shows them side by
   side. The popup's own Generate makes one more and moves the view on to it (1–2 → 2–3); the arrows page back and
   forward. A click on a letterhead chooses it (again: unchooses it); Save makes the chosen one the company's
   letterhead. Every Generate first plays the "being generated" sequence: the drawing itself is instant, the steps
   make it read as work being done. */

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const GENERATE_STEPS = ['Choosing a design', 'Matching your logo colours', 'Placing your logo', 'Adding company details', 'Adding CR & VAT number', 'Finishing the letterhead'];
const GENERATE_STEP_MS = 380;

function letterheadData(logo) {
  const value = key => field(key).value.trim();
  return {
    name: value('companyName'), logo,
    businessType: value('businessType') === 'Others' ? '' : value('businessType'),   // "OTHERS" is not printed
    email: value('email'), phone: phoneValue(), website: value('website'),
    cr: value('crNumber'), vat: value('vatNumber'),
    building: value('building'), street: value('street'), area: value('area'), city: value('city'), country: value('country'),
    poBox: value('poBox'), postalCode: value('postalCode'),
    colors: lhPalette(logo),                                    // the design takes its colours from the logo
  };
}

// The design drawn to a PNG; without the logo when the browser will not draw it (some SVGs taint the canvas).
async function drawLetterhead(design, logo) {
  const canvas = document.createElement('canvas');
  canvas.width = LETTERHEAD_WIDTH;
  canvas.height = LETTERHEAD_HEIGHT;
  const ctx = canvas.getContext('2d');
  const toBlob = () => new Promise(resolve => { try { canvas.toBlob(resolve, 'image/png'); } catch { resolve(null); } });
  try {
    design.draw(ctx, letterheadData(logo));
    const blob = await toBlob();
    if (blob) return blob;
  } catch { /* drawn again below without the logo */ }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  design.draw(ctx, letterheadData(null));
  return toBlob();
}

/* The popup's state: the letterheads made so far ({ design, url, blob }), the designs still to use (refilled,
   shuffled again, when every design has been shown), the first one shown (two at a time), the chosen one
   (-1: none yet; a click on a letterhead chooses it, a second click unchooses it). */
const gen = { made: [], order: [], start: 0, picked: -1, busy: false };
const GEN_PER_VIEW = 2;
const GEN_SUB = 'Made from your company details. Click a template to choose it.';
const genDialog = () => $('cc-gen');

function shuffledDesigns(avoidFirst = -1) {
  const order = LETTERHEADS.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1 && order[0] === avoidFirst) order.push(order.shift());   // never the same design twice in a row
  return order;
}

const CHECK_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"></path></svg>';

function renderGen() {
  const cards = $('cc-gen-cards');
  const shown = gen.made.slice(gen.start, gen.start + GEN_PER_VIEW);
  const nodes = shown.map((item, i) => {
    const index = gen.start + i;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'lg-card';
    card.dataset.index = String(index);
    card.setAttribute('aria-pressed', String(index === gen.picked));
    const head = document.createElement('span');
    head.className = 'lg-card-head';
    head.innerHTML = `<span class="lg-radio" aria-hidden="true">${CHECK_ICON}</span>`;
    head.append(Object.assign(document.createElement('span'), { className: 'lg-card-name', textContent: item.design.name }),
      Object.assign(document.createElement('span'), { className: 'lg-card-num', textContent: `Template ${index + 1}` }));
    const sheet = document.createElement('span');
    sheet.className = 'lg-sheet';
    sheet.append(Object.assign(new Image(), { src: item.url, alt: `${item.design.name} letterhead` }));
    card.append(head, sheet);
    return card;
  });
  // Before the first two are made: two blank sheets behind the loading message.
  while (nodes.length < GEN_PER_VIEW && !gen.made.length) {
    const blank = document.createElement('div');
    blank.className = 'lg-card is-blank';
    blank.innerHTML = '<span class="lg-card-head"><span class="lg-radio"></span><span class="lg-skel"></span></span><span class="lg-sheet"><span class="lg-skel lg-skel-top"></span></span>';
    nodes.push(blank);
  }
  cards.replaceChildren(...nodes);

  const total = gen.made.length;
  const last = Math.max(0, total - GEN_PER_VIEW);
  $('cc-gen-count').textContent = total ? `${gen.start + 1}–${Math.min(total, gen.start + GEN_PER_VIEW)} of ${total}` : '';
  const dialog = genDialog();
  dialog.querySelector('[data-gen="prev"]').disabled = gen.busy || gen.start === 0;
  dialog.querySelector('[data-gen="next"]').disabled = gen.busy || gen.start >= last;
  // A dot per pair the arrows can show (one dot while there are only two).
  const dots = total ? Array.from({ length: last + 1 }, (_, i) => {
    const dot = document.createElement('span');
    dot.className = i === gen.start ? 'is-current' : '';
    return dot;
  }) : [];
  $('cc-gen-dots').replaceChildren(...dots);
  $('cc-gen-more').disabled = gen.busy;
  // Save shows once a letterhead is chosen; the line under the title says which, and how to undo it.
  const chosen = gen.made[gen.picked];
  $('cc-gen-sub').textContent = chosen ? `${chosen.design.name} selected. Press Save to use it, or click it again to unselect.` : GEN_SUB;
  $('cc-gen-select').hidden = !chosen;
  $('cc-gen-select').disabled = gen.busy;
  cards.classList.toggle('is-busy', gen.busy);
}

// The "being generated" sequence over the cards; the fonts and the logo load while it plays.
async function playGenerating(steps, stepMs) {
  $('cc-gen-loading').hidden = false;
  $('cc-gen-progress').style.width = '0';
  for (const [index, step] of steps.entries()) {
    const noLogo = !objectUrls.logo && /logo/.test(step);
    $('cc-gen-step').textContent = step + (noLogo ? ' (no logo uploaded yet)' : '');
    $('cc-gen-progress').style.width = `${((index + 1) / steps.length) * 100}%`;
    await wait(stepMs);
  }
  $('cc-gen-loading').hidden = true;
}

// Makes `count` more letterheads, always after the full loading sequence; shows the last two. The chosen one
// stays chosen.
async function generateMore(count) {
  if (gen.busy) return;
  gen.busy = true;
  renderGen();
  try {
    const ready = Promise.all([
      document.fonts.load('700 40px Roboto').catch(() => null),
      document.fonts.load('600 17px "Roboto Mono"').catch(() => null),
      objectUrls.logo ? loadImage(objectUrls.logo).then(lhWithoutBackground).catch(() => null) : null,   // only the logo, no background
    ]);
    await playGenerating(GENERATE_STEPS, GENERATE_STEP_MS);
    const [, , logo] = await ready;
    for (let n = 0; n < count; n++) {
      if (!gen.order.length) gen.order = shuffledDesigns(LETTERHEADS.indexOf(gen.made.at(-1)?.design));
      const design = LETTERHEADS[gen.order.shift()];
      const blob = await drawLetterhead(design, logo);
      if (!blob) throw new Error('no image');
      gen.made.push({ design, blob, url: URL.createObjectURL(blob) });
    }
    gen.start = Math.max(0, gen.made.length - GEN_PER_VIEW);
  } catch {
    setFieldError('letterhead', 'The letterhead could not be generated in this browser. Upload one instead.');
    closeGen();
    return;
  } finally {
    $('cc-gen-loading').hidden = true;
    gen.busy = false;
  }
  renderGen();
  genDialog().querySelector(`.lg-card[data-index="${gen.made.length - 1}"]`)?.focus();   // the newest
}

function openGen() {
  if (gen.busy || genDialog().open) return;
  setFieldError('letterhead', '');
  for (const item of gen.made) URL.revokeObjectURL(item.url);
  Object.assign(gen, { made: [], order: shuffledDesigns(), start: 0, picked: -1 });
  renderGen();
  document.documentElement.classList.add('has-modal');
  genDialog().showModal();
  genDialog().querySelector('[data-gen="cancel"].lk-btn').focus();
  generateMore(Math.min(GEN_PER_VIEW, LETTERHEADS.length));
}

/* The letterhead full size: an image in a popup (#cc-view); a PDF in a new tab (the page may not embed one). */
let pdfUrl = null;
function viewLetterhead() {
  const file = files.letterhead;
  if (!file) return;
  if (!objectUrls.letterhead) {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(file);
    window.open(pdfUrl, '_blank', 'noopener');
    return;
  }
  $('cc-view-img').src = objectUrls.letterhead;
  $('cc-view-name').textContent = `${file.name} · ${sizeText(file.size)}`;
  document.documentElement.classList.add('has-modal');
  $('cc-view').showModal();
  $('cc-view').querySelector('[data-view="close"]').focus();
}
function closeView() {
  if ($('cc-view').open) $('cc-view').close();
  document.documentElement.classList.remove('has-modal');
  $('cc-preview-open').focus();
}

function closeGen() {
  const dialog = genDialog();
  if (dialog.open) dialog.close();
  document.documentElement.classList.remove('has-modal');
  $('cc-generate').focus();
}

function pageGen(step) {
  const last = Math.max(0, gen.made.length - GEN_PER_VIEW);
  const start = Math.min(last, Math.max(0, gen.start + step));
  if (start === gen.start || gen.busy) return;
  gen.start = start;
  renderGen();
}

// A click on a letterhead chooses it; on the chosen one, unchooses it.
function toggleGen(index) {
  if (gen.busy || !gen.made[index]) return;
  gen.picked = gen.picked === index ? -1 : index;
  renderGen();
  genDialog().querySelector(`.lg-card[data-index="${index}"]`)?.focus();
}

// Save: the chosen letterhead becomes the company's letterhead; the popup closes.
function saveGen() {
  const item = gen.made[gen.picked];
  if (!item || gen.busy) return;
  dirty = true;
  setFile('letterhead', new File([item.blob], 'letterhead.png', { type: 'image/png' }));
  closeGen();
}

// Keys while the popup is open: ← → move between the letterheads (paging on at the ends), Enter or Space on one
// chooses / unchooses it, Esc closes.
function handleGenKeys(event) {
  const { key } = event;
  if (key === 'Escape') { event.preventDefault(); if (!event.repeat) closeGen(); return; }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const card = event.target.closest?.('.lg-card[data-index]');
  if ((key === 'ArrowLeft' || key === 'ArrowRight') && card) {
    event.preventDefault();
    const target = Number(card.dataset.index) + (key === 'ArrowLeft' ? -1 : 1);
    if (!gen.made[target]) return;
    if (target < gen.start || target >= gen.start + GEN_PER_VIEW) pageGen(key === 'ArrowLeft' ? -1 : 1);
    genDialog().querySelector(`.lg-card[data-index="${target}"]`)?.focus();
    return;
  }
  if ((key === 'Enter' || key === ' ') && card) { event.preventDefault(); if (!event.repeat) toggleGen(Number(card.dataset.index)); }
}

function initGen() {
  const dialog = genDialog();
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeGen(); });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) { closeGen(); return; }        // the backdrop
    const card = event.target.closest('.lg-card[data-index]');
    if (card) { toggleGen(Number(card.dataset.index)); return; }
    const action = event.target.closest('[data-gen]')?.dataset.gen;
    if (action === 'cancel') closeGen();
    if (action === 'prev') pageGen(-1);
    if (action === 'next') pageGen(1);
    if (action === 'more') generateMore(1);
    if (action === 'select') saveGen();
  });
}

/* ---------- keyboard: the same keys as the other modules (dashboard.js) ----------
   Enter        next field; a dropdown opens its list (Enter picks and moves on), the bank name its suggestions
   Shift+Enter  create the company (Save on the other forms)
   ↑ ↓ ← →      the nearest control that way (←/→ move the caret first, until it reaches the end of the text)
   Tab          every control in page order, round to the start again
   Esc          close an open list, else back to sign in
   Dates are typed DD/MM/YYYY (13052026 → 13/05/2026); Alt+↓ or F4 opens the calendar. Ctrl+S also creates. */

const FOCUSABLE = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]):not([type="hidden"]):not([type="file"]), [tabindex]:not([tabindex="-1"])';

function focusableControls() {
  // An open popup, or the "Company created" box, keeps the keys to itself.
  const root = $('lookup').open ? $('lookup') : $('cc-done').hidden ? document : $('cc-done');
  return [...root.querySelectorAll(FOCUSABLE)].filter(node =>
    node.tabIndex >= 0 && !node.closest('[hidden]') && node.getClientRects().length > 0);
}

function isTextEntry(node) {
  return node.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'submit', 'reset'].includes(node.type);
}

// Arriving by keyboard: the text is selected, so typing replaces it and the next arrow moves on.
function focusField(node) {
  node.focus();
  if (node.select && isTextEntry(node)) node.select();
}

function moveFocusByTab(backwards) {
  const controls = focusableControls();
  if (!controls.length) return;
  const index = controls.indexOf(document.activeElement);
  const next = index === -1 ? (backwards ? controls.length - 1 : 0) : (index + (backwards ? -1 : 1) + controls.length) % controls.length;
  controls[next].focus();
}

// ←/→ leave a text field only when the caret is at that end, or the whole text is selected.
function caretAtEdge(input, key) {
  const { selectionStart: start, selectionEnd: end, value } = input;
  if (start == null) return true;
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

function arrowLeavesField(event) {
  if (isLookupField(event.target)) return true;                 // picked values only: no caret to move
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') return caretAtEdge(event.target, event.key);
  return !mayHaveOpenSuggestions(event.target);
}

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
function crossGap(a, b, key) {
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const [aStart, aEnd, bStart, bEnd] = horizontal ? [a.top, a.bottom, b.top, b.bottom] : [a.left, a.right, b.left, b.right];
  return Math.max(0, bStart - aEnd, aStart - bEnd);
}
const ROW_TOLERANCE = 24;   // px: controls this close vertically count as one row

// The blocks ↑/↓ walk through, in page order: the top bar, each card (column by column), the footer.
const arrowBlocks = () => [form.querySelector('.cc-top'), ...form.querySelectorAll('.cc-card'), form.querySelector('.cc-foot')];

// A block's controls as rows, top to bottom (controls whose middles are this close share a row: Yes / No,
// the document tiles, the code and its pencil).
function controlRows(block, controls) {
  const inside = controls.filter(node => block.contains(node))
    .map(node => ({ node, rect: node.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top);
  const rows = [];
  for (const item of inside) {
    const middle = (item.rect.top + item.rect.bottom) / 2;
    const row = rows.find(r => Math.abs(r.middle - middle) <= ROW_TOLERANCE / 2);
    if (row) row.items.push(item); else rows.push({ middle, items: [item] });
  }
  return rows;
}

// In a row, the control under (or over) the one we come from; Yes / No lands on the current choice.
function controlInRow(row, fromX) {
  const centerX = r => (r.left + r.right) / 2;
  const best = [...row.items].sort((a, b) => Math.abs(centerX(a.rect) - fromX) - Math.abs(centerX(b.rect) - fromX))[0].node;
  return best.matches('.cc-toggle-btn') ? form.querySelector('.cc-toggle-btn[aria-pressed="true"]') : best;
}

// ←/→: the nearest control on the same row (the next column too); at a row's end, the next in page order.
// ↑/↓: the row above/below in the same card; past a card's last row, the first row of the next card (↑: the last
// row of the card before), so the keys follow the page's order column by column, never jump across at random.
function moveFocusByArrow(key) {
  const controls = focusableControls();
  const current = document.activeElement;
  if (!controls.includes(current)) { controls[0]?.focus(); return; }
  const from = current.getBoundingClientRect();

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const sameRow = controls.filter(node => node !== current)
      .map(node => { const rect = node.getBoundingClientRect(); return { node, rect, gap: directionalGap(from, rect, key) }; })
      .filter(c => c.gap !== null && crossGap(from, c.rect, key) === 0)
      .sort((a, b) => a.gap - b.gap);
    if (sameRow.length) focusField(sameRow[0].node); else moveFocusByTab(key === 'ArrowLeft');
    return;
  }

  const down = key === 'ArrowDown';
  const fromX = (from.left + from.right) / 2;
  const blocks = arrowBlocks().filter(Boolean);
  const blockIndex = blocks.findIndex(block => block.contains(current));
  if (blockIndex === -1) return;
  const rows = controlRows(blocks[blockIndex], controls);
  const rowIndex = rows.findIndex(row => row.items.some(item => item.node === current));
  const next = rows[rowIndex + (down ? 1 : -1)];
  if (next) { focusField(controlInRow(next, fromX)); return; }
  // Past the card's edge: the next card that has controls, entering at its first (↓) or last (↑) row.
  for (let i = blockIndex + (down ? 1 : -1); i >= 0 && i < blocks.length; i += down ? 1 : -1) {
    const target = controlRows(blocks[i], controls);
    if (!target.length) continue;
    if (blocks[i].matches('.cc-foot') && !$('cc-submit').disabled) { $('cc-submit').focus(); return; }   // down into the footer: Create
    const row = down ? target[0] : target[target.length - 1];
    focusField(controlInRow(row, Math.min(...row.items.map(item => item.rect.left))));   // its first control
    return;
  }
}

// The fields Enter walks through, in page order, ending on Create Company. The documents are left out
// (Enter would open the file chooser): Tab and the arrows reach their buttons, and Create points at a missing one.
function enterOrder() {
  const fields = [...form.querySelectorAll('.cc-input, .cc-toggle-btn[aria-pressed="true"]')]
    .filter(node => !node.disabled && !node.readOnly && node.dataset.enterSkip === undefined && !node.closest('[hidden]') && node.getClientRects().length > 0);
  return [...fields, $('cc-submit')];
}
function fieldAfter(node) {
  const order = enterOrder();
  const index = order.indexOf(node);
  if (index !== -1) return order[index + 1];
  return order.find(other => node.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);
}

// Moving on with Enter opens the next dropdown straight away, like the other forms.
function enterField(node) {
  focusField(node);
  if (isLookupField(node)) openLookup(node, { byKeyboard: true });
  else if (node instanceof HTMLSelectElement) openSelectMenu(node);
  else if (node instanceof HTMLInputElement && node.list && node.value === '') showSuggestions(node);
}
function focusNextField(node) {
  const next = fieldAfter(node);
  if (next) enterField(next); else focusField(node);
}

function showSuggestions(input) {
  try { input.showPicker(); input.dataset.pickerOpen = ''; return true; } catch { return false; }
}

/* The list a <select> opens on Enter. Focus stays on the select: ↑/↓, PgUp/PgDn, Home/End move the highlight,
   typing jumps to a matching option, Enter picks it and moves on (Space picks and stays), Esc or Tab closes it. */
const selectMenu = { select: null, node: null, options: [], active: -1, typed: '', typedAt: 0 };

function openSelectMenu(select) {
  closeSelectMenu();
  const options = [...select.options].filter(option => !option.hidden && !option.disabled);
  if (!options.length) return false;
  const node = document.createElement('ul');
  node.className = 'cc-menu';
  node.id = 'cc-select-menu';
  node.setAttribute('role', 'listbox');
  node.replaceChildren(...options.map((option, index) => {
    const item = document.createElement('li');
    item.className = 'cc-menu-item';
    item.textContent = option.textContent.trim() || option.value;
    if (option.dataset.country) item.dataset.country = option.dataset.country;   // "+968   Oman"
    item.id = `cc-select-menu-${index}`;
    item.dataset.index = String(index);
    item.setAttribute('role', 'option');
    return item;
  }));
  node.addEventListener('mousedown', event => {
    event.preventDefault();                                     // focus stays on the select
    const item = event.target.closest('[data-index]');
    if (item) pickSelectMenu(Number(item.dataset.index), false);
  });
  document.body.append(node);
  Object.assign(selectMenu, { select, node, options, active: Math.max(0, options.indexOf(select.selectedOptions[0])), typed: '' });
  placeSelectMenu();
  select.setAttribute('aria-expanded', 'true');
  select.setAttribute('aria-controls', node.id);
  syncSelectMenu();
  return true;
}

function closeSelectMenu() {
  const { select, node } = selectMenu;
  if (!node) return;
  node.remove();
  for (const name of ['aria-expanded', 'aria-controls', 'aria-activedescendant']) select.removeAttribute(name);
  Object.assign(selectMenu, { select: null, node: null, options: [], active: -1 });
}

// Under the field, or above it when the window has no room below (fixed, so the sticky footer cannot hide it).
function placeSelectMenu() {
  const { select, node } = selectMenu;
  const box = select.getBoundingClientRect();
  node.style.minWidth = `${Math.max(box.width, 160)}px`;
  node.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - node.offsetWidth - 8))}px`;
  const footer = form.querySelector('.cc-foot').getBoundingClientRect().top;
  const below = Math.min(window.innerHeight, footer) - box.bottom - 8;
  const height = Math.min(node.scrollHeight, 240);
  if (below >= height || below >= box.top) { node.style.top = `${box.bottom + 4}px`; node.style.bottom = 'auto'; }
  else { node.style.top = 'auto'; node.style.bottom = `${window.innerHeight - box.top + 4}px`; }
}

function syncSelectMenu() {
  const { select, node, active } = selectMenu;
  for (const item of node.children) {
    const on = Number(item.dataset.index) === active;
    item.classList.toggle('is-active', on);
    item.setAttribute('aria-selected', String(on));
    if (on) { select.setAttribute('aria-activedescendant', item.id); item.scrollIntoView({ block: 'nearest' }); }
  }
}

function pickSelectMenu(index, advance) {
  const { select, options } = selectMenu;
  const option = options[index];
  closeSelectMenu();
  if (!option) return;
  if (select.value !== option.value) {
    select.value = option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (advance && document.activeElement === select) focusNextField(select);
}

// Every key while the list is open. True when handled.
function handleSelectMenuKeys(event) {
  const { select, options } = selectMenu;
  if (!select) return false;
  if (event.target !== select || !select.isConnected) { closeSelectMenu(); return false; }
  const { key } = event;
  if (event.ctrlKey || event.metaKey || event.altKey) { closeSelectMenu(); return false; }
  if (key === 'Shift') return true;
  const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[key];
  const listKey = step || key === 'Escape' || key === 'Home' || key === 'End'
    || ((key === 'Enter' || key === ' ') && !event.shiftKey) || (key.length === 1 && key !== ' ');
  if (!listKey) { closeSelectMenu(); return false; }             // Tab, ←/→, Shift+Enter … do their usual job
  event.preventDefault();
  if (key === 'Escape') { closeSelectMenu(); return true; }
  if (key === 'Enter' || key === ' ') { if (!event.repeat) pickSelectMenu(selectMenu.active, key === 'Enter'); return true; }
  const last = options.length - 1;
  if (step) selectMenu.active = Math.max(0, Math.min(last, selectMenu.active + step));
  else if (key === 'Home') selectMenu.active = 0;
  else if (key === 'End') selectMenu.active = last;
  else {
    // Letters typed quickly build a prefix; the same letter again cycles through its options.
    const now = Date.now();
    selectMenu.typed = now - selectMenu.typedAt < 700 ? selectMenu.typed + key.toLowerCase() : key.toLowerCase();
    selectMenu.typedAt = now;
    const text = option => option.textContent.trim().toLowerCase();
    const cycling = [...selectMenu.typed].every(char => char === selectMenu.typed[0]);
    const prefix = cycling ? selectMenu.typed[0] : selectMenu.typed;
    const order = options.map((_, i) => (selectMenu.active + (cycling ? 1 : 0) + i) % options.length);
    const match = order.find(i => text(options[i]).startsWith(prefix));
    if (match !== undefined) selectMenu.active = match;
  }
  syncSelectMenu();
  return true;
}

/* ---------- "Select …" popups (Country, Base Currency), as on the other modules ----------
   The field holds only a picked row: typing, pasting or a click opens the popup instead (a typed letter starts the
   search). Enter, Space, F4 or Alt+↓ open it with the current value highlighted; Backspace / Delete clear the field.
   In the popup: type to search (rows where a column starts with the text first, then rows that contain it),
   ↑/↓/PgUp/PgDn move, Enter picks and moves on to the next field, Esc closes and moves on, Tab goes round the
   popup's controls, → at the end of the search reaches Cancel / Select. A double-click picks. */
const lookup = { field: null, kind: '', rows: [], shown: [], active: 0, byKeyboard: false };
const isLookupField = node => node instanceof HTMLInputElement && node.dataset.lookup !== undefined;
const lookupIdInput = field => field.parentElement.querySelector('input[type="hidden"]');

function setLookupValue(field, row) {
  const hidden = lookupIdInput(field);
  const before = hidden ? hidden.value : field.value;
  field.value = row ? LOOKUPS[field.dataset.lookup].display(row) : '';
  if (hidden) hidden.value = row ? String(row.id) : '';
  if ((hidden ? hidden.value : field.value) !== before) field.dispatchEvent(new Event('input', { bubbles: true }));
}

function openLookup(field, { query = '', byKeyboard = false } = {}) {
  const dialog = $('lookup');
  if (dialog.open) return;
  closeSelectMenu();
  const config = LOOKUPS[field.dataset.lookup];
  const rows = config.rows();
  Object.assign(lookup, { field, kind: field.dataset.lookup, rows, byKeyboard });
  const current = lookupIdInput(field)?.value ?? field.value;
  // The current value is highlighted; opened by typing a letter, the first match is.
  lookup.active = query ? 0 : Math.max(0, rows.findIndex(row => String(row.id) === current));
  $('lookup-letter').textContent = config.letter;
  $('lookup-title').textContent = config.title;
  $('lookup-list-title').textContent = config.list;
  $('lookup-head').replaceChildren(...config.columns.map(([, heading]) => Object.assign(document.createElement('th'), { textContent: heading })));
  const search = $('lookup-search');
  search.value = query;
  search.placeholder = `Search ${config.columns.map(([, heading]) => heading.toLowerCase()).slice(0, 2).join(' or ')}...`;
  renderLookupRows();
  document.documentElement.classList.add('has-modal');
  dialog.showModal();
  search.focus();
  search.setSelectionRange(query.length, query.length);
  $(`lookup-row-${lookup.active}`)?.scrollIntoView({ block: 'nearest' });
}

function renderLookupRows() {
  const config = LOOKUPS[lookup.kind];
  const query = $('lookup-search').value.trim().toLowerCase();
  // Rows where a column starts with the search come first ("k" → Kuwait before Pakistan).
  const texts = row => config.columns.map(([key]) => String(row[key] ?? '').toLowerCase());
  lookup.shown = query
    ? [...lookup.rows.filter(row => texts(row).some(text => text.startsWith(query))),
       ...lookup.rows.filter(row => !texts(row).some(text => text.startsWith(query)) && texts(row).some(text => text.includes(query)))]
    : lookup.rows;
  lookup.active = Math.min(lookup.active, Math.max(0, lookup.shown.length - 1));
  const rows = lookup.shown.map((row, index) => {
    const tr = document.createElement('tr');
    tr.id = `lookup-row-${index}`;
    tr.dataset.index = String(index);
    tr.setAttribute('role', 'option');
    config.columns.forEach(([key], column) => {
      const td = document.createElement('td');
      if (column === 0) td.className = 'lk-code';
      td.textContent = String(row[key] ?? '');
      tr.append(td);
    });
    return tr;
  });
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'lk-empty';
    td.colSpan = config.columns.length;
    td.textContent = query ? `No ${config.plural} match “${query}”.` : `No ${config.plural} to choose from.`;
    tr.append(td);
    rows.push(tr);
  }
  $('lookup-rows').replaceChildren(...rows);
  $('lookup-count').textContent = query ? `${lookup.shown.length} of ${lookup.rows.length} ${config.plural}` : `${lookup.rows.length} ${config.plural}`;
  $('lookup-select').disabled = lookup.shown.length === 0;
  $('lookup-select-label').textContent = config.title;
  syncLookupActive();
}

function syncLookupActive() {
  const search = $('lookup-search');
  for (const tr of $('lookup-rows').querySelectorAll('tr[data-index]')) {
    const active = Number(tr.dataset.index) === lookup.active;
    tr.classList.toggle('is-active', active);
    tr.setAttribute('aria-selected', String(active));
  }
  const activeRow = $(`lookup-row-${lookup.active}`);
  if (activeRow) { search.setAttribute('aria-activedescendant', activeRow.id); activeRow.scrollIntoView({ block: 'nearest' }); }
  else search.removeAttribute('aria-activedescendant');
}

function moveLookupActive(delta) {
  if (!lookup.shown.length) return;
  lookup.active = Math.min(lookup.shown.length - 1, Math.max(0, lookup.active + delta));
  syncLookupActive();
}

// advance: Esc and keyboard picks move on to the next field; Cancel, ✕ and the backdrop stay on the field.
function closeLookup({ advance = false } = {}) {
  const dialog = $('lookup');
  if (!dialog.open) return;
  dialog.close();
  document.documentElement.classList.remove('has-modal');
  if (advance) focusNextField(lookup.field); else focusField(lookup.field);
}

function pickLookupRow({ advance = false } = {}) {
  const row = lookup.shown[lookup.active];
  if (!row) return;
  const { field } = lookup;
  const moveOn = advance || lookup.byKeyboard;
  closeLookup();
  setLookupValue(field, row);
  if (moveOn) focusNextField(field);
}

// Keys on a popup field. True when handled.
function handleLookupFieldKeys(event) {
  const field = event.target;
  if (!isLookupField(field)) return false;
  const { key } = event;
  const open = query => { event.preventDefault(); if (!event.repeat) openLookup(field, { query, byKeyboard: true }); return true; };
  if (key === 'F4' || (event.altKey && key === 'ArrowDown')) return open('');
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (key === 'Backspace' || key === 'Delete') {
    event.preventDefault();
    if (field.value !== '') setLookupValue(field, null);
    return true;
  }
  if (key === 'Enter' && !event.shiftKey) return open('');
  if (key === ' ') return open('');
  if (key.length === 1) return open(key);
  return false;
}

// Keys while the popup is open: it takes every key, so nothing reaches the page behind it.
function handleLookupDialogKeys(event) {
  const { key, target } = event;
  const ctrl = event.ctrlKey || event.metaKey;
  if (key === 'Escape') { event.preventDefault(); if (!event.repeat) closeLookup({ advance: true }); return; }
  if (key === 'Tab' && !ctrl && !event.altKey) { event.preventDefault(); moveFocusByTab(event.shiftKey); return; }
  if (ctrl && ['s', 'z'].includes(key.toLowerCase())) { event.preventDefault(); return; }   // page shortcuts wait until it closes
  if (ctrl || event.altKey) return;
  const search = $('lookup-search');
  const [cancel, select] = [$('lookup-cancel'), $('lookup-select')];
  // Typing while a button has focus goes on in the search box (Space and Enter still press the button).
  if (target !== search && ((key.length === 1 && key !== ' ') || key === 'Backspace')) {
    event.preventDefault();
    search.focus();
    search.value = key === 'Backspace' ? search.value.slice(0, -1) : search.value + key;
    search.setSelectionRange(search.value.length, search.value.length);
    search.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  // On the Cancel / Select buttons: → Cancel to Select, ← Select to Cancel, ← from Cancel or ↑ back to the list.
  if (target !== search) {
    if (!key.startsWith('Arrow')) return;
    event.preventDefault();
    if (key === 'ArrowRight' && target === cancel && !select.disabled) select.focus();
    else if (key === 'ArrowLeft' && target === select) cancel.focus();
    else if ((key === 'ArrowLeft' && target === cancel) || key === 'ArrowUp') search.focus();
    return;
  }
  if (key === 'ArrowRight' && search.selectionStart === search.value.length && search.selectionEnd === search.value.length) {
    event.preventDefault();
    cancel.focus();
    return;
  }
  const steps = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };
  if (steps[key]) { event.preventDefault(); moveLookupActive(steps[key]); return; }
  if (key === 'Enter') { event.preventDefault(); if (!event.repeat) pickLookupRow({ advance: true }); }
}

function initLookups() {
  const dialog = $('lookup');
  // Popup fields hold only picked rows: typed, pasted and dropped text opens the popup instead.
  document.addEventListener('beforeinput', event => { if (isLookupField(event.target)) event.preventDefault(); });
  document.addEventListener('paste', event => {
    if (!isLookupField(event.target)) return;
    event.preventDefault();
    openLookup(event.target, { query: event.clipboardData.getData('text').trim(), byKeyboard: true });
  });
  document.addEventListener('click', event => { if (isLookupField(event.target)) openLookup(event.target); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeLookup(); });
  $('lookup-search').addEventListener('input', () => { lookup.active = 0; renderLookupRows(); });
  $('lookup-rows').addEventListener('mousedown', event => event.preventDefault());   // typing stays in the search box
  $('lookup-rows').addEventListener('click', event => {
    const tr = event.target.closest('tr[data-index]');
    if (!tr) return;
    lookup.active = Number(tr.dataset.index);
    syncLookupActive();
    if (event.detail >= 2) pickLookupRow();                    // double-click picks
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {                              // the backdrop, outside the panel
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeLookup();
      return;
    }
    const action = event.target.closest('[data-lookup-action]')?.dataset.lookupAction;
    if (action === 'cancel') closeLookup();
    else if (action === 'select') pickLookupRow();
  });
}

/* Typed dates, as on the other forms: digits fill DD/MM/YYYY and the slashes appear by themselves; leaving the
   field pads the day and month and adds this year when it is missing. The field's .value stays YYYY-MM-DD
   ('' until it is a real date), so the rest of the page reads it as before. */
const NATIVE_VALUE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
const typedDate = input => NATIVE_VALUE.get.call(input);
const isDateField = node => node?.dataset?.date !== undefined;

function isoToDisplay(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}
function displayToIso(text) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text ?? '').trim());
  if (!match) return '';
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  date.setFullYear(year);
  if (year < 1000 || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
}
function formatTypedDate(text) {
  const parts = [''];
  for (const char of text) {
    const index = parts.length - 1;
    if (/\d/.test(char)) {
      if (index === 2) { if (parts[2].length < 4) parts[2] += char; continue; }
      parts[index] += char;
      if (parts[index].length === 1 && Number(char) > (index === 0 ? 3 : 1)) parts[index] = `0${char}`;   // 4–9 / 2–9: one digit
      if (parts[index].length === 2) parts.push('');
    } else if (/[/.\-\s]/.test(char) && index < 2 && parts[index].length === 1) {
      parts[index] = `0${parts[index]}`;
      parts.push('');
    }
  }
  return parts.join('/');
}
function completeTypedDate(text) {
  const [day = '', month = '', year = ''] = text.split('/');
  if (!day || !month) return text;
  const fullYear = !year ? String(new Date().getFullYear()) : year.length === 2 ? `20${year}` : year;
  const pad = part => (/^[1-9]$/.test(part) ? `0${part}` : part);
  return `${pad(day)}/${pad(month)}/${fullYear}`;
}

function enhanceDateField(input) {
  const stored = typedDate(input);
  input.type = 'text';
  input.dataset.date = '';
  input.inputMode = 'numeric';
  input.maxLength = 10;
  input.spellcheck = false;
  input.placeholder = 'DD/MM/YYYY';
  input.classList.add('cc-mono');
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() { return displayToIso(typedDate(this)); },
    set(value) {
      const text = String(value ?? '');
      NATIVE_VALUE.set.call(this, /^\d{4}-\d{2}-\d{2}$/.test(text) ? isoToDisplay(text) : text);
    },
  });
  input.value = stored;

  const wrap = document.createElement('span');
  wrap.className = 'cc-date';
  input.before(wrap);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cc-date-btn';
  button.tabIndex = -1;
  button.title = 'Open the calendar (Alt+↓ or F4)';
  button.setAttribute('aria-label', 'Open the calendar');
  button.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>';
  const picker = document.createElement('input');
  picker.type = 'date';
  picker.className = 'cc-date-picker';
  picker.tabIndex = -1;
  picker.setAttribute('aria-hidden', 'true');
  wrap.append(input, button, picker);

  const openPicker = () => {
    picker.value = input.value;
    try { picker.showPicker(); } catch { /* no picker in this browser: typing still works */ }
  };
  const takePick = event => {
    event.stopPropagation();
    if (!picker.value || picker.value === input.value) return;
    input.value = picker.value;
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  picker.addEventListener('input', takePick);
  picker.addEventListener('change', takePick);
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', openPicker);
  input.addEventListener('keydown', event => {
    if (event.key === 'F4' || (event.altKey && event.key === 'ArrowDown')) {
      event.preventDefault();
      event.stopPropagation();
      openPicker();
    }
  });
}

function initDateFields() {
  document.addEventListener('input', event => {
    const input = event.target;
    if (!isDateField(input) || !event.inputType) return;            // our own events carry no inputType
    const text = typedDate(input);
    const caret = input.selectionStart ?? text.length;
    const digitsBefore = text.slice(0, caret).replace(/\D/g, '').length;
    let formatted = formatTypedDate(text);
    if (event.inputType.startsWith('delete')) formatted = formatted.replace(/\/$/, '');
    if (formatted === text) return;
    NATIVE_VALUE.set.call(input, formatted);
    let position = 0;
    for (let seen = 0; position < formatted.length && seen < digitsBefore; position += 1) if (/\d/.test(formatted[position])) seen += 1;
    if (formatted[position] === '/' && !event.inputType.startsWith('delete')) position += 1;
    input.setSelectionRange(position, position);
  }, true);
  document.addEventListener('focusout', event => {
    const input = event.target;
    if (!isDateField(input)) return;
    const text = typedDate(input);
    const complete = completeTypedDate(text);
    if (complete !== text) {
      NATIVE_VALUE.set.call(input, complete);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (typedDate(input) && !input.value) setFieldError(input.name, 'Enter a real date as DD/MM/YYYY, e.g. 31/12/2027.');
  }, true);
  for (const input of form.querySelectorAll('input[type="date"]')) enhanceDateField(input);
}

/* Every key on the page, in the order the other modules take them. */
function handleKeys(event) {
  if (event.defaultPrevented || event.isComposing) return;
  if (handleSelectMenuKeys(event)) { event.stopPropagation(); return; }
  if ($('lookup').open) { handleLookupDialogKeys(event); event.stopPropagation(); return; }
  if ($('cc-gen').open) { handleGenKeys(event); event.stopPropagation(); return; }
  if ($('cc-view').open) {                                       // the full-size letterhead: only Esc (and Tab)
    if (event.key === 'Escape') { event.preventDefault(); closeView(); }
    event.stopPropagation();
    return;
  }
  const { key, target } = event;
  const ctrl = event.ctrlKey || event.metaKey;

  if (!$('cc-done').hidden) {                                    // created: only Tab and the arrows, inside the box
    if (key === 'Tab' || key.startsWith('Arrow')) { event.preventDefault(); moveFocusByTab(key === 'Tab' ? event.shiftKey : ['ArrowLeft', 'ArrowUp'].includes(key)); }
    return;
  }
  if (key === 'Escape' && !ctrl && !event.altKey) {
    event.preventDefault();
    if (!event.repeat) leave();
    return;
  }
  if ((key === 'Enter' && event.shiftKey && !ctrl && !event.altKey) || (ctrl && !event.altKey && key.toLowerCase() === 's')) {
    event.preventDefault();                                      // Shift+Enter creates, as Save does on the other forms
    if (!event.repeat) submit();
    return;
  }
  if (handleLookupFieldKeys(event)) return;                     // Country, Base Currency: Enter / typing open the popup
  if (event.altKey || ctrl) return;

  if (key === 'Enter' && form.contains(target)) {
    if (target.tagName === 'BUTTON' && !target.matches('.cc-toggle-btn')) return;   // a button's own click
    if (target instanceof HTMLInputElement && target.list && target.dataset.pickerOpen === undefined && target.value === '') {
      event.preventDefault();
      if (showSuggestions(target)) return;                       // bank name: Enter shows the list, Enter again moves on
    }
    if (target instanceof HTMLSelectElement) { event.preventDefault(); if (!event.repeat) openSelectMenu(target); return; }
    event.preventDefault();
    if (!event.repeat) focusNextField(target);
    return;
  }
  // Yes / No: Y and N choose without leaving the field.
  if (target.matches?.('.cc-toggle-btn') && /^[yn]$/i.test(key)) {
    event.preventDefault();
    const value = key.toLowerCase() === 'y' ? '1' : '0';
    dirty = true;
    setVat(value);
    form.querySelector(`[data-vat="${value}"]`).focus();
    return;
  }
  if (key === 'Tab') { event.preventDefault(); moveFocusByTab(event.shiftKey); return; }
  if (event.shiftKey || !key.startsWith('Arrow')) return;
  // Yes / No works like a radio group: ←/→ switch the choice; past either end they move on as usual.
  if (target.matches?.('.cc-toggle-btn') && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    const other = form.querySelector(`[data-vat="${key === 'ArrowLeft' ? '1' : '0'}"]`);
    if (other !== target) {
      event.preventDefault();
      dirty = true;
      setVat(other.dataset.vat);
      other.focus();
      return;
    }
  }
  if (isTextEntry(target) && !arrowLeavesField(event)) return;   // the arrow moves the caret instead
  event.preventDefault();                                        // also stops a closed <select> changing value
  moveFocusByArrow(key);
}

let dirty = false;
function leave() {
  if (dirty && !busy && !confirm('Leave this page? What you typed here is not saved.')) return;
  dirty = false;                                   // asked already: no second question from beforeunload
  location.href = 'login.html';
}

/* ---------- submit ---------- */

async function loadSession() {
  const response = await fetch('api/session.php', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  csrfToken = (await response.json()).data.csrfToken;
}

// Half-typed dates are finished as leaving the field would (13/05 → 13/05/<this year>).
function completeDates() {
  for (const input of form.querySelectorAll('[data-date]')) {
    const text = typedDate(input);
    if (completeTypedDate(text) !== text) NATIVE_VALUE.set.call(input, completeTypedDate(text));
  }
}

function checkLocally() {
  completeDates();
  const errors = {};
  for (const [key, label] of REQUIRED) if (!hasValue(key)) errors[key] = `${label} is required.`;
  const code = field('companyCode').value.trim();
  if (code && !/^[A-Z0-9]{2,12}$/.test(code)) errors.companyCode = 'Company code must be 2 to 12 letters or digits, no spaces.';
  const password = field('password').value;
  if (password && password.length < 8) errors.password = 'The password needs at least 8 characters.';
  if (field('confirmPassword').value && field('confirmPassword').value !== password) errors.confirmPassword = 'The two passwords are not the same.';
  if (field('vatApplicable').value === '1' && !/^\d{1,3}(\.\d{1,2})?$/.test(field('vatPercentage').value.trim())) errors.vatPercentage = 'Enter the VAT percentage, e.g. 5.';
  if (keyRequired && !field('accessKey').value) errors.accessKey = 'Enter the access key.';
  for (const input of form.querySelectorAll('[data-check]')) {      // email and phone
    const message = fieldCheckProblem(input);
    if (message) errors[input.name] = message;
  }
  for (const input of form.querySelectorAll('[data-date]')) {
    if (typedDate(input) && !input.value) errors[input.name] = 'Enter a real date as DD/MM/YYYY, e.g. 31/12/2027.';
  }
  for (const key of FILE_KEYS) if (files[key] && fileProblem(key, files[key])) errors[key] = fileProblem(key, files[key]);
  return errors;
}

function setBusy(on) {
  busy = on;
  $('cc-submit').disabled = on;
  $('cc-submit').classList.toggle('is-busy', on);
  $('cc-submit-label').textContent = on ? 'Creating…' : 'Create Company';
}

async function submit(event) {
  event?.preventDefault();
  if (busy) return;
  clearErrors();
  const errors = checkLocally();
  if (Object.keys(errors).length) {
    for (const [key, message] of Object.entries(errors)) setFieldError(key, message);
    focusFirstError(Object.keys(errors));
    return;
  }

  const body = new FormData();
  for (const el of form.querySelectorAll('[name]')) {
    if (el.name === 'vatPercentage' && field('vatApplicable').value === '0') continue;
    body.append(el.name, el.type === 'password' ? el.value : el.value.trim());
  }
  if (!field('accountHolder').value.trim()) body.set('accountHolder', field('companyName').value.trim());
  if (codeIsAuto) body.set('codeAuto', '1');
  body.set('phone', phoneValue());                              // "+968 2450 4278"                    // the server assigns the next code
  for (const key of FILE_KEYS) if (files[key]) body.append(key, files[key], files[key].name);   // certificates may be left out

  setBusy(true);
  try {
    if (!csrfToken) await loadSession();
    const send = () => fetch('api/companies.php', {
      method: 'POST', credentials: 'same-origin', body,
      headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken },
    });
    let response = await send();
    if (response.status === 403) { await loadSession(); response = await send(); }
    const result = await response.json().catch(() => null);
    if (response.ok && result?.data?.code) {
      done(result.data);
      return;
    }
    const fields = result?.fields || {};
    for (const [key, message] of Object.entries(fields)) setFieldError(key, message);
    if (Object.keys(fields).length) focusFirstError(Object.keys(fields));
    else showAlert(result?.error || (response.status === 413 ? 'The files are too large for this server.' : 'The company could not be created. Please try again.'));
  } catch {
    showAlert('The server could not be reached. Check that the backend is running.');
  }
  setBusy(false);
}

function done({ code, name }) {
  dirty = false;
  // The sign-in page shows this company's name as its heading.
  try { localStorage.setItem('ge-company', code); localStorage.setItem('ge-company-name', name); } catch { /* private window */ }
  const text = $('cc-done-text');
  text.replaceChildren(document.createTextNode(`${name} has its own database now (company code `),
    Object.assign(document.createElement('strong'), { textContent: code }), document.createTextNode('). Sign in with the username and password you chose.'));
  $('cc-done-link').href = `login.html?company=${encodeURIComponent(code)}`;
  $('cc-done').hidden = false;
  $('cc-done-link').focus();
}

/* ---------- clear ---------- */

function clearAll() {
  if (dirty && !confirm('Clear every field and file on this page?')) return;
  form.reset();
  $('cc-baseCurrency-id').value = 'OMR';                        // reset() leaves a hidden input as it is
  for (const key of FILE_KEYS) setFile(key, null);
  for (const input of form.querySelectorAll('.cc-file')) input.value = '';
  setVat('1');
  clearErrors();
  setCodeMode(true);
  dirty = false;
  field('companyName').focus();
}

function setVat(value) {
  field('vatApplicable').value = value;
  for (const button of form.querySelectorAll('[data-vat]')) button.setAttribute('aria-pressed', String(button.dataset.vat === value));
  field('vatPercentage').disabled = value === '0';
  if (value === '0') setFieldError('vatPercentage', '');
  updateProgress();
}

/* ---------- start ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  form.addEventListener('submit', submit);
  initDateFields();
  initLookups();
  fillPhoneCodes($('cc-phoneCode'));
  // Email and phone are checked on leaving them (not when moving between the number and its calling code).
  form.addEventListener('focusout', event => {
    // Leaving the calling code for another field also leaves the phone number: check the number then.
    const input = event.target === $('cc-phoneCode') ? field('phone') : event.target;
    if (!(input instanceof HTMLInputElement) || input.dataset.check === undefined) return;
    if (event.relatedTarget && input.closest('.cc-phone')?.contains(event.relatedTarget)) return;
    setFieldError(input.name, fieldCheckProblem(input));
  });
  $('cc-phoneCode').addEventListener('change', () => { if (field('phone').value.trim()) setFieldError('phone', phoneProblem()); });

  form.addEventListener('input', event => {
    const el = event.target;
    dirty = true;
    if (el.matches('[data-upper]')) {
      const { selectionStart: start, selectionEnd: end } = el;
      const upper = el.value.toUpperCase();
      if (upper !== el.value) { el.value = upper; el.setSelectionRange(start, end); }
    }
    if (el.id === 'cc-companyCode') el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (el.name) setFieldError(el.name, '');
    updateProgress();
  });
  form.addEventListener('change', updateProgress);
  // Picking the country sets its currency, as on the supplier and customer forms (Base Currency can still be changed).
  field('country').addEventListener('input', () => {
    const country = COUNTRIES.find(row => row.name === field('country').value);
    const currency = country && CURRENCIES.find(row => row.code === country.currency);
    if (currency) setLookupValue(field('baseCurrency'), currency);
    if (country) $('cc-phoneCode').value = country.dial;         // the phone's calling code follows the country
    updateProgress();
  });

  $('cc-code-edit').addEventListener('click', () => setCodeMode(!codeIsAuto));
  field('companyName').addEventListener('input', refreshNextCodeSoon);
  for (const button of form.querySelectorAll('[data-vat]')) button.addEventListener('click', () => { dirty = true; setVat(button.dataset.vat); });

  for (const button of form.querySelectorAll('[data-eye]')) {
    button.addEventListener('click', () => {
      const input = $(button.dataset.eye);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }

  for (const button of form.querySelectorAll('[data-pick]')) button.addEventListener('click', () => field(button.dataset.pick).click());
  for (const key of FILE_KEYS) {
    field(key).addEventListener('change', () => {
      const file = field(key).files[0];
      field(key).value = '';
      if (!file) return;
      dirty = true;
      const problem = fileProblem(key, file);
      if (problem) { setFieldError(key, problem); return; }
      setFile(key, file);
    });
  }
  $('cc-generate').addEventListener('click', openGen);
  $('cc-preview-open').addEventListener('click', viewLetterhead);
  $('cc-letterhead-view').addEventListener('click', viewLetterhead);
  $('cc-view').addEventListener('cancel', event => { event.preventDefault(); closeView(); });
  $('cc-view').addEventListener('click', event => {
    if (event.target === $('cc-view') || event.target.closest('[data-view="close"]')) closeView();   // backdrop or ✕
  });
  initGen();
  $('cc-letterhead-remove').addEventListener('click', () => setFile('letterhead', null));
  $('cc-clear').addEventListener('click', clearAll);
  for (const link of document.querySelectorAll('[data-back]')) link.addEventListener('click', event => { event.preventDefault(); leave(); });

  keepFullScreenOnEscape();
  window.addEventListener('keydown', event => {
    handleKeys(event);
    if (event.cancelBubble) finishEscape(event);   // stopped here: it never reaches the window's bubbling listener
  }, true);
  document.addEventListener('focusout', event => {
    if (event.target === selectMenu.select) closeSelectMenu();
    if (event.target instanceof HTMLElement) delete event.target.dataset.pickerOpen;
  });
  document.addEventListener('mousedown', event => { if (selectMenu.node && !selectMenu.node.contains(event.target)) closeSelectMenu(); }, true);
  window.addEventListener('resize', closeSelectMenu);
  document.addEventListener('scroll', event => { if (selectMenu.node && !selectMenu.node.contains(event.target)) closeSelectMenu(); }, true);
  window.addEventListener('beforeunload', event => { if (dirty && !busy) event.preventDefault(); });

  setVat('1');
  setCodeMode(true);
  showLetterhead();
  updateProgress();
  field('companyName').focus();

  try {
    await loadSession();
    const settings = (await (await fetch('api/companies.php', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })).json()).data;
    keyRequired = Boolean(settings.keyRequired);
    refreshNextCode();
    $('cc-key-row').hidden = !keyRequired;
    if (!settings.enabled) {
      showAlert('Creating companies is turned off on this server. Ask your administrator.');
      $('cc-submit').disabled = true;
    }
    updateProgress();
  } catch {
    showAlert('The server could not be reached. Check that the backend is running.');
  }
});

/* Esc never takes the browser out of full screen. Firefox-based browsers leave full screen on any Esc the page
   does not claim (preventDefault), and a popup closed by the browser's own Esc handling never claims it. So
   every Esc is claimed (finishEscape), after the page's own handlers: last on the way back up (window,
   bubbling), or straight after the page's key handler when that stopped the key there. A popup that nothing
   closed yet gets the browser's usual "cancel" (its own cancel handler still decides what closing means).
   The popups open when the key went down are noted first, so one Esc never closes two popups. */
let escapeOpenAtStart = [];
function keepFullScreenOnEscape() {
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') escapeOpenAtStart = [...document.querySelectorAll('dialog[open]')];
  }, true);
  window.addEventListener('keydown', finishEscape);
}
function finishEscape(event) {
  if (event.key !== 'Escape' || event.isComposing || escapeOpenAtStart === null) return;
  const before = escapeOpenAtStart;
  escapeOpenAtStart = null;                       // once per key press
  const handled = event.defaultPrevented;
  event.preventDefault();
  if (handled) return;
  const open = [...document.querySelectorAll('dialog[open]')];
  if (!open.length || open.length !== before.length || open.some((dialog, i) => dialog !== before[i])) return;
  const top = open.find(dialog => dialog.contains(document.activeElement)) || open[open.length - 1];
  if (top.dispatchEvent(new Event('cancel', { cancelable: true }))) top.close();
}
