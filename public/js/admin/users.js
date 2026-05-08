import { api } from '../api.js';
import { refresh } from '../shell.js';
import { state } from '../state.js';
import { $, escapeHtml, formObject, run, statusPill, table } from '../ui.js';
import { adminStatusSelect, bindAdminStatusControls } from './shared.js';

export function renderAdminUsers() {
  const data = state.data;
  const search = state.filters.adminSearch.trim().toLowerCase();
  const users = data.users.filter((user) => (
    !search
      || user.full_name.toLowerCase().includes(search)
      || user.email.toLowerCase().includes(search)
      || user.role.toLowerCase().includes(search)
  ));

  $('#content').innerHTML = `
    <section class="panel">
      <div class="panel-header"><h2>Create User</h2><span>Admin only</span></div>
      <form class="form-grid" id="createUserForm">
        <label>Full Name<input name="fullName" required></label>
        <label>Email<input name="email" type="email" required></label>
        <label>Phone<input name="phone" required></label>
        <label>Password<input name="password" type="password" required></label>
        <label>Role<select name="role"><option value="rider">Rider</option><option value="driver">Driver</option><option value="admin">Admin</option></select></label>
        <button class="primary-action" type="submit">Create User</button>
      </form>
    </section>
    <section class="panel">
      <div class="panel-header"><h2>Users</h2><span>${escapeHtml(users.length)} shown</span></div>
      <div class="filter-row"><input id="adminSearchInput" value="${escapeHtml(state.filters.adminSearch)}" placeholder="Search users"></div>
      ${table(users, [
        { label: 'Name', key: 'full_name' },
        { label: 'Email', key: 'email' },
        { label: 'Role', key: 'role' },
        { label: 'Status', key: 'account_status', format: statusPill },
        { label: 'Action', key: 'user_id', format: (value, row) => adminStatusSelect('user', value, row.account_status, ['active', 'suspended', 'banned']) }
      ])}
    </section>
  `;

  $('#createUserForm').addEventListener('submit', createUser);
  $('#adminSearchInput').addEventListener('input', (event) => {
    state.filters.adminSearch = event.target.value;
    renderAdminUsers();
  });
  bindAdminStatusControls();
}

async function createUser(event) {
  event.preventDefault();
  const payload = formObject(event.currentTarget);
  await run(async () => {
    await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    await refresh();
  }, 'User created.');
}
