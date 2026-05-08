import { api } from './api.js';
import { loadPublicLookups, refresh, showLogin, startLiveUpdates } from './shell.js';
import { pageContext, redirectToRoleHome, userMatchesPageContext } from './site.js';
import { state } from './state.js';
import { $, formObject, run, toast } from './ui.js';

function authView(view) {
  document.querySelectorAll('[data-auth-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.authView === view);
  });
  document.querySelectorAll('[data-auth-form]').forEach((form) => {
    form.classList.toggle('active', form.dataset.authForm === view);
  });
}

export function initAuth() {
  $('#authTabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-auth-view]');
    if (button) {
      authView(button.dataset.authView);
    }
  });

  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = formObject(event.currentTarget);
    await run(async () => {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ ...payload, role: pageContext.audience })
      });
      state.token = result.token;
      state.user = result.user;
      state.activeSection = null;
      localStorage.setItem('rideflow_token', result.token);
      if (!userMatchesPageContext(result.user)) {
        redirectToRoleHome(result.user);
        return;
      }
      await refresh();
      startLiveUpdates();
    });
  });

  $('#riderSignupForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = formObject(event.currentTarget);
    await run(async () => {
      const result = await api('/api/auth/signup/rider', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      state.token = result.token;
      state.user = result.user;
      state.activeSection = null;
      localStorage.setItem('rideflow_token', result.token);
      await refresh();
      startLiveUpdates();
    }, 'Rider account created.');
  });

  $('#driverSignupForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = formObject(event.currentTarget);
    await run(async () => {
      const result = await api('/api/auth/signup/driver', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          currentLocationId: Number(payload.currentLocationId),
          year: Number(payload.year)
        })
      });
      state.token = result.token;
      state.user = result.user;
      state.activeSection = null;
      localStorage.setItem('rideflow_token', result.token);
      await refresh();
      startLiveUpdates();
    }, 'Driver account submitted.');
  });

  $('#logoutButton').addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      showLogin();
    }
  });

  $('#refreshButton').addEventListener('click', () => {
    run(refresh);
  });
}

export async function boot() {
  await loadPublicLookups();
  $('#authActiveMetric').textContent = 'Connected';

  if (!state.token) {
    showLogin({ preserveStoredToken: true });
    return;
  }

  try {
    const result = await api('/api/auth/me');
    state.user = result.user;
    if (!userMatchesPageContext(result.user)) {
      showLogin({ preserveStoredToken: true });
      return;
    }
    await refresh();
    startLiveUpdates();
  } catch (error) {
    showLogin();
  }
}

export function handleBootError(error) {
  toast(error.message, 'error');
  showLogin();
}
