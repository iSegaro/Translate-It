import { liveDubbingCoordinator } from './LiveDubbingCoordinator.js';
import * as browserCapabilities from '@/core/browserHandlers.js';
import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_PROVIDER_ID,
} from '../constants.js';
import {
  createProviderBootstrapResponse,
  isTrustedLiveDubbingUiSender,
} from '../contracts.js';

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

function unauthorized() {
  return { success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' };
}

function isTrustedUi(sender) {
  return isTrustedLiveDubbingUiSender(sender, liveDubbingCoordinator.browserAPI);
}

export function handleLiveDubbingStart(message, sender) {
  if (!isChromeRuntime()) return unsupported();
  if (!isTrustedUi(sender)) return unauthorized();
  return liveDubbingCoordinator.start(message, sender);
}

export function handleLiveDubbingStop(message, sender) {
  if (!isChromeRuntime()) return unsupported();
  if (message?.action === LIVE_DUBBING_ACTIONS.TERMINAL) {
    if (!sender) return unauthorized();
    return liveDubbingCoordinator.handleOffscreenTerminal(message, sender);
  }
  if (!isTrustedUi(sender)) return unauthorized();
  return liveDubbingCoordinator.stop(message);
}

export function handleLiveDubbingGetStatus(message, sender) {
  if (!isChromeRuntime()) return unsupported();
  if (!isTrustedUi(sender)) return unauthorized();
  return liveDubbingCoordinator.getStatus();
}

/**
 * Resolve one Gemini Live provider bootstrap request from the authorized
 * offscreen document. Background mints a constrained single-use ephemeral
 * token; the response is intentionally limited to the opaque bootstrap,
 * provider, and language. Long-lived keys never leave background.
 */
export async function handleLiveDubbingBootstrapRequest(message, sender) {
  if (!isChromeRuntime()) return unsupported();

  const descriptor = await liveDubbingCoordinator.authorizeOffscreenControlMessage(
    message,
    sender,
    { type: 'bootstrap' },
  );
  if (!descriptor || descriptor.providerId !== LIVE_DUBBING_PROVIDER_ID) return unauthorized();

  try {
    const { geminiLiveBootstrapService } = await import('./GeminiLiveBootstrapService.js');
    const accessToken = await geminiLiveBootstrapService.mintEphemeralToken(descriptor.targetLanguage);
    if (typeof accessToken !== 'string' || !accessToken) {
      return { success: false, error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE' };
    }

    if (!liveDubbingCoordinator.isBootstrapRequestStillAuthorized(descriptor)) {
      return unauthorized();
    }

    return createProviderBootstrapResponse(
      descriptor.providerId,
      descriptor.targetLanguage,
      { accessToken },
    );
  } catch {
    return { success: false, error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE' };
  }
}
