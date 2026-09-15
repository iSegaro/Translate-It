/**
 * DEV-only Firefox extension-document transfer probe.
 *
 * Only a sender-owned clone of the captured audio track enters the explicit
 * postMessage transfer list. The extension iframe returns a nonce-bound
 * scalar DTO and is removed after every attempt. There is intentionally no
 * page-facing method for this probe; spikeDevProbe composes it behind the
 * existing four-method bridge.
 */

export const FIREFOX_SPIKE_IFRAME_RESOURCE = 'spikeDevIframe.html';
export const FIREFOX_SPIKE_IFRAME_ACTION = 'FIREFOX_YOUTUBE_CAPTURE_SPIKE_IFRAME_TRANSFER';

const IFRAME_STATES = new Set(['IDLE', 'RUNNING', 'COMPLETE', 'STOPPED', 'UNSUPPORTED']);
const ERROR_CATEGORIES = new Set([
  'ABORTED',
  'CLONE_UNSUPPORTED',
  'DOM_UNAVAILABLE',
  'EXTENSION_URL_UNAVAILABLE',
  'IFRAME_LOAD_FAILED',
  'IFRAME_TIMEOUT',
  'INVALID_REPLY',
  'MEDIA_STREAM_UNAVAILABLE',
  'NONCE_UNAVAILABLE',
  'PUBLISH_FAILED',
  'SOURCE_UNAVAILABLE',
  'TRANSPORT_ACCEPTED',
  'TRANSFER_FAILED',
  'UNSUPPORTED_PAYLOAD',
]);
const RECEIVER_TYPES = new Set(['MediaStream', 'Object']);
const TRACK_STATES = new Set(['live', 'ended']);
const ANALYSER_STATES = new Set(['active', 'silent', 'unsupported', 'untested']);
const OWNERSHIP_STATES = new Set(['untested', 'sender-owned', 'transferred', 'sender-released']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function safeFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function safeState(value) {
  return IFRAME_STATES.has(value) ? value : 'IDLE';
}

function safeError(value) {
  return ERROR_CATEGORIES.has(value) ? value : null;
}

function safeType(value) {
  return RECEIVER_TYPES.has(value) ? value : null;
}

function safeTrackState(value) {
  return TRACK_STATES.has(value) ? value : null;
}

function safeAnalyser(value) {
  return ANALYSER_STATES.has(value) ? value : 'untested';
}

function safeOwnership(value) {
  return OWNERSHIP_STATES.has(value) ? value : 'untested';
}

export function sanitizeFirefoxIframeTransferStatus(value) {
  const input = isRecord(value) ? value : {};
  return {
    state: safeState(input.state),
    supported: typeof input.supported === 'boolean' ? input.supported : null,
    accepted: typeof input.accepted === 'boolean' ? input.accepted : null,
    receiverType: safeType(input.receiverType),
    receiverKind: input.receiverKind === 'audio' ? 'audio' : null,
    receiverReadyState: safeTrackState(input.receiverReadyState),
    receiverMuted: safeBoolean(input.receiverMuted),
    receiverAnalyserActivity: safeAnalyser(input.receiverAnalyserActivity),
    receiverAnalyserPeak: safeFinite(input.receiverAnalyserPeak),
    senderCloneOwnership: safeOwnership(input.senderCloneOwnership),
    senderCloneReadyState: safeTrackState(input.senderCloneReadyState),
    senderCloneMuted: safeBoolean(input.senderCloneMuted),
    senderCloneEnded: safeBoolean(input.senderCloneEnded),
    errorCategory: safeError(input.errorCategory),
  };
}

function emptyStatus(state = 'IDLE', errorCategory = null) {
  return sanitizeFirefoxIframeTransferStatus({
    state,
    supported: state === 'UNSUPPORTED' ? false : null,
    accepted: null,
    senderCloneOwnership: 'untested',
    receiverAnalyserActivity: 'untested',
    errorCategory,
  });
}

function createNonce(cryptoRef) {
  try {
    if (typeof cryptoRef?.randomUUID === 'function') return cryptoRef.randomUUID();
    if (typeof cryptoRef?.getRandomValues === 'function') {
      const bytes = new Uint8Array(24);
      cryptoRef.getRandomValues(bytes);
      return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    return null;
  }
  return null;
}

function trackFacts(track) {
  const readyState = safeTrackState(track?.readyState);
  return {
    readyState,
    muted: safeBoolean(track?.muted),
    ended: readyState === null ? null : readyState === 'ended',
  };
}

function stopTrack(track) {
  try { track?.stop?.(); } catch { /* best effort */ }
}

function removeIframe(iframe) {
  try {
    if (typeof iframe?.remove === 'function') iframe.remove();
    else iframe?.parentNode?.removeChild?.(iframe);
  } catch { /* best effort */ }
}

function iframeUrlWithNonce(extensionUrl, nonce) {
  try {
    const url = new URL(extensionUrl);
    url.hash = encodeURIComponent(nonce);
    return url.toString();
  } catch {
    return `${extensionUrl}#${encodeURIComponent(nonce)}`;
  }
}

function scalarReply(value, nonce, extensionOrigin) {
  if (!isRecord(value)
    || value.action !== FIREFOX_SPIKE_IFRAME_ACTION
    || value.nonce !== nonce
    || value.origin !== extensionOrigin
    || typeof value.supported !== 'boolean'
    || typeof value.accepted !== 'boolean') return null;
  return sanitizeFirefoxIframeTransferStatus(value);
}

function makeUnsupported(errorCategory) {
  return emptyStatus('UNSUPPORTED', errorCategory);
}

/**
 * Parent/content-side extension iframe transfer attempt. This does not fall
 * back to a page iframe: a missing extension resource is an explicit result.
 */
export class FirefoxExtensionIframeTransferProbe {
  constructor({
    documentRef = globalThis.document,
    windowRef = globalThis,
    runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime || null,
    cryptoRef = globalThis.crypto,
    timeoutMs = 2000,
    setTimeoutImpl = globalThis.setTimeout,
    clearTimeoutImpl = globalThis.clearTimeout,
    nonceFactory,
  } = {}) {
    this.documentRef = documentRef;
    this.windowRef = windowRef;
    this.runtime = runtime;
    this.cryptoRef = cryptoRef;
    this.timeoutMs = Number.isSafeInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : 2000;
    this.setTimeoutImpl = setTimeoutImpl;
    this.clearTimeoutImpl = clearTimeoutImpl;
    this.nonceFactory = nonceFactory || (() => createNonce(this.cryptoRef));
    this.state = 'IDLE';
    this.result = emptyStatus();
    this.startPromise = null;
    this.cancelCurrent = null;
    this.runId = 0;
  }

  async start({ captureProbe, transportStatus } = {}) {
    if (this.startPromise) return this.status();
    if (this.state === 'COMPLETE' || this.state === 'RUNNING') return this.status();
    if (transportStatus?.success === true) {
      this.result = emptyStatus('IDLE', 'TRANSPORT_ACCEPTED');
      return this.status();
    }
    const runId = ++this.runId;
    this.state = 'RUNNING';
    const promise = this._run(captureProbe, runId);
    this.startPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.startPromise === promise) this.startPromise = null;
    }
  }

  async restart(options = {}) {
    await this.stop();
    return this.start(options);
  }

  async stop() {
    ++this.runId;
    this.cancelCurrent?.();
    if (this.startPromise) await this.startPromise;
    this.cancelCurrent = null;
    this.state = 'STOPPED';
    this.result = sanitizeFirefoxIframeTransferStatus({ ...this.result, state: 'STOPPED' });
    return this.status();
  }

  status() {
    return sanitizeFirefoxIframeTransferStatus(this.result);
  }

  async _run(captureProbe, runId) {
    const track = Array.isArray(captureProbe?.audioTracks)
      ? captureProbe.audioTracks.find(candidate => candidate?.kind === 'audio') || captureProbe.audioTracks[0]
      : null;
    if (!track) return this._complete(runId, emptyStatus('IDLE', 'SOURCE_UNAVAILABLE'));
    if (typeof track.clone !== 'function') return this._complete(runId, makeUnsupported('CLONE_UNSUPPORTED'));

    let clone;
    try { clone = track.clone(); } catch { clone = null; }
    if (!clone) return this._complete(runId, makeUnsupported('CLONE_UNSUPPORTED'));
    const releaseClone = result => {
      stopTrack(clone);
      const facts = trackFacts(clone);
      return this._complete(runId, {
        ...result,
        senderCloneOwnership: 'sender-released',
        senderCloneReadyState: facts.readyState,
        senderCloneMuted: facts.muted,
        senderCloneEnded: facts.ended,
      });
    };

    const extensionUrl = this._getExtensionUrl();
    if (!extensionUrl) {
      return releaseClone(makeUnsupported('EXTENSION_URL_UNAVAILABLE'));
    }
    let nonce;
    try { nonce = this.nonceFactory(); } catch { nonce = null; }
    if (typeof nonce !== 'string' || nonce.length < 16) {
      return releaseClone(makeUnsupported('NONCE_UNAVAILABLE'));
    }
    if (!this.documentRef || typeof this.documentRef.createElement !== 'function'
      || typeof this.windowRef?.addEventListener !== 'function') {
      return releaseClone(makeUnsupported('DOM_UNAVAILABLE'));
    }

    const result = await this._runAttempt({ clone, extensionUrl, nonce });
    return this._complete(runId, result);
  }

  _complete(runId, result) {
    const sanitized = sanitizeFirefoxIframeTransferStatus(result);
    this.result = sanitized;
    if (runId === this.runId && this.state === 'RUNNING') this.state = 'COMPLETE';
    return this.status();
  }

  _getExtensionUrl() {
    if (typeof this.runtime?.getURL !== 'function') return null;
    try {
      const url = this.runtime.getURL(FIREFOX_SPIKE_IFRAME_RESOURCE);
      return typeof url === 'string' && url.length > 0 ? url : null;
    } catch {
      return null;
    }
  }

  _runAttempt({ clone, extensionUrl, nonce }) {
    let extensionOrigin;
    try {
      const parsed = new URL(extensionUrl);
      extensionOrigin = parsed.origin === 'null'
        && (parsed.protocol === 'moz-extension:' || parsed.protocol === 'chrome-extension:')
        ? `${parsed.protocol}//${parsed.host}`
        : parsed.origin;
    } catch {
      extensionOrigin = null;
    }
    if (!extensionOrigin || extensionOrigin === 'null') {
      stopTrack(clone);
      const facts = trackFacts(clone);
      return Promise.resolve(sanitizeFirefoxIframeTransferStatus({
        ...makeUnsupported('EXTENSION_URL_UNAVAILABLE'),
        senderCloneOwnership: 'sender-released',
        senderCloneReadyState: facts.readyState,
        senderCloneMuted: facts.muted,
        senderCloneEnded: facts.ended,
      }));
    }

    return new Promise(resolve => {
      let iframe = null;
      let timer = null;
      let settled = false;
      let transferred = false;
      const originalFacts = trackFacts(clone);
      const cleanup = () => {
        if (timer !== null) this.clearTimeoutImpl?.(timer);
        this.windowRef.removeEventListener('message', onMessage);
        removeIframe(iframe);
        stopTrack(clone);
      };
      const finish = value => {
        if (settled) return;
        settled = true;
        if (this.cancelCurrent === cancel) this.cancelCurrent = null;
        cleanup();
        const afterFacts = trackFacts(clone);
        resolve(sanitizeFirefoxIframeTransferStatus({
          ...value,
          senderCloneOwnership: transferred ? 'transferred' : 'sender-released',
          senderCloneReadyState: afterFacts.readyState || originalFacts.readyState,
          senderCloneMuted: afterFacts.muted ?? originalFacts.muted,
          senderCloneEnded: afterFacts.ended ?? originalFacts.ended,
        }));
      };
      const cancel = () => finish({
        state: 'STOPPED',
        supported: null,
        accepted: false,
        errorCategory: 'ABORTED',
      });
      const onMessage = event => {
        if (event?.source !== iframe?.contentWindow || event.origin !== extensionOrigin) return;
        const reply = scalarReply(event.data, nonce, extensionOrigin);
        if (!reply) return;
        finish({ ...reply, state: 'COMPLETE' });
      };
      const onLoad = () => {
        try {
          if (!iframe?.contentWindow) {
            finish({ state: 'COMPLETE', supported: false, accepted: false, errorCategory: 'IFRAME_LOAD_FAILED' });
            return;
          }
          transferred = true;
          iframe.contentWindow.postMessage({
            action: FIREFOX_SPIKE_IFRAME_ACTION,
            nonce,
            origin: extensionOrigin,
            track: clone,
          }, extensionOrigin, [clone]);
        } catch {
          transferred = false;
          finish({ state: 'COMPLETE', supported: true, accepted: false, errorCategory: 'TRANSFER_FAILED' });
        }
      };
      const onError = () => finish({
        state: 'COMPLETE',
        supported: false,
        accepted: false,
        errorCategory: 'IFRAME_LOAD_FAILED',
      });
      this.cancelCurrent = cancel;
      this.windowRef.addEventListener('message', onMessage);
      try {
        iframe = this.documentRef.createElement('iframe');
        iframe.src = iframeUrlWithNonce(extensionUrl, nonce);
        iframe.hidden = true;
        iframe.setAttribute?.('aria-hidden', 'true');
        iframe.onload = onLoad;
        iframe.onerror = onError;
        const parent = this.documentRef.body || this.documentRef.documentElement;
        if (!parent?.appendChild) {
          finish({ state: 'COMPLETE', supported: false, accepted: false, errorCategory: 'DOM_UNAVAILABLE' });
          return;
        }
        parent.appendChild(iframe);
        timer = this.setTimeoutImpl?.(() => finish({
          state: 'COMPLETE',
          supported: false,
          accepted: false,
          errorCategory: 'IFRAME_TIMEOUT',
        }), this.timeoutMs);
      } catch {
        finish({ state: 'COMPLETE', supported: false, accepted: false, errorCategory: 'IFRAME_LOAD_FAILED' });
      }
    });
  }
}
