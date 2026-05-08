const audiences = ['rider', 'driver', 'admin'];

const audienceConfig = {
  rider: {
    audience: 'rider',
    browserTitle: 'RideFlow',
    homePath: '/',
    authTabs: ['login', 'riderSignup'],
    brandCopy: 'Book rides in seconds, track live trip progress, and manage payments without leaving the app.',
    accessLabel: 'Rider Access',
    accessTitle: 'Welcome back',
    accessCopy: 'Sign in to book rides, track trips, and manage your wallet in one place.',
    loginButton: 'Sign In'
  },
  driver: {
    audience: 'driver',
    browserTitle: 'RideFlow Driver',
    homePath: '/driver/',
    authTabs: ['login', 'driverSignup'],
    brandCopy: 'Stay online, accept nearby requests, and manage your workday with a driver-first control center.',
    accessLabel: 'Driver Access',
    accessTitle: 'Driver workspace',
    accessCopy: 'Sign in to accept trips, update your work area, and follow your earnings in real time.',
    loginButton: 'Enter Driver App'
  },
  admin: {
    audience: 'admin',
    browserTitle: 'RideFlow Admin',
    homePath: '/admin/',
    authTabs: ['login'],
    brandCopy: 'Monitor city operations, manage trust and safety, and tune fare rules from one operations hub.',
    accessLabel: 'Admin Access',
    accessTitle: 'Operations control',
    accessCopy: 'Sign in to manage users, fares, operations, and live business reporting.',
    loginButton: 'Enter Admin Panel'
  }
};

function hostAudience(hostname) {
  if (/^admin(\.|$)/.test(hostname)) {
    return 'admin';
  }

  if (/^driver(\.|$)/.test(hostname)) {
    return 'driver';
  }

  return null;
}

function currentHostname() {
  return window.location.hostname.trim().toLowerCase();
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost');
}

function rootHost(hostname) {
  return hostname.replace(/^(admin|driver)\./, '');
}

function detectAudience() {
  const hostname = currentHostname();
  const pathname = window.location.pathname.toLowerCase();
  const hostBasedAudience = hostAudience(hostname);

  if (hostBasedAudience) {
    return hostBasedAudience;
  }

  if (pathname.startsWith('/admin')) {
    return 'admin';
  }

  if (pathname.startsWith('/driver')) {
    return 'driver';
  }

  const metaAudience = document.querySelector('meta[name="rideflow-audience"]')?.content?.trim().toLowerCase();
  if (audiences.includes(metaAudience)) {
    return metaAudience;
  }

  return 'rider';
}

export const pageContext = audienceConfig[detectAudience()];

export function homePathForRole(role) {
  if (role === 'admin' || role === 'super_admin') {
    return audienceConfig.admin.homePath;
  }

  if (role === 'driver') {
    return audienceConfig.driver.homePath;
  }

  return audienceConfig.rider.homePath;
}

export function homeUrlForRole(role) {
  const audience = role === 'admin' || role === 'super_admin' ? 'admin' : role === 'driver' ? 'driver' : 'rider';
  const protocol = window.location.protocol;
  const hostname = currentHostname();
  const port = window.location.port ? `:${window.location.port}` : '';

  if (isLocalHost(hostname)) {
    return `${protocol}//${hostname}${port}${homePathForRole(audience)}`;
  }

  const domainRoot = rootHost(hostname);
  if (audience === 'rider') {
    return `${protocol}//${domainRoot}${port}/`;
  }

  return `${protocol}//${audience}.${domainRoot}${port}/`;
}

export function userMatchesPageContext(user) {
  if (!user) {
    return false;
  }

  return user.dashboardRole === pageContext.audience;
}

export function redirectToRoleHome(user) {
  window.location.replace(homeUrlForRole(user?.dashboardRole || user?.role));
}

export function applyPageContext() {
  document.documentElement.dataset.audience = pageContext.audience;
  document.title = pageContext.browserTitle;

  const brandCopy = document.querySelector('#authBrandCopy');
  const accessLabel = document.querySelector('#authAccessLabel');
  const accessTitle = document.querySelector('#authAccessTitle');
  const accessCopy = document.querySelector('#authAccessCopy');
  const loginRoleInput = document.querySelector('#loginRoleInput');
  const loginSubmitButton = document.querySelector('#loginSubmitButton');
  const authTabs = document.querySelector('#authTabs');

  if (brandCopy) {
    brandCopy.textContent = pageContext.brandCopy;
  }

  if (accessLabel) {
    accessLabel.textContent = pageContext.accessLabel;
  }

  if (accessTitle) {
    accessTitle.textContent = pageContext.accessTitle;
  }

  if (accessCopy) {
    accessCopy.textContent = pageContext.accessCopy;
  }

  if (loginRoleInput) {
    loginRoleInput.value = pageContext.audience;
  }

  if (loginSubmitButton) {
    loginSubmitButton.textContent = pageContext.loginButton;
  }

  if (authTabs) {
    authTabs.classList.toggle('hidden', pageContext.authTabs.length === 1);
  }

  document.querySelectorAll('[data-auth-view]').forEach((button) => {
    const isVisible = pageContext.authTabs.includes(button.dataset.authView);
    button.classList.toggle('hidden', !isVisible);
  });

  const defaultView = pageContext.authTabs[0];
  document.querySelectorAll('[data-auth-form]').forEach((form) => {
    const isVisible = pageContext.authTabs.includes(form.dataset.authForm);
    form.classList.toggle('hidden', !isVisible);
    form.classList.toggle('active', isVisible && form.dataset.authForm === defaultView);
  });

  document.querySelectorAll('[data-auth-view]').forEach((button) => {
    button.classList.toggle('active', !button.classList.contains('hidden') && button.dataset.authView === defaultView);
  });
}
