/* Sign-in page (login.html).
   GET api/session.php gives the CSRF token (and the user, when already signed in: straight to the
   dashboard). POST api/login.php { company, username, password } signs in to that company (each company
   has its own database); then the page opens the dashboard, at the screen the user was sent away from
   (?next=#/masters/item) when there is one. The company code is remembered in this browser, and
   ?company=CODE (from Create a Company) fills it in. "Create a company" opens company.html. */

'use strict';

const $ = id => document.getElementById(id);
let csrfToken = null;

// Only a hash route of the dashboard: never another site or path.
function nextPage() {
  const next = new URLSearchParams(location.search).get('next') || '';
  return `dashboard.html${/^#\/[\w\-/]*$/.test(next) ? next : ''}`;
}

async function loadSession() {
  const response = await fetch('api/session.php', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  const result = await response.json();
  csrfToken = result.data.csrfToken;
  return result.data;
}

function showFieldError(name, message) {
  const input = $(`login-${name}`);
  const error = $(`login-${name}-error`);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (message) input.setAttribute('aria-describedby', error.id); else input.removeAttribute('aria-describedby');
  error.textContent = message || '';
  error.hidden = !message;
}

function showAlert(message) {
  $('login-error').textContent = message || '';
  $('login-error').hidden = !message;
}

function setBusy(busy) {
  $('login-submit').disabled = busy;
  $('login-submit').classList.toggle('is-busy', busy);
  $('login-submit-label').textContent = busy ? 'Signing in…' : 'Sign in';
}

const FIELDS = ['company', 'username', 'password'];
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private window */ } };
const recall = key => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };

async function signIn(event) {
  event.preventDefault();
  const company = $('login-company').value.trim().toUpperCase();
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  showAlert('');
  showFieldError('company', company ? '' : 'Enter your company code.');
  showFieldError('username', username ? '' : 'Enter your username.');
  showFieldError('password', password ? '' : 'Enter your password.');
  if (!company || !username || !password) {
    $(`login-${FIELDS.find(name => !$(`login-${name}`).value.trim())}`).focus();
    return;
  }
  setBusy(true);
  try {
    if (!csrfToken) await loadSession();
    let response = await post(company, username, password);
    if (response.status === 403) {            // the session expired since the page opened: new token, once more
      await loadSession();
      response = await post(company, username, password);
    }
    const result = await response.json().catch(() => null);
    if (response.ok && result?.data?.user) {
      remember('ge-company', company);
      remember('ge-company-name', result.data.user.company?.name || '');
      location.replace(nextPage());
      return;
    }
    if (result?.fields) for (const [name, message] of Object.entries(result.fields)) if (FIELDS.includes(name)) showFieldError(name, message);
    showAlert(result?.error || 'Sign-in failed. Please try again.');
    if (response.status === 401) {
      $('login-password').value = '';
      $('login-password').focus();
    }
  } catch {
    showAlert('The server could not be reached. Check that the backend is running.');
  }
  setBusy(false);
}

function post(company, username, password) {
  return fetch('api/login.php', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ company, username, password }),
  });
}

// The company this browser signed in to last, or the one just created (?company=CODE): its code in the field,
// its name as the heading.
function showCompany() {
  const fromLink = (new URLSearchParams(location.search).get('company') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const code = fromLink || recall('ge-company');
  $('login-company').value = code;
  const name = !fromLink && code === recall('ge-company') ? recall('ge-company-name') : '';
  if (name) {
    $('login-title').textContent = name;
    $('login-product').textContent = 'Growth Engine';
  }
  if (fromLink) {
    $('login-created').textContent = `Company ${fromLink} is ready. Sign in with the username and password you chose.`;
    $('login-created').hidden = false;
  }
  return code;
}

document.addEventListener('DOMContentLoaded', async () => {
  $('login-form').addEventListener('submit', signIn);
  $('login-toggle').addEventListener('click', () => {
    const show = $('login-password').type === 'password';
    $('login-password').type = show ? 'text' : 'password';
    $('login-toggle').setAttribute('aria-pressed', String(show));
    $('login-toggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  for (const name of FIELDS) $(`login-${name}`).addEventListener('input', () => showFieldError(name, ''));
  $('login-company').addEventListener('input', () => {
    const input = $('login-company');
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  // Clear: empty the username and password and their messages (the company code stays), then start at Username.
  $('login-clear').addEventListener('click', () => {
    for (const name of FIELDS.slice(1)) {
      $(`login-${name}`).value = '';
      showFieldError(name, '');
    }
    showAlert('');
    $('login-username').focus();
  });
  $(showCompany() ? 'login-username' : 'login-company').focus();
  try {
    const session = await loadSession();
    if (session.user) location.replace(nextPage());   // already signed in
  } catch {
    showAlert('The server could not be reached. Check that the backend is running.');
  }
});
