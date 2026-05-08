import { api } from './api.js';
import { sections, state } from './state.js';
import { renderAdmin } from './admin/index.js';
import { renderDriver } from './driver/index.js';
import { renderRider } from './rider/index.js';
import { $, escapeHtml, selectOptions } from './ui.js';

export function showLogin(options = {}) {
  const { preserveStoredToken = false } = options;

  stopLiveUpdates();
  $('#authShell').classList.remove('hidden');
  $('#appShell').classList.add('hidden');

  if (!preserveStoredToken) {
    localStorage.removeItem('rideflow_token');
  }

  state.token = null;
  state.user = null;
  state.activeSection = null;
}

export function showApp() {
  $('#authShell').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  $('#roleLabel').textContent = `${state.user.dashboardRole} dashboard`;
  $('#sessionName').textContent = state.user.fullName;
  $('#sessionEmail').textContent = state.user.email;
  $('#pageEyebrow').textContent = state.user.dashboardRole === 'admin' ? 'Control center' : 'Live workspace';
  updateLiveStatus();
}

export function renderNav() {
  const roleSections = sections[state.user.dashboardRole];
  if (!state.activeSection || !roleSections.some(([id]) => id === state.activeSection)) {
    state.activeSection = roleSections[0][0];
  }

  $('#navTabs').innerHTML = roleSections.map(([id, label]) => `
    <button class="${state.activeSection === id ? 'active' : ''}" type="button" data-section="${escapeHtml(id)}" aria-label="${escapeHtml(label)}">
      <span class="nav-icon">${navIcon(id)}</span>
      ${escapeHtml(label)}
    </button>
  `).join('');

  $('#navTabs').querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeSection = button.dataset.section;
      state.estimate = null;
      render();
    });
  });
}

function navIcon(id) {
  const icons = {
    book: 'B',
    history: 'H',
    wallet: 'Rs',
    requests: 'R',
    trips: 'T',
    earnings: 'Rs',
    reports: 'A',
    users: 'U',
    drivers: 'D',
    vehicles: 'V',
    fares: 'F'
  };

  return icons[id] || '.';
}

export async function loadPublicLookups() {
  state.publicLookups = await api('/api/public/lookups');
  populateSignupLocations();
}

export function populateSignupLocations() {
  const citySelect = $('#driverCitySelect');
  const locationSelect = $('#driverLocationSelect');
  if (!citySelect || !locationSelect) return;

  citySelect.innerHTML = state.publicLookups.cities
    .map((row) => `<option value="${escapeHtml(row.city)}">${escapeHtml(row.city)}</option>`)
    .join('');

  function syncLocations() {
    const city = citySelect.value;
    const locations = state.publicLookups.locations.filter((item) => item.city === city);
    locationSelect.innerHTML = selectOptions(locations, 'location_id', 'label');
  }

  citySelect.addEventListener('change', syncLocations);
  syncLocations();
}

export async function loadLookups() {
  state.lookups = await api('/api/lookups');
}

export async function loadDashboard() {
  state.data = await api(`/api/${state.user.dashboardRole}/dashboard`);
}

export async function refresh(options = {}) {
  const { skipIfEditing = false } = options;

  if (state.isRefreshing) {
    return;
  }

  const activeElement = document.activeElement;
  if (skipIfEditing && activeElement && activeElement.closest('form')) {
    return;
  }

  state.isRefreshing = true;
  try {
    await loadLookups();
    await loadDashboard();
    state.lastRefreshAt = new Date();
    const nextRenderKey = JSON.stringify({ data: state.data, lookups: state.lookups });
    if (nextRenderKey !== state.lastRenderKey) {
      state.lastRenderKey = nextRenderKey;
      render();
    } else {
      updateLiveStatus();
    }
  } finally {
    state.isRefreshing = false;
  }
}

export function render() {
  showApp();
  renderNav();

  const title = sections[state.user.dashboardRole].find(([id]) => id === state.activeSection)?.[1] || 'Dashboard';
  $('#pageTitle').textContent = title;

  if (state.user.dashboardRole === 'rider') renderRider();
  if (state.user.dashboardRole === 'driver') renderDriver();
  if (state.user.dashboardRole === 'admin') renderAdmin();
  animateContentRefresh();
}

export function startLiveUpdates() {
  stopLiveUpdates();
  state.refreshTimer = window.setInterval(() => {
    refresh({ skipIfEditing: true }).catch(() => {});
  }, state.autoRefreshMs);
  updateLiveStatus();
}

export function stopLiveUpdates() {
  if (state.refreshTimer) {
    window.clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
}

function updateLiveStatus() {
  const liveStatus = $('#liveStatus');
  if (!liveStatus) {
    return;
  }

  liveStatus.textContent = state.lastRefreshAt ? 'Live now' : 'Live';
}

function animateContentRefresh() {
  const content = $('#content');
  if (!content) {
    return;
  }

  content.classList.remove('content-fade');
  void content.offsetWidth;
  content.classList.add('content-fade');
}
