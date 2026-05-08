import { api } from '../api.js';
import { refresh } from '../shell.js';
import { escapeHtml, run } from '../ui.js';

export function adminStatusSelect(type, id, current, values) {
  return `
    <select data-admin-status="${escapeHtml(type)}" data-record-id="${escapeHtml(id)}">
      ${values.map((value) => `<option value="${value}" ${value === current ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}
    </select>
  `;
}

export function bindAdminStatusControls() {
  document.querySelectorAll('[data-admin-status]').forEach((select) => {
    select.addEventListener('change', () => updateAdminStatus(select.dataset.adminStatus, select.dataset.recordId, select.value));
  });
}

async function updateAdminStatus(type, id, value) {
  const endpoints = {
    user: [`/api/admin/users/${id}/status`, { status: value }],
    driver: [`/api/admin/drivers/${id}`, { verificationStatus: value }],
    vehicle: [`/api/admin/vehicles/${id}`, { verificationStatus: value }]
  };

  const [path, body] = endpoints[type];
  await run(async () => {
    await api(path, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    await refresh();
  }, 'Status updated.');
}
