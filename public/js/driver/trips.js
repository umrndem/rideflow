import { api } from '../api.js';
import { refresh } from '../shell.js';
import { state } from '../state.js';
import {
  $,
  activeTimeline,
  escapeHtml,
  formatMoney,
  formatNumber,
  run,
  statusPill,
  table
} from '../ui.js';

export function renderDriverTrips({ data }) {
  $('#content').innerHTML = `
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
        { label: 'Route', key: 'pickup_city', format: (value, row) => `${escapeHtml(value)} to ${escapeHtml(row.dropoff_city)}` },
        { label: 'Payment', key: 'payment_method' },
        { label: 'Fare', key: 'final_fare', format: formatMoney },
        { label: 'Earning', key: 'driver_net_earning', format: formatMoney }
      ])}
    </section>
  `;

  document.querySelectorAll('[data-next-status]').forEach((button) => {
    button.addEventListener('click', () => moveRideStatus(button.dataset.rideId, button.dataset.nextStatus));
  });
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
