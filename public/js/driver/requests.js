import { api } from '../api.js';
import { refresh } from '../shell.js';
import { state } from '../state.js';
import {
  $,
  escapeHtml,
  formObject,
  formatMoney,
  formatNumber,
  metrics,
  normalizeStatus,
  run,
  selectOptions
} from '../ui.js';

export function renderDriverRequests({ data, profile, isVerified }) {
  $('#content').innerHTML = `
    ${metrics([
      { label: 'Availability', value: normalizeStatus(profile.availability_status) },
      { label: 'Requests', value: formatNumber(data.pendingRequests.length) },
      { label: 'Rating', value: formatNumber(profile.average_rating) }
    ])}
    ${isVerified ? '' : `
      <section class="verification-banner">
        <strong>Verification pending</strong>
        <p>Admin approval is required before ride matching and online availability.</p>
      </section>
    `}
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-header">
          <h2>Availability</h2>
          <span>${escapeHtml(normalizeStatus(profile.availability_status))}</span>
        </div>
        <div class="button-row">
          <button class="primary-action" data-availability="online" type="button">Go Online</button>
          <button class="secondary-action" data-availability="offline" type="button">Go Offline</button>
        </div>
      </section>
      ${renderDriverWorkArea(profile)}
    </div>
    <section class="panel">
      <div class="panel-header">
        <h2>Ride Requests</h2>
        <span>${escapeHtml(data.pendingRequests.length)} assigned</span>
      </div>
      <div class="request-grid">
        ${data.pendingRequests.length ? data.pendingRequests.map(renderRequestCard).join('') : emptyState('No ride requests')}
      </div>
    </section>
  `;

  document.querySelectorAll('[data-availability]').forEach((button) => {
    button.addEventListener('click', () => setAvailability(button.dataset.availability));
  });
  document.querySelectorAll('[data-accept]').forEach((button) => {
    button.addEventListener('click', () => rideDecision(button.dataset.accept, 'accept'));
  });
  document.querySelectorAll('[data-reject]').forEach((button) => {
    button.addEventListener('click', () => rideDecision(button.dataset.reject, 'reject'));
  });
  bindDriverLocationForm();
}

function renderDriverWorkArea(profile) {
  const cities = state.lookups?.cities || [];
  const selectedCity = profile.current_city || cities[0]?.city || '';
  const cityLocations = (state.lookups?.locations || []).filter((location) => location.city === selectedCity);
  const currentLocationId = profile.current_location_id || cityLocations[0]?.location_id || '';

  return `
    <section class="panel">
      <div class="panel-header">
        <h2>Work Area</h2>
        <span>${escapeHtml(profile.current_location_address || selectedCity || 'Not set')}</span>
      </div>
      <form class="form-grid compact-form" id="driverLocationForm">
        <label>City
          <select name="city" id="driverWorkCity" required>
            ${selectOptions(cities, 'city', 'city', selectedCity)}
          </select>
        </label>
        <label>Nearest Point
          <select name="currentLocationId" id="driverWorkLocation" required>
            ${selectOptions(cityLocations, 'location_id', 'address', currentLocationId)}
          </select>
        </label>
        <button class="primary-action" type="submit">Save Area</button>
      </form>
    </section>
  `;
}

function bindDriverLocationForm() {
  const form = $('#driverLocationForm');
  const citySelect = $('#driverWorkCity');
  const locationSelect = $('#driverWorkLocation');
  if (!form || !citySelect || !locationSelect) {
    return;
  }

  citySelect.addEventListener('change', () => {
    const locations = (state.lookups?.locations || []).filter((location) => location.city === citySelect.value);
    locationSelect.innerHTML = selectOptions(locations, 'location_id', 'address');
  });

  form.addEventListener('submit', updateDriverLocation);
}

function renderRequestCard(ride) {
  return `
    <article class="request-card">
      <img class="request-art" src="/assets/rideflow-route-art.svg" alt="">
      <h3>Ride #${escapeHtml(ride.ride_id)}</h3>
      <p>${escapeHtml(ride.rider_name)}</p>
      <p>${escapeHtml(ride.pickup_address)} to ${escapeHtml(ride.dropoff_address)}</p>
      <p>${escapeHtml(formatNumber(ride.distance_km))} km | ${escapeHtml(formatNumber(ride.duration_min))} min</p>
      <strong>${escapeHtml(formatMoney(ride.final_fare))}</strong>
      <div class="card-actions">
        <button class="primary-action" data-accept="${escapeHtml(ride.ride_id)}" type="button">Accept</button>
        <button class="danger-action" data-reject="${escapeHtml(ride.ride_id)}" type="button">Reject</button>
      </div>
    </article>
  `;
}

function emptyState(text) {
  return `
    <div class="empty-state visual-empty">
      <img src="/assets/empty-rides.svg" alt="">
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

async function setAvailability(status) {
  await run(async () => {
    await api('/api/driver/availability', {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    await refresh();
  }, `Availability set to ${status}.`);
}

async function updateDriverLocation(event) {
  event.preventDefault();
  const payload = formObject(event.currentTarget);

  await run(async () => {
    await api('/api/driver/location', {
      method: 'PATCH',
      body: JSON.stringify({
        city: payload.city,
        currentLocationId: Number(payload.currentLocationId)
      })
    });
    await refresh();
  }, 'Work area updated.');
}

async function rideDecision(rideId, action) {
  if (!confirm(`${action === 'accept' ? 'Accept' : 'Reject'} ride #${rideId}?`)) {
    return;
  }

  await run(async () => {
    await api(`/api/driver/rides/${rideId}/${action}`, { method: 'POST' });
    await refresh();
  }, `Ride #${rideId} ${action}ed.`);
}
