import { escapeHtml, formatMoney, formatNumber, metrics, statusPill, table } from '../ui.js';

export function renderDriverEarnings({ data, profile }) {
  $('#content').innerHTML = `
    ${metrics([
      { label: 'Earnings', value: formatMoney(data.earnings.total_earnings) },
      { label: 'Paid Trips', value: formatNumber(data.earnings.paid_trip_count) },
      { label: 'Commission', value: formatMoney(data.earnings.platform_commission) }
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
      </section>
    </div>
  `;
}
