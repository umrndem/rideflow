import { api } from '../api.js';
import { refresh } from '../shell.js';
import { state } from '../state.js';
import { $, escapeHtml, formatMoney, formatNumber, metrics, run, statusPill, table } from '../ui.js';

export function renderAdminReports() {
  const data = state.data;
  const refundDisputes = data.reports.refundDisputes || {};

  $('#content').innerHTML = `
    ${metrics([
      { label: 'Users', value: formatNumber(data.metrics.total_users) },
      { label: 'Drivers', value: formatNumber(data.metrics.total_drivers) },
      { label: 'Pending Drivers', value: formatNumber(data.metrics.pending_drivers) },
      { label: 'Revenue', value: formatMoney(data.metrics.total_revenue) },
      { label: 'Refunded', value: formatNumber(refundDisputes.refund_count) },
      { label: 'Open Disputes', value: formatNumber(refundDisputes.active_dispute_count) }
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
    <section class="panel">
      <div class="panel-header"><h2>Refunds and Disputes</h2><span>Support snapshot</span></div>
      ${table([refundDisputes], [
        { label: 'Refund Count', key: 'refund_count', format: formatNumber },
        { label: 'Refund Amount', key: 'refund_amount_total', format: formatMoney },
        { label: 'Open Disputes', key: 'active_dispute_count', format: formatNumber },
        { label: 'Resolved Disputes', key: 'resolved_dispute_count', format: formatNumber }
      ])}
    </section>
    <section class="panel">
      <div class="panel-header"><h2>Complaints</h2><span>${escapeHtml(data.reports.complaints.length)} cases</span></div>
      ${table(data.reports.complaints, [
        { label: 'Ride', key: 'ride_id' },
        { label: 'Complainant', key: 'complainant_name' },
        { label: 'Respondent', key: 'respondent_name' },
        { label: 'Complaint', key: 'complaint_text' },
        { label: 'Status', key: 'complaint_status', format: statusPill },
        { label: 'Refund', key: 'payment_status', format: (value, row) => renderRefundAction(row) },
        { label: 'Action', key: 'complaint_id', format: (value, row) => renderComplaintAction(row) }
      ])}
    </section>
    <section class="panel">
      <div class="panel-header"><h2>Payout Requests</h2><span>${escapeHtml(data.reports.payoutRequests.length)} requests</span></div>
      ${table(data.reports.payoutRequests, [
        { label: 'Driver', key: 'driver_name' },
        { label: 'Amount', key: 'amount', format: formatMoney },
        { label: 'Status', key: 'status', format: statusPill },
        { label: 'Notes', key: 'notes', format: (value) => escapeHtml(value || '-') },
        { label: 'Action', key: 'payout_request_id', format: (value, row) => renderPayoutAction(row) }
      ])}
    </section>
  `;

  document.querySelectorAll('[data-complaint-status-select]').forEach((select) => {
    select.addEventListener('change', () => updateComplaintStatus(select.dataset.complaintId, select.value));
  });
  document.querySelectorAll('[data-refund-payment]').forEach((button) => {
    button.addEventListener('click', () => refundPayment(button.dataset.paymentId, button.dataset.complaintId));
  });
  document.querySelectorAll('[data-payout-status-select]').forEach((select) => {
    select.addEventListener('change', () => updatePayoutStatus(select.dataset.payoutRequestId, select.value));
  });
}

function renderComplaintAction(row) {
  return `
    <select data-complaint-status-select data-complaint-id="${escapeHtml(row.complaint_id)}">
      ${['open', 'under_review', 'resolved', 'rejected']
        .map((value) => `<option value="${value}" ${value === row.complaint_status ? 'selected' : ''}>${escapeHtml(value)}</option>`)
        .join('')}
    </select>
  `;
}

function renderRefundAction(row) {
  if (!row.payment_id) {
    return '-';
  }

  if (row.payment_status === 'refunded') {
    return statusPill('refunded');
  }

  if (row.payment_status !== 'paid') {
    return escapeHtml(row.payment_status || '-');
  }

  return `<button class="secondary-action" data-refund-payment="${escapeHtml(row.payment_id)}" data-complaint-id="${escapeHtml(row.complaint_id)}" type="button">Refund ${escapeHtml(formatMoney(row.payment_amount))}</button>`;
}

function renderPayoutAction(row) {
  if (row.status !== 'pending') {
    return statusPill(row.status);
  }

  return `
    <select data-payout-status-select data-payout-request-id="${escapeHtml(row.payout_request_id)}">
      <option value="pending" selected>pending</option>
      <option value="paid">paid</option>
      <option value="rejected">rejected</option>
    </select>
  `;
}

async function updateComplaintStatus(complaintId, status) {
  await run(async () => {
    await api(`/api/admin/complaints/${complaintId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    await refresh();
  }, 'Complaint updated.');
}

async function refundPayment(paymentId, complaintId) {
  if (!confirm(`Refund payment #${paymentId}?`)) {
    return;
  }

  await run(async () => {
    await api(`/api/admin/payments/${paymentId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ complaintId: Number(complaintId) })
    });
    await refresh();
  }, 'Refund processed.');
}

async function updatePayoutStatus(payoutRequestId, status) {
  if (status === 'pending') {
    return;
  }

  await run(async () => {
    await api(`/api/admin/payout-requests/${payoutRequestId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    await refresh();
  }, 'Payout request updated.');
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
