import { state } from '../state.js';
import { renderDriverEarnings } from './earnings.js';
import { renderDriverRequests } from './requests.js';
import { renderDriverTrips } from './trips.js';

export function renderDriver() {
  const data = state.data;
  const profile = data.profile || {};
  const isVerified = profile.verification_status === 'verified'
    && data.vehicles.some((vehicle) => vehicle.verification_status === 'verified');

  if (state.activeSection === 'requests') {
    renderDriverRequests({ data, profile, isVerified });
    return;
  }

  if (state.activeSection === 'trips') {
    renderDriverTrips({ data, profile });
    return;
  }

  renderDriverEarnings({ data, profile });
}
