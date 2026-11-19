/* Sign-in page (login.html).
   GET api/session.php gives the CSRF token (and the user, when already signed in: straight to the
   dashboard). POST api/login.php { username, password } signs in to the company the username belongs to
   (usernames are unique across companies, each company has its own database); then the page opens the
   dashboard's home page (never the screen the user was last on, e.g. a Unit page). The name of
   the company this browser signed in to last is the heading; ?company=CODE (from Create a Company) says the
   new company is ready. "Create a company" opens company.html. */

'use strict';

const $ = id => document.getElementById(id);
let csrfToken = null;

// Signing in always opens the dashboard's home page, not the screen that was open before.
function nextPage() {
  return 'dashboard.html';
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

const FIELDS = ['username', 'password'];
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private window */ } };
const recall = key => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };

async function signIn(event) {
  event.preventDefault();
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  showAlert('');
  showFieldError('username', username ? '' : 'Enter your username.');
  showFieldError('password', password ? '' : 'Enter your password.');
  if (!username || !password) {
    $(`login-${FIELDS.find(name => !$(`login-${name}`).value.trim())}`).focus();
    return;
  }
  setBusy(true);
  try {
    if (!csrfToken) await loadSession();
    let response = await post(username, password);
    if (response.status === 403) {            // the session expired since the page opened: new token, once more
      await loadSession();
      response = await post(username, password);
    }
    const result = await response.json().catch(() => null);
    if (response.ok && result?.data?.user) {
      remember('ge-company', result.data.user.company?.code || '');
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

function post(username, password) {
  return fetch('api/login.php', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ username, password }),
  });
}

// The name of the company this browser signed in to last (or just created) as the heading, "Growth Engine"
// under it. After Create a Company (?company=CODE) a note says the new company is ready.
function showCompany() {
  const name = recall('ge-company-name');
  if (name) {
    $('login-title').textContent = name;
    $('login-product').textContent = 'Growth Engine';
  }
  const fromLink = (new URLSearchParams(location.search).get('company') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (fromLink) {
    $('login-created').textContent = `${name || `Company ${fromLink}`} is ready. Sign in with the username and password you chose.`;
    $('login-created').hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  $('login-form').addEventListener('submit', signIn);
  // Esc does nothing here, and must not take the browser out of full screen (Firefox-based browsers leave it on
  // any Esc the page does not claim).
  window.addEventListener('keydown', event => { if (event.key === 'Escape') event.preventDefault(); });
  $('login-toggle').addEventListener('click', () => {
    const show = $('login-password').type === 'password';
    $('login-password').type = show ? 'text' : 'password';
    $('login-toggle').setAttribute('aria-pressed', String(show));
    $('login-toggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  for (const name of FIELDS) $(`login-${name}`).addEventListener('input', () => showFieldError(name, ''));
  // Clear: empty the username and password and their messages, then start at Username.
  $('login-clear').addEventListener('click', () => {
    for (const name of FIELDS) {
      $(`login-${name}`).value = '';
      showFieldError(name, '');
    }
    showAlert('');
    $('login-username').focus();
  });
  showCompany();
  $('login-username').focus();
  try {
    const session = await loadSession();
    if (session.user) location.replace(nextPage());   // already signed in
  } catch {
    showAlert('The server could not be reached. Check that the backend is running.');
  }
});
