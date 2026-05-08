import { boot, handleBootError, initAuth } from './js/auth.js';
import { initDeviceMode } from './js/device.js';
import { applyPageContext } from './js/site.js';

initDeviceMode();
applyPageContext();
initAuth();
boot().catch(handleBootError);
