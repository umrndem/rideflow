import { state } from '../state.js';
import { $, escapeHtml, formatMoney, formatNumber, metrics, table } from '../ui.js';

export function renderAdminReports() {
  const data = state.data;

  $('#content').innerHTML = `
    ${metrics([
      { label: 'Users', value: formatNumber(data.metrics.total_users) },
      { label: 'Drivers', value: formatNumber(data.metrics.total_drivers) },
      { label: 'Pending Drivers', value: formatNumber(data.metrics.pending_drivers) },
      { label: 'Rides', value: formatNumber(data.metrics.total_rides) },
      { label: 'Revenue', value: formatMoney(data.metrics.total_revenue) },
      { label: 'Commission', value: formatMoney(data.metrics.platform_commission) }
    ])}
    <section class="ops-hero panel">
      <div>
        <span class="form-note">Operations view</span>
        <h2>City demand, fares, payouts, and quality signals in one control room.</h2>
      </div>
      <img src="/assets/admin-analytics.svg" alt="">
    </section>
    <div class="report-grid">
      <section class="panel">
        <div class="panel-header"><h2>Revenue By City</h2><span>Paid rides</span></div>
        ${barList(data.reports.revenueByCity, 'city', 'gross_revenue')}
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Payment Methods</h2><span>Revenue mix</span></div>
        ${table(data.reports.paymentMethods, [
          { label: 'Method', key: 'payment_method' },
          { label: 'Count', key: 'payment_count', format: formatNumber },
          { label: 'Revenue', key: 'gross_revenue', format: formatMoney },
          { label: 'Commission', key: 'platform_commission', format: formatMoney }
        ])}
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Driver Earnings</h2><span>Payout view</span></div>
        ${table(data.reports.driverEarnings, [
          { label: 'Driver', key: 'driver_name' },
          { label: 'Paid Trips', key: 'paid_trips', format: formatNumber },
          { label: 'Earnings', key: 'total_earnings', format: formatMoney },
          { label: 'Commission', key: 'commission', format: formatMoney }
        ])}
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Alerts</h2><span>Rating flags</span></div>
        ${table(data.reports.flags, [
          { label: 'Driver', key: 'driver_name' },
          { label: 'Rating', key: 'current_average_rating', format: formatNumber },
          { label: 'Reason', key: 'reason' }
        ])}
      </section>
    </div>
  `;
}

function barList(rows, labelKey, valueKey) {
  if (!rows.length) {
    return '<div class="empty-state">No report data</div>';
  }

  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);
  return `
    <div class="bar-list">
      ${rows.map((row) => {
        const value = Number(row[valueKey] || 0);
        const pct = Math.max(6, Math.round((value / max) * 100));
        return `
          <div class="bar-row">
            <strong>${escapeHtml(row[labelKey])}</strong>
            <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
            <span>${escapeHtml(formatMoney(value))}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
