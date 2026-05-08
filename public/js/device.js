const mobileQuery = window.matchMedia('(max-width: 820px)');
const touchQuery = window.matchMedia('(pointer: coarse)');

function setDeviceClasses() {
  const isMobile = mobileQuery.matches || (touchQuery.matches && window.innerWidth <= 1024);
  const isTouch = touchQuery.matches;

  document.documentElement.classList.toggle('is-mobile', isMobile);
  document.documentElement.classList.toggle('is-touch', isTouch);
  document.documentElement.dataset.device = isMobile ? 'mobile' : 'desktop';
}

export function initDeviceMode() {
  setDeviceClasses();
  mobileQuery.addEventListener('change', setDeviceClasses);
  touchQuery.addEventListener('change', setDeviceClasses);
  window.addEventListener('resize', setDeviceClasses, { passive: true });
}
