import { liveDubbingCoordinator } from './LiveDubbingCoordinator.js';
import * as browserCapabilities from '@/core/browserHandlers.js';
import { LIVE_DUBBING_ACTIONS } from '../constants.js';

function isChromeRuntime() {
  if (typeof __BROWSER__ !== 'undefined') return __BROWSER__ === 'chrome';
  const detector = Object.prototype.hasOwnProperty.call(browserCapabilities, 'isChrome')
    ? browserCapabilities.isChrome
    : null;
  return typeof detector === 'function' ? detector() : true;
}

function unsupported() {
  return { success: false, error: 'LIVE_DUBBING_UNSUPPORTED' };
}

export function handleLiveDubbingStart(message, sender) {
  if (!isChromeRuntime()) return unsupported();
  return liveDubbingCoordinator.start(message, sender);
}

export function handleLiveDubbingStop(message) {
  if (!isChromeRuntime()) return unsupported();
  if (message?.action === LIVE_DUBBING_ACTIONS.TERMINAL) {
    return liveDubbingCoordinator.handleOffscreenTerminal(message);
  }
  return liveDubbingCoordinator.stop(message);
}

export function handleLiveDubbingGetStatus() {
  if (!isChromeRuntime()) return unsupported();
  return liveDubbingCoordinator.getStatus();
}
