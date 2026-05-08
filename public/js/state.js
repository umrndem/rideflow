export const state = {
  token: localStorage.getItem('rideflow_token'),
  user: null,
  activeSection: null,
  data: null,
  lookups: null,
  lastRenderKey: '',
  publicLookups: { locations: [], cities: [] },
  estimate: null,
  selectedCity: '',
  estimateTimer: null,
  refreshTimer: null,
  isRefreshing: false,
  lastRefreshAt: null,
  autoRefreshMs: 5000,
  bookingDraft: {
    city: '',
    pickupLocationId: '',
    dropoffLocationId: '',
    vehicleType: 'economy',
    promoCode: '',
    paymentMethod: 'cash',
    bookLater: false,
    scheduledFor: ''
  },
  filters: {
    rideStatus: 'all',
    adminSearch: ''
  },
  editingFareRule: null
};

export const sections = {
  rider: [
    ['book', 'Book Ride'],
    ['history', 'Ride History'],
    ['wallet', 'Wallet']
  ],
  driver: [
    ['requests', 'Requests'],
    ['trips', 'Trips'],
    ['earnings', 'Earnings']
  ],
  admin: [
    ['reports', 'Reports'],
    ['users', 'Users'],
    ['drivers', 'Drivers'],
    ['vehicles', 'Vehicles'],
    ['fares', 'Fare Rules']
  ]
};
