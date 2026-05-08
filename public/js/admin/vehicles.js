import { state } from '../state.js';
import { $, escapeHtml, statusPill, table } from '../ui.js';
import { adminStatusSelect, bindAdminStatusControls } from './shared.js';

export function renderAdminVehicles() {
  const data = state.data;

  $('#content').innerHTML = `
    <section class="panel">
      <div class="panel-header"><h2>Vehicle Verification</h2><span>${escapeHtml(data.vehicles.length)} vehicles</span></div>
      ${table(data.vehicles, [
        { label: 'Driver', key: 'driver_name' },
        { label: 'Model', key: 'make', format: (value, row) => `${escapeHtml(value)} ${escapeHtml(row.model)}` },
        { label: 'Plate', key: 'license_plate' },
        { label: 'Type', key: 'vehicle_type' },
        { label: 'Status', key: 'verification_status', format: statusPill },
        { label: 'Action', key: 'vehicle_id', format: (value, row) => adminStatusSelect('vehicle', value, row.verification_status, ['pending', 'verified', 'rejected']) }
      ])}
    </section>
  `;
  bindAdminStatusControls();
}
