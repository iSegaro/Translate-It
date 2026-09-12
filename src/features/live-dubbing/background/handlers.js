import { liveDubbingCoordinator } from './LiveDubbingCoordinator.js';
import * as browserCapabilities from '@/core/browserHandlers.js';
import {
  LIVE_DUBBING_ACTIONS,
} from '../constants.js';
import {
  createProviderCredentialResponse,
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

export function handleLiveDubbingGetMeasurements(message, sender) {
  if (!isChromeRuntime()) return unsupported();
  if (!isTrustedUi(sender)) return unauthorized();
  return liveDubbingCoordinator.getMeasurements();
}

export function handleLiveDubbingClearMeasurements(message, sender) {
  if (!isChromeRuntime()) return unsupported();
  if (!isTrustedUi(sender)) return unauthorized();
  return liveDubbingCoordinator.clearMeasurements();
}

/**
 * Resolve one Gemini Live credential request from the authorized offscreen
 * document. The response is intentionally limited to the key and language.
 */
export async function handleLiveDubbingCredentialRequest(message, sender) {
  if (!isChromeRuntime()) return unsupported();

  const descriptor = await liveDubbingCoordinator.authorizeOffscreenControlMessage(
    message,
    sender,
    { type: 'credential' },
  );
  if (!descriptor) return unauthorized();

  try {
    const { ApiKeyManager } = await import('@/features/translation/providers/ApiKeyManager.js');
    const { getApiKeyAsync } = await import('@/shared/config/config.js');
    const apiKey = await ApiKeyManager.getPrimaryKey('GEMINI_API_KEY') || await getApiKeyAsync();
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      return { success: false, error: 'LIVE_DUBBING_PROVIDER_CREDENTIAL_UNAVAILABLE' };
    }

    if (!liveDubbingCoordinator.isCredentialRequestStillAuthorized(descriptor)) {
      return unauthorized();
    }

    return createProviderCredentialResponse(apiKey, descriptor.targetLanguage);
  } catch {
    return { success: false, error: 'LIVE_DUBBING_PROVIDER_CREDENTIAL_UNAVAILABLE' };
  }
}
