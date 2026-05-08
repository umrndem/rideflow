import { state } from '../state.js';
import { $, escapeHtml, statusPill, table } from '../ui.js';
import { adminStatusSelect, bindAdminStatusControls } from './shared.js';

export function renderAdminDrivers() {
  const data = state.data;

  $('#content').innerHTML = `
    <section class="panel">
      <div class="panel-header"><h2>Driver Verification</h2><span>${escapeHtml(data.drivers.length)} drivers</span></div>
      ${table(data.drivers, [
        { label: 'Driver', key: 'full_name' },
        { label: 'Email', key: 'email' },
        { label: 'City', key: 'current_city' },
        { label: 'License', key: 'license_number' },
        { label: 'Status', key: 'verification_status', format: statusPill },
        { label: 'Availability', key: 'availability_status', format: statusPill },
        { label: 'Action', key: 'driver_id', format: (value, row) => adminStatusSelect('driver', value, row.verification_status, ['pending', 'verified', 'rejected']) }
      ])}
    </section>
  `;
  bindAdminStatusControls();
}
