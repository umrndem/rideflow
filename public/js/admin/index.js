import { state } from '../state.js';
import { renderAdminDrivers } from './drivers.js';
import { renderAdminFareRules } from './fareRules.js';
import { renderAdminReports } from './reports.js';
import { renderAdminUsers } from './users.js';
import { renderAdminVehicles } from './vehicles.js';

export function renderAdmin() {
  if (state.activeSection === 'reports') {
    renderAdminReports();
    return;
  }

  if (state.activeSection === 'users') {
    renderAdminUsers();
    return;
  }

  if (state.activeSection === 'drivers') {
    renderAdminDrivers();
    return;
  }

  if (state.activeSection === 'vehicles') {
    renderAdminVehicles();
    return;
  }

  renderAdminFareRules();
}
