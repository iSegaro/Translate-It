import { liveDubbingCoordinator } from './LiveDubbingCoordinator.js';
import * as browserCapabilities from '@/core/browserHandlers.js';
import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_OPENAI_PROVIDER_ID,
  LIVE_DUBBING_PROVIDER_ID,
} from '../constants.js';
import {
  LIVE_DUBBING_CREDENTIAL_REASONS,
  createLiveDubbingCredentialResult,
  createProviderBootstrapResponse,
  isAuthorizedOffscreenSender,
  isLiveDubbingProviderId,
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

export function handleLiveDubbingSetOriginalVolume(message, sender) {
  if (!isChromeRuntime()) return unsupported();
  if (message?.action && message.action !== LIVE_DUBBING_ACTIONS.SET_ORIGINAL_VOLUME) {
    return unauthorized();
  }
  if (!isTrustedUi(sender)) return unauthorized();
  return liveDubbingCoordinator.setOriginalVolume(message);
}

export function handleLiveDubbingGetOriginalVolume(message, sender) {
  if (!isChromeRuntime()) return unsupported();
  if (message?.action && message.action !== LIVE_DUBBING_ACTIONS.GET_ORIGINAL_VOLUME) {
    return unauthorized();
  }
  if (!isTrustedUi(sender)) return unauthorized();
  return liveDubbingCoordinator.getOriginalVolume(message);
}

export function handleLiveDubbingSetDubbedVolume(message, sender) {
  if (!isChromeRuntime()) return unsupported();
  if (message?.action && message.action !== LIVE_DUBBING_ACTIONS.SET_DUBBED_VOLUME) {
    return unauthorized();
  }
  if (!isTrustedUi(sender)) return unauthorized();
  return liveDubbingCoordinator.setDubbedVolume(message);
}

export function handleLiveDubbingGetDubbedVolume(message, sender) {
  if (!isChromeRuntime()) return unsupported();
  if (message?.action && message.action !== LIVE_DUBBING_ACTIONS.GET_DUBBED_VOLUME) {
    return unauthorized();
  }
  if (!isTrustedUi(sender)) return unauthorized();
  return liveDubbingCoordinator.getDubbedVolume(message);
}

export function handleLiveDubbingTranslatedTranscript(message, sender) {
  if (!isChromeRuntime()) return unsupported();
  if (!isAuthorizedOffscreenSender(sender, liveDubbingCoordinator.browserAPI)) return unauthorized();
  return liveDubbingCoordinator.handleOffscreenTranslatedTranscript(message, sender);
}

export function handleLiveDubbingOriginalTranscript(message, sender) {
  if (!isChromeRuntime()) return unsupported();
  if (!isAuthorizedOffscreenSender(sender, liveDubbingCoordinator.browserAPI)) return unauthorized();
  return liveDubbingCoordinator.handleOffscreenOriginalTranscript(message, sender);
}

/**
 * Validate one caller-supplied draft Live Dubbing credential without
 * touching any session state. Background-owned: the request carries only
 * `{ providerId, apiKey, targetLanguage }` from a trusted Live Dubbing UI
 * sender (Popup, Sidepanel, or Options). The handler never creates a
 * session/descriptor/lease, acquires capture, touches offscreen/WS/
 * streaming, reads or mutates stored keys, fails over, promotes, or saves
 * keys. The result is the sanitized `{ ok, valid, reason }` DTO only.
 */
export async function handleLiveDubbingValidateCredential(message, sender) {
  if (!isChromeRuntime()) return unsupported();
  if (!isTrustedUi(sender)) return unauthorized();

  const data = message?.data && typeof message.data === 'object' && !Array.isArray(message.data)
    ? message.data
    : {};
  if (!isLiveDubbingProviderId(data.providerId)) {
    return createLiveDubbingCredentialResult(
      false,
      LIVE_DUBBING_CREDENTIAL_REASONS.UNSUPPORTED_PROVIDER,
    );
  }

  try {
    if (data.providerId === LIVE_DUBBING_PROVIDER_ID) {
      const { geminiLiveBootstrapService } = await import('./GeminiLiveBootstrapService.js');
      return geminiLiveBootstrapService.validateCredential(data.apiKey, data.targetLanguage);
    }
    const { openAIRealtimeBootstrapService } = await import('./OpenAIRealtimeBootstrapService.js');
    return openAIRealtimeBootstrapService.validateCredential(data.apiKey, data.targetLanguage);
  } catch {
    return createLiveDubbingCredentialResult(
      false,
      LIVE_DUBBING_CREDENTIAL_REASONS.REQUEST_FAILED,
    );
  }
}

/**
 * Resolve the provider bootstrap request from the authorized offscreen
 * document. The descriptor selects the bootstrap service, while the
 * coordinator's pre-mint and post-mint fences retain session ownership.
 * Long-lived keys never leave background.
 */
export async function handleLiveDubbingBootstrapRequest(message, sender) {
  if (!isChromeRuntime()) return unsupported();

  const descriptor = await liveDubbingCoordinator.authorizeOffscreenControlMessage(
    message,
    sender,
    { type: 'bootstrap' },
  );
  if (!descriptor || !isLiveDubbingProviderId(descriptor.providerId)) return unauthorized();

  try {
    let bootstrap;
    if (descriptor.providerId === LIVE_DUBBING_PROVIDER_ID) {
      const { geminiLiveBootstrapService } = await import('./GeminiLiveBootstrapService.js');
      const accessToken = await geminiLiveBootstrapService.mintEphemeralToken(descriptor.targetLanguage);
      if (typeof accessToken === 'string' && accessToken) bootstrap = { accessToken };
    } else if (descriptor.providerId === LIVE_DUBBING_OPENAI_PROVIDER_ID) {
      const { openAIRealtimeBootstrapService } = await import('./OpenAIRealtimeBootstrapService.js');
      const secret = await openAIRealtimeBootstrapService.mintClientSecret(descriptor.targetLanguage);
      if (typeof secret === 'string' && secret) bootstrap = { secret };
    }

    if (!bootstrap) {
      return { success: false, error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE' };
    }

    if (!liveDubbingCoordinator.isBootstrapRequestStillAuthorized(descriptor)) {
      return unauthorized();
    }

    return createProviderBootstrapResponse(
      descriptor.providerId,
      descriptor.targetLanguage,
      bootstrap,
    );
  } catch {
    return { success: false, error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE' };
  }
}
