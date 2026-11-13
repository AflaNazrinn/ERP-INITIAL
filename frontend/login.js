/* Sign-in page (login.html).
   GET api/session.php gives the CSRF token (and the user, when already signed in: straight to the
   dashboard). POST api/login.php { username, password } signs in; then the page opens the dashboard,
   at the screen the user was sent away from (?next=#/masters/item) when there is one. */

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

async function signIn(event) {
  event.preventDefault();
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  showAlert('');
  showFieldError('username', username ? '' : 'Enter your username.');
  showFieldError('password', password ? '' : 'Enter your password.');
  if (!username || !password) {
    $(username ? 'login-password' : 'login-username').focus();
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
      location.replace(nextPage());
      return;
    }
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

// Create a company: there is no self-service sign-up yet; the note says who can help.
const NOTES = {
  'login-create': 'Creating a new company is not available yet. Ask your administrator for an account.',
};
function toggleNote(button) {
  const note = $('login-note');
  const open = note.hidden || note.dataset.from !== button.id;
  note.textContent = open ? NOTES[button.id] : '';
  note.dataset.from = open ? button.id : '';
  note.hidden = !open;
  for (const id of Object.keys(NOTES)) $(id).setAttribute('aria-expanded', String(open && id === button.id));
}

document.addEventListener('DOMContentLoaded', async () => {
  $('login-form').addEventListener('submit', signIn);
  $('login-toggle').addEventListener('click', () => {
    const show = $('login-password').type === 'password';
    $('login-password').type = show ? 'text' : 'password';
    $('login-toggle').setAttribute('aria-pressed', String(show));
    $('login-toggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  for (const name of ['username', 'password']) $(`login-${name}`).addEventListener('input', () => showFieldError(name, ''));
  // Clear: empty both fields and their messages, then start again at Username.
  $('login-clear').addEventListener('click', () => {
    for (const name of ['username', 'password']) {
      $(`login-${name}`).value = '';
      showFieldError(name, '');
    }
    showAlert('');
    $('login-username').focus();
  });
  for (const id of Object.keys(NOTES)) $(id).addEventListener('click', () => toggleNote($(id)));
  $('login-username').focus();
  try {
    const session = await loadSession();
    if (session.user) location.replace(nextPage());   // already signed in
  } catch {
    showAlert('The server could not be reached. Check that the backend is running.');
  }
});
