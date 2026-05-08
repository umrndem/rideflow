import { state } from './state.js';

export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (state.token) {
    headers['X-Session-Token'] = state.token;
  }

  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('rideflow_token');
      state.token = null;
      state.user = null;
    }

    throw new Error(payload.error || response.statusText);
  }

  return payload;
}
