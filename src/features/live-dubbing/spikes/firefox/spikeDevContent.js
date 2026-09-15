/**
 * DEV-only Firefox Desktop YouTube captureStream hook.
 *
 * This hook is intentionally local to the DEV content/page context. Its
 * capability messages are spike-local only; it has no provider, credential,
 * production Coordinator, or production manifest integration.
 */

import {
  FIREFOX_CAPTURE_PROBE_STATUS,
  FIREFOX_CAPTURE_PROBE_REASONS,
} from './YouTubeCaptureStreamProbe.js';
import { FirefoxDevSpikeProbe } from './spikeDevProbe.js';
import { sanitizeFirefoxTransportStatus } from './spikeDevTransport.js';
import { sanitizeFirefoxRuntimeCapabilities } from './spikeDevRuntimeCapabilities.js';
import { sanitizeFirefoxIframeTransferStatus } from './spikeDevIframeTransfer.js';

export const FIREFOX_YOUTUBE_SPIKE_HOOK = '__translateItFirefoxYouTubeCaptureStreamSpike';
export const FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS = '__translateItFirefoxYouTubeCaptureStreamSpikeInstallStatus';

export const FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES = Object.freeze({
  INSTALLED: 'installed',
  BRIDGE_UNAVAILABLE: 'bridge-unavailable',
  CLONE_FAILED: 'clone-failed',
  PUBLISH_FAILED: 'publish-failed',
});

const INSTALL_STATE_VALUES = new Set(Object.values(FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES));

const STATUS_FIELDS = Object.freeze([
  'success',
  'state',
  'reason',
  'mediaType',
  'captureMethod',
  'trackCount',
  'audioTracks',
  'rms',
  'peak',
  'transport',
  'iframeTransfer',
  'runtimeCapabilities',
]);
const MEDIA_TYPES = new Set(['video', 'audio']);
const CAPTURE_METHODS = new Set(['captureStream', 'mozCaptureStream']);
const TRACK_STATES = new Set(['live', 'ended']);
const HOOK_STATUS_FALLBACK = Object.freeze({
  success: false,
  state: FIREFOX_CAPTURE_PROBE_STATUS.CAPTURE_ERROR,
  reason: 'BRIDGE_ERROR',
  mediaType: null,
  captureMethod: null,
  trackCount: 0,
  audioTracks: [],
  rms: null,
  peak: null,
});

function isDevelopmentBuild() {
  return typeof __IS_DEVELOPMENT__ !== 'undefined' && __IS_DEVELOPMENT__ === true;
}

function isYouTubePage(target) {
  const location = target?.location || target?.window?.location;
  const hostname = location?.hostname;
  return typeof hostname === 'string'
    && (hostname === 'youtube.com' || hostname.endsWith('.youtube.com'));
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeLevel(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function sanitizeStatus(value) {
  if (!isRecord(value)) return { ...HOOK_STATUS_FALLBACK };
  const audioTracks = Array.isArray(value.audioTracks)
    ? value.audioTracks.map(track => ({
      readyState: TRACK_STATES.has(track?.readyState) ? track.readyState : null,
      muted: track?.muted === true,
    }))
    : [];
  const status = {
    success: value.success === true,
    state: Object.values(FIREFOX_CAPTURE_PROBE_STATUS).includes(value.state)
      ? value.state
      : FIREFOX_CAPTURE_PROBE_STATUS.CAPTURE_ERROR,
    reason: FIREFOX_CAPTURE_PROBE_REASONS.has(value.reason) ? value.reason : null,
    mediaType: MEDIA_TYPES.has(value.mediaType) ? value.mediaType : null,
    captureMethod: CAPTURE_METHODS.has(value.captureMethod) ? value.captureMethod : null,
    trackCount: Number.isSafeInteger(value.trackCount) && value.trackCount >= 0
      ? value.trackCount
      : audioTracks.length,
    audioTracks,
    rms: safeLevel(value.rms),
    peak: safeLevel(value.peak),
  };
  status.transport = sanitizeFirefoxTransportStatus(value.transport);
  status.iframeTransfer = sanitizeFirefoxIframeTransferStatus(value.iframeTransfer);
  status.runtimeCapabilities = sanitizeFirefoxRuntimeCapabilities(value.runtimeCapabilities);
  return Object.fromEntries(STATUS_FIELDS.map(field => [field, status[field]]));
}

function cloneStatusIntoPage(value, targetWindow, cloneIntoApi) {
  return cloneIntoApi(sanitizeStatus(value), targetWindow);
}

function pagePromise(operation, XrayWindow, cloneIntoApi) {
  if (typeof XrayWindow?.Promise !== 'function') return null;
  return new XrayWindow.Promise((resolve) => {
    let result;
    const settle = value => {
      try {
        resolve(cloneStatusIntoPage(value, XrayWindow, cloneIntoApi));
      } catch {
        resolve(cloneStatusIntoPage(HOOK_STATUS_FALLBACK, XrayWindow, cloneIntoApi));
      }
    };
    try {
      result = operation();
    } catch {
      settle(HOOK_STATUS_FALLBACK);
      return;
    }
    XrayWindow.Promise.resolve(result).then(
      settle,
      () => settle(HOOK_STATUS_FALLBACK),
    );
  });
}

function getXrayWindow(target) {
  return target?.window || target;
}

function getWrappedPageWindow(XrayWindow) {
  try {
    return XrayWindow?.wrappedJSObject || null;
  } catch {
    return null;
  }
}

function getPageWorldApi(target, options = {}) {
  const XrayWindow = getXrayWindow(target);
  const pageWindow = getWrappedPageWindow(XrayWindow);
  const cloneIntoApi = options.cloneIntoApi
    || XrayWindow?.cloneInto
    || globalThis.cloneInto;
  if (!XrayWindow || !pageWindow || typeof cloneIntoApi !== 'function'
    || typeof XrayWindow.Promise !== 'function') return null;
  return { XrayWindow, cloneInto: cloneIntoApi };
}

function setPageInstallState(XrayWindow, state) {
  if (!INSTALL_STATE_VALUES.has(state) || !XrayWindow) return false;
  try {
    XrayWindow.wrappedJSObject[FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS] = state;
    return XrayWindow.wrappedJSObject[FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS] === state;
  } catch {
    return false;
  }
}

function createAndPublishPageHook(pageWorld, probe) {
  const { XrayWindow, cloneInto } = pageWorld;
  const api = {
    start() {
      return pagePromise(() => probe.start(), XrayWindow, cloneInto);
    },
    status() {
      try {
        return cloneStatusIntoPage(probe.status(), XrayWindow, cloneInto);
      } catch {
        return cloneStatusIntoPage(HOOK_STATUS_FALLBACK, XrayWindow, cloneInto);
      }
    },
    restart() {
      return pagePromise(() => probe.restart(), XrayWindow, cloneInto);
    },
    stop() {
      return pagePromise(() => probe.stop(), XrayWindow, cloneInto);
    },
  };
  Object.freeze(api);

  let clonedApi;
  try {
    // Mozilla's bridge target is the content Xray window. Only the resulting
    // safe clone is assigned to the unwrapped page global below.
    clonedApi = cloneInto(api, XrayWindow, { cloneFunctions: true });
  } catch {
    return { failure: FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES.CLONE_FAILED };
  }

  if (!clonedApi || typeof clonedApi !== 'object') {
    return { failure: FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES.CLONE_FAILED };
  }

  try {
    XrayWindow.wrappedJSObject.__translateItFirefoxYouTubeCaptureStreamSpike = clonedApi;
    const publishedApi = XrayWindow.wrappedJSObject[FIREFOX_YOUTUBE_SPIKE_HOOK];
    return publishedApi === clonedApi
      ? { hook: publishedApi }
      : { failure: FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES.PUBLISH_FAILED };
  } catch {
    return { failure: FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES.PUBLISH_FAILED };
  }
}

/**
 * Install the local DEV hook in the Firefox page world. An injected probe is
 * supported only for unit tests; production callers use the private probe.
 */
export function installFirefoxYouTubeCaptureStreamSpikeHook({
  probe,
  isDevelopment = isDevelopmentBuild(),
  target = globalThis,
  cloneIntoApi,
} = {}) {
  if (!isDevelopment || !isYouTubePage(target)) return undefined;
  const pageWorld = getPageWorldApi(target, {
    cloneIntoApi,
  });
  if (!pageWorld) {
    setPageInstallState(getXrayWindow(target), FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES.BRIDGE_UNAVAILABLE);
    return undefined;
  }
  const { XrayWindow } = pageWorld;
  try {
    const existingHook = XrayWindow.wrappedJSObject[FIREFOX_YOUTUBE_SPIKE_HOOK];
    if (existingHook) {
      setPageInstallState(XrayWindow, FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES.INSTALLED);
      return existingHook;
    }
  } catch {
    setPageInstallState(XrayWindow, FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES.PUBLISH_FAILED);
    return undefined;
  }
  const localProbe = probe || new FirefoxDevSpikeProbe({
    documentRef: globalThis.document,
    windowRef: XrayWindow,
    runtime: globalThis.browser?.runtime || globalThis.chrome?.runtime,
  });
  const result = createAndPublishPageHook(pageWorld, localProbe);
  if (result.hook) {
    setPageInstallState(XrayWindow, FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES.INSTALLED);
    return result.hook;
  }
  setPageInstallState(XrayWindow, result.failure);
  return undefined;
}
