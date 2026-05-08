import { api } from '../api.js';
import { refresh } from '../shell.js';
import { state } from '../state.js';
import { $, escapeHtml, formatMoney, formatNumber, formObject, run, table, vehicleTypeOptions } from '../ui.js';

export function renderAdminFareRules() {
  const rule = state.editingFareRule
    ? state.data.fareRules.find((item) => String(item.fare_rule_id) === String(state.editingFareRule))
    : null;

  $('#content').innerHTML = `
    <section class="panel">
      <div class="panel-header"><h2>${rule ? 'Edit Fare Rule' : 'Add Fare Rule'}</h2><span>Pricing engine</span></div>
      <form class="form-grid" id="fareRuleForm">
        <input type="hidden" name="fareRuleId" value="${escapeHtml(rule?.fare_rule_id || '')}">
        <label>City<input name="city" value="${escapeHtml(rule?.city || '')}" ${rule ? 'readonly' : ''} required></label>
        <label>Vehicle Type<select name="vehicleType" ${rule ? 'disabled' : ''}>${vehicleTypeOptions(rule?.vehicle_type || 'economy')}</select></label>
        <label>Base Rate<input name="baseRate" type="number" min="0" step="1" value="${escapeHtml(rule?.base_rate || '')}" required></label>
        <label>Per KM<input name="perKmRate" type="number" min="0" step="1" value="${escapeHtml(rule?.per_km_rate || '')}" required></label>
        <label>Per Min<input name="perMinRate" type="number" min="0" step="1" value="${escapeHtml(rule?.per_min_rate || '')}" required></label>
        <label>Surge<input name="surgeMultiplier" type="number" min="1" step="0.05" value="${escapeHtml(rule?.surge_multiplier || 1)}" required></label>
        <label>Commission<input name="commissionRate" type="number" min="0" max="1" step="0.01" value="${escapeHtml(rule?.commission_rate || 0.2)}" required></label>
        <label>Status<select name="isActive"><option value="1" ${rule?.is_active !== 0 ? 'selected' : ''}>active</option><option value="0" ${rule?.is_active === 0 ? 'selected' : ''}>inactive</option></select></label>
        <button class="primary-action" type="submit">${rule ? 'Save Rule' : 'Add Rule'}</button>
        ${rule ? '<button class="secondary-action" type="button" id="cancelFareEdit">Cancel</button>' : ''}
      </form>
    </section>
    <section class="panel">
      <div class="panel-header"><h2>Fare Rules</h2><span>${escapeHtml(state.data.fareRules.length)} rules</span></div>
      ${table(state.data.fareRules, [
        { label: 'City', key: 'city' },
        { label: 'Type', key: 'vehicle_type' },
        { label: 'Base', key: 'base_rate', format: formatMoney },
        { label: 'Per KM', key: 'per_km_rate', format: formatMoney },
        { label: 'Per Min', key: 'per_min_rate', format: formatMoney },
        { label: 'Surge', key: 'surge_multiplier', format: formatNumber },
        { label: 'Commission', key: 'commission_rate', format: formatNumber },
        { label: 'Action', key: 'fare_rule_id', format: (value) => `<button data-edit-fare="${escapeHtml(value)}" type="button">Edit</button>` }
      ])}
    </section>
  `;

  $('#fareRuleForm').addEventListener('submit', saveFareRule);
  $('#cancelFareEdit')?.addEventListener('click', () => {
    state.editingFareRule = null;
    renderAdminFareRules();
  });
  document.querySelectorAll('[data-edit-fare]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editingFareRule = button.dataset.editFare;
      renderAdminFareRules();
    });
  });
}

async function saveFareRule(event) {
  event.preventDefault();
  const payload = formObject(event.currentTarget);
  const body = {
    city: payload.city,
    vehicleType: payload.vehicleType || state.data.fareRules.find((rule) => String(rule.fare_rule_id) === String(payload.fareRuleId))?.vehicle_type,
    baseRate: Number(payload.baseRate),
    perKmRate: Number(payload.perKmRate),
    perMinRate: Number(payload.perMinRate),
    surgeMultiplier: Number(payload.surgeMultiplier),
    commissionRate: Number(payload.commissionRate),
    isActive: payload.isActive === '1'
  };

  await run(async () => {
    if (payload.fareRuleId) {
      await api(`/api/admin/fare-rules/${payload.fareRuleId}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      state.editingFareRule = null;
    } else {
      await api('/api/admin/fare-rules', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    }
    await refresh();
  }, 'Fare rule saved.');
}
