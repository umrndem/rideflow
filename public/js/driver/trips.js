import { api } from '../api.js';
import { refresh } from '../shell.js';
import { state } from '../state.js';
import {
  $,
  activeTimeline,
  escapeHtml,
  formatMoney,
  formatNumber,
  formObject,
  run,
  selectOptions,
  statusPill,
  table
} from '../ui.js';

export function renderDriverTrips({ data, profile }) {
  const cityLocations = (state.lookups?.locations || []).filter((location) => location.city === profile.current_city);

  $('#content').innerHTML = `
    ${data.activeTrips.length ? renderTrackingPanel(profile, cityLocations) : ''}
    <section class="panel">
      <div class="panel-header">
        <h2>Active Trips</h2>
        <span>${escapeHtml(data.activeTrips.length)} active</span>
      </div>
      <div class="request-grid">
        ${data.activeTrips.length ? data.activeTrips.map(renderActiveTripCard).join('') : emptyState('No active trips')}
      </div>
    </section>
    <section class="panel">
      <div class="panel-header">
        <h2>Trip History</h2>
        <span>${escapeHtml(data.tripHistory.length)} trips</span>
      </div>
      ${table(data.tripHistory, [
        { label: 'Ride', key: 'ride_id' },
        { label: 'Status', key: 'ride_status', format: statusPill },
        { label: 'Rider', key: 'rider_name' },
        { label: 'Rider Status', key: 'rider_average_rating', format: (value, row) => renderRiderStatus(row) },
        { label: 'Route', key: 'pickup_city', format: (value, row) => `${escapeHtml(value)} to ${escapeHtml(row.dropoff_city)}` },
        { label: 'Your Rating', key: 'driver_rider_rating_id', format: (value, row) => renderRatingControl(row) },
        { label: 'Issue', key: 'driver_complaint_id', format: (value, row) => renderComplaintControl(row) },
        { label: 'Payment', key: 'payment_method' },
        { label: 'Fare', key: 'final_fare', format: formatMoney },
        { label: 'Earning', key: 'driver_net_earning', format: formatMoney }
      ])}
    </section>
  `;

  document.querySelectorAll('[data-next-status]').forEach((button) => {
    button.addEventListener('click', () => moveRideStatus(button.dataset.rideId, button.dataset.nextStatus));
  });
  document.querySelectorAll('[data-driver-rating-form]').forEach((form) => {
    form.addEventListener('submit', rateRider);
  });
  document.querySelectorAll('[data-driver-complaint]').forEach((button) => {
    button.addEventListener('click', () => fileComplaint(button.dataset.driverComplaint));
  });
  $('#driverTripLocationForm')?.addEventListener('submit', updateTripLocation);
}

function renderTrackingPanel(profile, cityLocations) {
  return `
    <section class="panel">
      <div class="panel-header">
        <h2>Trip Tracking</h2>
        <span>${escapeHtml(profile.current_location_address || 'Location not set')}</span>
      </div>
      <form class="form-grid compact-form" id="driverTripLocationForm">
        <label>Current Stop
          <select name="currentLocationId" required>
            ${selectOptions(cityLocations, 'location_id', 'address', profile.current_location_id)}
          </select>
        </label>
        <button class="primary-action" type="submit">Update Live Location</button>
      </form>
    </section>
  `;
}

function renderActiveTripCard(ride) {
  const nextMap = {
    accepted: ['driver_en_route', 'Driver En Route'],
    driver_en_route: ['in_progress', 'Start Trip'],
    in_progress: ['completed', 'Complete Trip']
  };
  const next = nextMap[ride.ride_status];

  return `
    <article class="request-card">
      <img class="request-art" src="/assets/rideflow-route-art.svg" alt="">
      <h3>Ride #${escapeHtml(ride.ride_id)}</h3>
      ${statusPill(ride.ride_status)}
      <p>${escapeHtml(ride.rider_name)}</p>
      <p>${escapeHtml(ride.pickup_address)} to ${escapeHtml(ride.dropoff_address)}</p>
      <strong>${escapeHtml(formatMoney(ride.final_fare))}</strong>
      ${activeTimeline(ride.ride_status)}
      ${next ? `<button class="primary-action" data-ride-id="${escapeHtml(ride.ride_id)}" data-next-status="${escapeHtml(next[0])}" type="button">${escapeHtml(next[1])}</button>` : ''}
    </article>
  `;
}

function renderRiderStatus(ride) {
  const rating = ride.rider_average_rating
    ? `${formatNumber(ride.rider_average_rating)} / 5`
    : 'No rating yet';

  const flag = Number(ride.rider_is_flagged)
    ? `<span class="risk-badge" title="${escapeHtml(ride.rider_warning_reason || 'Rider is currently under review.')}">Warning</span>`
    : '';

  return `<div class="driver-status-cell"><span>${escapeHtml(rating)}</span>${flag}</div>`;
}

function renderRatingControl(ride) {
  if (ride.ride_status !== 'completed' || !ride.rider_user_id) {
    return '-';
  }

  if (ride.driver_rider_rating_id) {
    return `<span class="rating-done">${escapeHtml(formatStars(ride.driver_rider_score))}</span>`;
  }

  return `
    <form class="rating-form" data-driver-rating-form data-ride-id="${escapeHtml(ride.ride_id)}">
      <select name="score" aria-label="Rider rating score">
        <option value="5">5 stars</option>
        <option value="4">4 stars</option>
        <option value="3">3 stars</option>
        <option value="2">2 stars</option>
        <option value="1">1 star</option>
      </select>
      <input name="comment" maxlength="500" placeholder="Optional note">
      <button class="primary-action" type="submit">Rate</button>
    </form>
  `;
}

function renderComplaintControl(ride) {
  if (!ride.rider_user_id || !['accepted', 'driver_en_route', 'in_progress', 'completed', 'cancelled'].includes(ride.ride_status)) {
    return '-';
  }

  if (ride.driver_complaint_id) {
    return statusPill(ride.driver_complaint_status || 'open');
  }

  return `<button class="secondary-action" data-driver-complaint="${escapeHtml(ride.ride_id)}" type="button">Report issue</button>`;
}

function formatStars(score) {
  const value = Math.max(1, Math.min(5, Number(score || 0)));
  return `${value} star${value === 1 ? '' : 's'}`;
}

function emptyState(text) {
  return `
    <div class="empty-state visual-empty">
      <img src="/assets/empty-rides.svg" alt="">
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

async function moveRideStatus(rideId, status) {
  if (status === 'completed' && !confirm(`Complete ride #${rideId}?`)) {
    return;
  }

  await run(async () => {
    await api(`/api/driver/rides/${rideId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    await refresh();
  }, `Ride #${rideId} updated.`);
}

async function rateRider(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formObject(form);

  await run(async () => {
    await api(`/api/driver/rides/${form.dataset.rideId}/rider-rating`, {
      method: 'POST',
      body: JSON.stringify({
        score: Number(payload.score),
        comment: payload.comment || ''
      })
    });
    await refresh();
  }, 'Rider rated.');
}

async function fileComplaint(rideId) {
  const complaintText = window.prompt('Describe the issue with this ride.');
  if (!complaintText || !complaintText.trim()) {
    return;
  }

  await run(async () => {
    await api(`/api/driver/rides/${rideId}/complaints`, {
      method: 'POST',
      body: JSON.stringify({ complaintText: complaintText.trim() })
    });
    await refresh();
  }, 'Issue reported.');
}

async function updateTripLocation(event) {
  event.preventDefault();
  const payload = formObject(event.currentTarget);

  await run(async () => {
    await api('/api/driver/location', {
      method: 'PATCH',
      body: JSON.stringify({
        city: state.data.profile.current_city,
        currentLocationId: Number(payload.currentLocationId),
        allowDuringTrip: true
      })
    });
    await refresh();
  }, 'Live location updated.');
}
