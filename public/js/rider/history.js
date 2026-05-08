import { api } from '../api.js';
import { refresh } from '../shell.js';
import { state } from '../state.js';
import {
  $,
  escapeHtml,
  formObject,
  formatMoney,
  formatNumber,
  normalizeStatus,
  run,
  statusPill,
  table
} from '../ui.js';

export function renderHistorySection() {
  const data = state.data;
  const rides = data.rideHistory.filter((ride) => (
    state.filters.rideStatus === 'all' || ride.ride_status === state.filters.rideStatus
  ));

  $('#content').innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <h2>Ride History</h2>
        <span>${escapeHtml(rides.length)} shown</span>
      </div>
      <div class="filter-row">
        <select id="rideHistoryFilter">
          ${['all', 'requested', 'accepted', 'driver_en_route', 'in_progress', 'completed', 'cancelled']
            .map((status) => `<option value="${status}" ${state.filters.rideStatus === status ? 'selected' : ''}>${escapeHtml(normalizeStatus(status))}</option>`)
            .join('')}
        </select>
      </div>
      ${table(rides, [
        { label: 'Ride', key: 'ride_id' },
        { label: 'Status', key: 'ride_status', format: statusPill },
        { label: 'Pickup', key: 'pickup_address' },
        { label: 'Drop-off', key: 'dropoff_address' },
        { label: 'Driver', key: 'driver_name', format: (value) => escapeHtml(value || 'Unassigned') },
        { label: 'Driver Status', key: 'driver_is_flagged', format: (value, row) => renderDriverStatus(row) },
        { label: 'Your Rating', key: 'rider_driver_rating_id', format: (value, row) => renderRatingControl(row) },
        { label: 'Issue', key: 'rider_complaint_id', format: (value, row) => renderComplaintControl(row) },
        { label: 'Payment', key: 'payment_method' },
        { label: 'Fare', key: 'final_fare', format: formatMoney }
      ])}
    </section>
  `;

  $('#rideHistoryFilter').addEventListener('change', (event) => {
    state.filters.rideStatus = event.target.value;
    renderHistorySection();
  });
  bindRatingForms();
  bindComplaintButtons();
}

function renderDriverStatus(ride) {
  if (!ride.driver_name) {
    return '-';
  }

  const rating = ride.driver_average_rating
    ? `${formatNumber(ride.driver_average_rating)} / 5 (${formatNumber(ride.driver_rating_count)} ratings)`
    : 'No rating yet';

  const flag = Number(ride.driver_is_flagged)
    ? '<span class="risk-badge">Review flag</span>'
    : '';

  return `<div class="driver-status-cell"><span>${escapeHtml(rating)}</span>${flag}</div>`;
}

function renderRatingControl(ride) {
  if (ride.ride_status !== 'completed' || !ride.driver_user_id) {
    return '-';
  }

  if (ride.rider_driver_rating_id) {
    return `<span class="rating-done">${escapeHtml(formatStars(ride.rider_driver_score))}</span>`;
  }

  return `
    <form class="rating-form" data-rating-form data-ride-id="${escapeHtml(ride.ride_id)}">
      <select name="score" aria-label="Rating score">
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
  if (!ride.driver_user_id || !['accepted', 'driver_en_route', 'in_progress', 'completed', 'cancelled'].includes(ride.ride_status)) {
    return '-';
  }

  if (ride.rider_complaint_id) {
    return statusPill(ride.rider_complaint_status || 'open');
  }

  return `<button class="secondary-action" data-rider-complaint="${escapeHtml(ride.ride_id)}" type="button">Report issue</button>`;
}

function formatStars(score) {
  const value = Math.max(1, Math.min(5, Number(score || 0)));
  return `${value} star${value === 1 ? '' : 's'}`;
}

function bindRatingForms() {
  document.querySelectorAll('[data-rating-form]').forEach((form) => {
    form.addEventListener('submit', rateDriver);
  });
}

function bindComplaintButtons() {
  document.querySelectorAll('[data-rider-complaint]').forEach((button) => {
    button.addEventListener('click', () => fileComplaint(button.dataset.riderComplaint));
  });
}

async function rateDriver(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formObject(form);

  await run(async () => {
    await api(`/api/rider/rides/${form.dataset.rideId}/driver-rating`, {
      method: 'POST',
      body: JSON.stringify({
        score: Number(payload.score),
        comment: payload.comment || ''
      })
    });
    await refresh();
  }, 'Driver rated.');
}

async function fileComplaint(rideId) {
  const complaintText = window.prompt('Describe the issue with this ride.');
  if (!complaintText || !complaintText.trim()) {
    return;
  }

  await run(async () => {
    await api(`/api/rider/rides/${rideId}/complaints`, {
      method: 'POST',
      body: JSON.stringify({ complaintText: complaintText.trim() })
    });
    await refresh();
  }, 'Issue reported.');
}
