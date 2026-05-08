import { api } from '../api.js';
import { refresh } from '../shell.js';
import { state } from '../state.js';
import {
  $,
  activeTimeline,
  escapeHtml,
  formObject,
  formatMoney,
  formatNumber,
  metrics,
  run,
  selectOptions,
  sqlDateTime,
  statusPill,
  toast
} from '../ui.js';

export function renderBookingSection() {
  const data = state.data;
  const wallet = data.wallet || {};
  const activeRide = data.currentRide
    && ['requested', 'accepted', 'driver_en_route', 'in_progress'].includes(data.currentRide.ride_status);

  const cities = state.lookups.cities || [];
  const draft = state.bookingDraft;
  const selectedCity = draft.city || state.selectedCity || cities[0]?.city || '';
  state.selectedCity = selectedCity;
  draft.city = selectedCity;
  const cityLocations = state.lookups.locations.filter((location) => location.city === selectedCity);
  const locationIds = cityLocations.map((location) => String(location.location_id));
  draft.vehicleType = ['economy', 'premium', 'bike'].includes(draft.vehicleType) ? draft.vehicleType : 'economy';
  draft.paymentMethod = ['cash', 'wallet', 'card'].includes(draft.paymentMethod) ? draft.paymentMethod : 'cash';

  if (!locationIds.includes(String(draft.pickupLocationId))) {
    draft.pickupLocationId = cityLocations[0]?.location_id || '';
  }

  if (!locationIds.includes(String(draft.dropoffLocationId)) || String(draft.dropoffLocationId) === String(draft.pickupLocationId)) {
    draft.dropoffLocationId = cityLocations.find((location) => String(location.location_id) !== String(draft.pickupLocationId))?.location_id || '';
  }

  $('#content').innerHTML = `
    ${metrics([
      { label: 'Wallet', value: formatMoney(wallet.balance) },
      { label: 'Trips', value: formatNumber(data.rideHistory.length) },
      { label: 'Current Ride', value: data.currentRide ? `#${data.currentRide.ride_id}` : 'None' }
    ])}
    <div class="booking-grid">
      <section class="panel">
        <div class="panel-header">
          <h2>Book Ride</h2>
          <span>Fare, promo, payment</span>
        </div>
        <form id="bookRideForm" class="form-grid">
          <label class="full">City
            <select name="city" id="bookingCitySelect" required>${selectOptions(cities, 'city', 'city', selectedCity)}</select>
          </label>
          <label>Pickup
            <select name="pickupLocationId" required>${selectOptions(cityLocations, 'location_id', 'address', draft.pickupLocationId)}</select>
          </label>
          <label>Drop-off
            <select name="dropoffLocationId" required>${selectOptions(cityLocations, 'location_id', 'address', draft.dropoffLocationId)}</select>
          </label>
          <div class="full">
            <label>Vehicle Type</label>
            <div class="vehicle-options">
              ${['economy', 'premium', 'bike'].map((type) => `
                <label class="choice-card">
                  <input type="radio" name="vehicleType" value="${type}" ${type === draft.vehicleType ? 'checked' : ''}>
                  <img class="vehicle-icon" src="${escapeHtml(vehicleAsset(type))}" alt="">
                  <span>${escapeHtml(type)}</span>
                  <strong>${escapeHtml(type === 'premium' ? 'Comfort ride' : type === 'bike' ? 'Fast pickup' : 'Daily ride')}</strong>
                </label>
              `).join('')}
            </div>
          </div>
          <label>Promo
            <select name="promoCode">
              <option value="">No promo</option>
              ${selectOptions(state.lookups.promos, 'code', 'code', draft.promoCode)}
            </select>
          </label>
          <div class="full">
            <label>Payment Method</label>
            <div class="payment-options">
              ${['cash', 'wallet', 'card'].map((method) => `
                <label class="choice-card">
                  <input type="radio" name="paymentMethod" value="${method}" ${method === draft.paymentMethod ? 'checked' : ''}>
                  <span>${escapeHtml(method)}</span>
                  <strong>${escapeHtml(method === 'wallet' ? 'RideFlow balance' : method === 'card' ? 'Card payment' : 'Pay driver')}</strong>
                </label>
              `).join('')}
            </div>
          </div>
          <label class="toggle-row full"><input name="bookLater" id="bookLaterCheckbox" type="checkbox" ${draft.bookLater ? 'checked' : ''}> Book for later</label>
          <label class="full ${draft.bookLater ? '' : 'hidden'}" id="scheduledForWrap">Pickup Time<input name="scheduledFor" type="datetime-local" value="${escapeHtml(draft.scheduledFor)}" ${draft.bookLater ? 'required' : ''}></label>
          <button class="primary-action" type="submit">Confirm Ride</button>
        </form>
      </section>
      <aside class="panel">
        <div class="panel-header">
          <h2>Ride Preview</h2>
          <span>Live calculation</span>
        </div>
        ${renderFarePreview(data.currentRide)}
        ${renderCurrentRide(data.currentRide)}
      </aside>
    </div>
  `;

  $('#bookingCitySelect').addEventListener('change', (event) => {
    state.selectedCity = event.target.value;
    state.bookingDraft.city = event.target.value;
    state.bookingDraft.pickupLocationId = '';
    state.bookingDraft.dropoffLocationId = '';
    state.estimate = null;
    renderBookingSection();
  });
  $('#bookLaterCheckbox').addEventListener('change', (event) => {
    updateBookingDraftFromForm($('#bookRideForm'));
    $('#scheduledForWrap').classList.toggle('hidden', !event.target.checked);
    $('#scheduledForWrap input').toggleAttribute('required', event.target.checked);
  });
  $('#bookRideForm').addEventListener('change', () => {
    updateBookingDraftFromForm($('#bookRideForm'));
    if (!activeRide) {
      scheduleFareEstimate();
    }
  });
  $('#bookRideForm').addEventListener('submit', bookRide);
  if (!state.estimate && !activeRide) {
    scheduleFareEstimate();
  }
  const cancelButton = $('#cancelRideButton');
  if (cancelButton && data.currentRide) {
    cancelButton.addEventListener('click', () => cancelRide(data.currentRide.ride_id));
  }
}

function renderFarePreview(currentRide) {
  if (currentRide && ['requested', 'accepted', 'driver_en_route', 'in_progress'].includes(currentRide.ride_status)) {
    return `
      <div class="fare-preview">
        <img class="preview-art" src="/assets/rideflow-route-art.svg" alt="">
        <span class="form-note">Current ride fare</span>
        <strong>${escapeHtml(formatMoney(currentRide.final_fare || 0))}</strong>
        <p>${escapeHtml(formatNumber(currentRide.distance_km || 0))} km | ${escapeHtml(formatNumber(currentRide.duration_min || 0))} min</p>
        <p>${escapeHtml(currentRide.pickup_city || 'Ride city')}</p>
      </div>
    `;
  }

  if (!state.estimate) {
    return `
      <div class="fare-preview">
        <img class="preview-art" src="/assets/empty-rides.svg" alt="">
        <span class="form-note">Estimated Fare</span>
        <strong>${escapeHtml(formatMoney(0))}</strong>
        <p>Awaiting route</p>
      </div>
    `;
  }

  const fare = state.estimate.fare;
  const route = state.estimate.route;
  return `
    <div class="fare-preview">
      <img class="preview-art" src="/assets/rideflow-route-art.svg" alt="">
      <span class="form-note">Estimated Fare</span>
      <strong>${escapeHtml(formatMoney(fare.finalFare))}</strong>
      <p>${escapeHtml(formatNumber(route.distance_km))} km | ${escapeHtml(formatNumber(route.duration_min))} min</p>
      <p>Base ${escapeHtml(formatMoney(fare.baseFare))} | Multiplier ${escapeHtml(formatNumber(fare.surgeMultiplier))}x | Discount ${escapeHtml(formatMoney(fare.discountAmount))}</p>
    </div>
  `;
}

function vehicleAsset(type) {
  const assets = {
    economy: '/assets/vehicle-economy.svg',
    premium: '/assets/vehicle-premium.svg',
    bike: '/assets/vehicle-bike.svg'
  };

  return assets[type] || assets.economy;
}

function renderCurrentRide(ride) {
  if (!ride) {
    return `
      <div class="current-ride">
        <strong>No active ride</strong>
      </div>
    `;
  }

  const canCancel = ['requested', 'accepted', 'driver_en_route'].includes(ride.ride_status);

  return `
    <div class="current-ride">
      <strong>Ride #${escapeHtml(ride.ride_id)}</strong>
      <p>${escapeHtml(ride.pickup_address)} to ${escapeHtml(ride.dropoff_address)}</p>
      ${statusPill(ride.ride_status)}
      ${ride.driver_current_location_address ? `
        <p>Driver at ${escapeHtml(ride.driver_current_location_address)}</p>
        <p>${escapeHtml(formatNumber(ride.driver_remaining_distance_km || 0))} km away | ETA ${escapeHtml(formatNumber(ride.driver_eta_min || 0))} min</p>
      ` : ''}
      ${renderDriverWarning(ride)}
      ${activeTimeline(ride.ride_status)}
      ${canCancel ? '<button class="danger-action" id="cancelRideButton" type="button">Cancel ride</button>' : ''}
    </div>
  `;
}

function renderDriverWarning(ride) {
  if (!Number(ride.driver_is_flagged)) {
    return '';
  }

  return `
    <div class="risk-banner">
      <strong>Driver review flag</strong>
      <p>${escapeHtml(ride.driver_flag_reason || 'This driver is under review because of recent ratings. You can still continue with this ride.')}</p>
    </div>
  `;
}

function updateBookingDraftFromForm(form) {
  if (!form) {
    return;
  }

  const payload = formObject(form);
  state.bookingDraft = {
    ...state.bookingDraft,
    city: payload.city || state.bookingDraft.city,
    pickupLocationId: payload.pickupLocationId || '',
    dropoffLocationId: payload.dropoffLocationId || '',
    vehicleType: payload.vehicleType || 'economy',
    promoCode: payload.promoCode || '',
    paymentMethod: payload.paymentMethod || 'cash',
    bookLater: payload.bookLater === 'on',
    scheduledFor: payload.scheduledFor || ''
  };
  state.selectedCity = state.bookingDraft.city;
}

async function estimateFare() {
  const form = $('#bookRideForm');
  if (!form) {
    return;
  }

  updateBookingDraftFromForm(form);
  const payload = riderRidePayload(form);
  if (!payload.pickupLocationId || !payload.dropoffLocationId || payload.pickupLocationId === payload.dropoffLocationId) {
    state.estimate = null;
    return;
  }

  await run(async () => {
    state.estimate = await api('/api/rider/fares/estimate', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    renderBookingSection();
  });
}

function scheduleFareEstimate() {
  if (state.data?.currentRide && ['requested', 'accepted', 'driver_en_route', 'in_progress'].includes(state.data.currentRide.ride_status)) {
    return;
  }

  window.clearTimeout(state.estimateTimer);
  state.estimateTimer = window.setTimeout(() => {
    estimateFare().catch(() => {});
  }, 350);
}

function riderRidePayload(form) {
  const payload = formObject(form);
  return {
    pickupLocationId: Number(payload.pickupLocationId),
    dropoffLocationId: Number(payload.dropoffLocationId),
    vehicleType: payload.vehicleType,
    scheduledFor: payload.bookLater === 'on' ? sqlDateTime(payload.scheduledFor) : null,
    promoCode: payload.promoCode || null,
    paymentMethod: payload.paymentMethod
  };
}

async function bookRide(event) {
  event.preventDefault();
  updateBookingDraftFromForm(event.currentTarget);
  const payload = riderRidePayload(event.currentTarget);

  if (payload.pickupLocationId === payload.dropoffLocationId) {
    toast('Pickup and drop-off must be different.', 'error');
    return;
  }

  if (state.bookingDraft.bookLater && !payload.scheduledFor) {
    toast('Choose a pickup time for a scheduled ride.', 'error');
    return;
  }

  if (!confirm('Confirm this ride request?')) {
    return;
  }

  await run(async () => {
    const result = await api('/api/rider/rides', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    state.estimate = null;
    await refresh();
    toast(`Ride #${result.rideId} created.`);
  });
}

async function cancelRide(rideId) {
  if (!confirm(`Cancel ride #${rideId}?`)) {
    return;
  }

  await run(async () => {
    await api(`/api/rider/rides/${rideId}/cancel`, { method: 'POST' });
    await refresh();
  }, `Ride #${rideId} cancelled.`);
}
