import { api } from '../api.js';
import { refresh } from '../shell.js';
import {
  $,
  escapeHtml,
  formatMoney,
  formatNumber,
  formObject,
  metrics,
  run,
  statusPill,
  table,
  vehicleTypeOptions
} from '../ui.js';

export function renderDriverEarnings({ data, profile }) {
  const pendingPayoutTotal = (data.payoutRequests || [])
    .filter((request) => request.status === 'pending')
    .reduce((sum, request) => sum + Number(request.amount || 0), 0);

  $('#content').innerHTML = `
    ${metrics([
      { label: 'Earnings', value: formatMoney(data.earnings.total_earnings) },
      { label: 'Wallet', value: formatMoney(data.wallet?.balance) },
      { label: 'Paid Trips', value: formatNumber(data.earnings.paid_trip_count) },
      { label: 'Pending Payouts', value: formatMoney(pendingPayoutTotal) }
    ])}
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-header">
          <h2>Driver Profile</h2>
          <span>${escapeHtml(profile.verification_status)}</span>
        </div>
        <img class="panel-art" src="/assets/driver-trust.svg" alt="">
        ${table([profile], [
          { label: 'Name', key: 'full_name' },
          { label: 'City', key: 'current_city' },
          { label: 'Location', key: 'current_location_address' },
          { label: 'Availability', key: 'availability_status', format: statusPill },
          { label: 'Trips', key: 'total_trips_completed', format: formatNumber },
          { label: 'Rating', key: 'average_rating', format: formatNumber }
        ])}
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>Vehicles</h2>
          <span>${escapeHtml(data.vehicles.length)} registered</span>
        </div>
        ${table(data.vehicles, [
          { label: 'Model', key: 'make', format: (value, row) => `${escapeHtml(value)} ${escapeHtml(row.model)}` },
          { label: 'Plate', key: 'license_plate' },
          { label: 'Type', key: 'vehicle_type' },
          { label: 'Status', key: 'verification_status', format: statusPill }
        ])}
        <form class="form-grid compact-form" id="addVehicleForm">
          <label>Make<input name="make" required></label>
          <label>Model<input name="model" required></label>
          <label>Year<input name="year" type="number" min="1980" max="2100" required></label>
          <label>Color<input name="color" required></label>
          <label>Plate<input name="licensePlate" required></label>
          <label>Type<select name="vehicleType">${vehicleTypeOptions('economy')}</select></label>
          <button class="primary-action" type="submit">Add Vehicle</button>
        </form>
      </section>
    </div>
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-header">
          <h2>Driver Wallet</h2>
          <span>${escapeHtml(formatMoney(data.wallet?.balance))}</span>
        </div>
        <div class="wallet-balance">
          <span>Available balance</span>
          <strong>${escapeHtml(formatMoney(data.wallet?.balance))}</strong>
        </div>
        <form class="inline-form" id="driverPayoutForm">
          <label class="full">Payout Amount<input name="amount" type="number" min="1" step="1" required></label>
          <button class="primary-action" type="submit">Request Weekly Payout</button>
        </form>
        ${table(data.payoutRequests || [], [
          { label: 'Request', key: 'payout_request_id' },
          { label: 'Amount', key: 'amount', format: formatMoney },
          { label: 'Status', key: 'status', format: statusPill },
          { label: 'Notes', key: 'notes', format: (value) => escapeHtml(value || '-') }
        ])}
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>Wallet Activity</h2>
          <span>${escapeHtml((data.walletTransactions || []).length)} records</span>
        </div>
        ${table(data.walletTransactions || [], [
          { label: 'Type', key: 'transaction_type', format: statusPill },
          { label: 'Amount', key: 'amount', format: formatMoney },
          { label: 'Balance', key: 'balance_after', format: formatMoney },
          { label: 'Details', key: 'description' }
        ])}
      </section>
    </div>
  `;

  $('#addVehicleForm')?.addEventListener('submit', addVehicle);
  $('#driverPayoutForm')?.addEventListener('submit', requestPayout);
}

async function addVehicle(event) {
  event.preventDefault();
  const payload = formObject(event.currentTarget);

  await run(async () => {
    await api('/api/driver/vehicles', {
      method: 'POST',
      body: JSON.stringify({
        make: payload.make,
        model: payload.model,
        year: Number(payload.year),
        color: payload.color,
        licensePlate: payload.licensePlate,
        vehicleType: payload.vehicleType
      })
    });
    await refresh();
  }, 'Vehicle added for admin verification.');
}

async function requestPayout(event) {
  event.preventDefault();
  const payload = formObject(event.currentTarget);

  await run(async () => {
    await api('/api/driver/payout-requests', {
      method: 'POST',
      body: JSON.stringify({ amount: Number(payload.amount) })
    });
    await refresh();
  }, 'Weekly payout requested.');
}
