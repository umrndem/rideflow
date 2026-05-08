import { state } from '../state.js';
import { renderBookingSection } from './booking.js';
import { renderHistorySection } from './history.js';
import { renderWalletSection } from './wallet.js';

export function renderRider() {
  if (state.activeSection === 'book') {
    renderBookingSection();
    return;
  }

  if (state.activeSection === 'history') {
    renderHistorySection();
    return;
  }

  renderWalletSection();
}
