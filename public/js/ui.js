const money = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat('en-PK', {
  maximumFractionDigits: 2
});

export function $(selector) {
  return document.querySelector(selector);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatMoney(value) {
  return money.format(Number(value || 0));
}

export function formatNumber(value) {
  return number.format(Number(value || 0));
}

export function normalizeStatus(status) {
  return String(status || 'unknown').replaceAll('_', ' ');
}

export function statusPill(status) {
  const clean = String(status || 'unknown');
  return `<span class="status-pill ${escapeHtml(clean)}">${escapeHtml(normalizeStatus(clean))}</span>`;
}

export function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function sqlDateTime(value) {
  if (!value) {
    return null;
  }

  return `${value.replace('T', ' ')}:00`;
}

export function showLoading(isLoading) {
  $('#loadingBar').classList.toggle('hidden', !isLoading);
}

export function toast(text, type = 'success') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = text;
  $('#toastHost').appendChild(node);
  window.setTimeout(() => node.remove(), 4200);
}

export async function run(action, successMessage) {
  try {
    showLoading(true);
    const result = await action();
    if (successMessage) {
      toast(successMessage);
    }
    return result;
  } catch (error) {
    toast(error.message, 'error');
    throw error;
  } finally {
    showLoading(false);
  }
}

export function table(rows, columns) {
  if (!rows || rows.length === 0) {
    return '<div class="empty-state">No records found</div>';
  }

  const header = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const body = rows.map((row) => {
    const cells = columns.map((column) => {
      const raw = row[column.key];
      const value = column.format ? column.format(raw, row) : escapeHtml(raw ?? '-');
      return `<td data-label="${escapeHtml(column.label)}">${value}</td>`;
    }).join('');

    return `<tr>${cells}</tr>`;
  }).join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

export function metrics(items) {
  return `
    <div class="metric-grid">
      ${items.map((item) => `
        <article class="metric-card">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </article>
      `).join('')}
    </div>
  `;
}

export function selectOptions(rows, valueKey, labelKey, selected = '') {
  return rows.map((row) => {
    const value = row[valueKey];
    return `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(row[labelKey])}</option>`;
  }).join('');
}

export function vehicleTypeOptions(selected = '') {
  return ['economy', 'premium', 'bike']
    .map((type) => `<option value="${type}" ${type === selected ? 'selected' : ''}>${type}</option>`)
    .join('');
}

export function activeTimeline(status) {
  const steps = ['requested', 'accepted', 'driver_en_route', 'in_progress', 'completed'];
  const currentIndex = Math.max(0, steps.indexOf(status));

  return `
    <div class="timeline">
      ${steps.map((step, index) => `<span class="${index <= currentIndex ? 'active' : ''}">${escapeHtml(normalizeStatus(step))}</span>`).join('')}
    </div>
  `;
}
