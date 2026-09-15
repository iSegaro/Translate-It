/**
 * DEV-only Firefox WebExtension transport capability probe.
 *
 * The probe intentionally attempts to send real captured objects only after
 * the local YouTube capture probe has started. Every result crossing a page
 * boundary is rebuilt as scalar data; captured objects never enter a result,
 * log, or persistent store.
 */

export const FIREFOX_YOUTUBE_SPIKE_MESSAGE_TARGET = 'firefox-youtube-capture-stream-spike';
export const FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS = Object.freeze({
  SEND_MESSAGE: 'FIREFOX_YOUTUBE_CAPTURE_SPIKE_SEND_MESSAGE',
  PORT_TRANSFER: 'FIREFOX_YOUTUBE_CAPTURE_SPIKE_PORT_TRANSFER',
});
export const FIREFOX_YOUTUBE_SPIKE_PORT_NAME = 'firefox-youtube-capture-stream-spike';

export const FIREFOX_TRANSPORT_OUTCOMES = Object.freeze({
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  UNSUPPORTED: 'unsupported',
  UNTESTED: 'untested',
});

export const FIREFOX_TRANSPORT_ERROR_CATEGORIES = Object.freeze({
  ABORTED: 'ABORTED',
  API_UNAVAILABLE: 'API_UNAVAILABLE',
  CLONE_UNSUPPORTED: 'CLONE_UNSUPPORTED',
  DATA_CLONE_ERROR: 'DATA_CLONE_ERROR',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  INVALID_REPLY: 'INVALID_REPLY',
  NO_RECEIVER: 'NO_RECEIVER',
  PORT_CONNECT_ERROR: 'PORT_CONNECT_ERROR',
  PORT_DISCONNECTED: 'PORT_DISCONNECTED',
  PORT_POST_ERROR: 'PORT_POST_ERROR',
  PORT_TIMEOUT: 'PORT_TIMEOUT',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  TRANSPORT_ERROR: 'TRANSPORT_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  UNSUPPORTED_PAYLOAD: 'UNSUPPORTED_PAYLOAD',
});

const SOURCE_VALUES = new Set([
  'captured-stream',
  'original-audio-track',
  'cloned-audio-track',
]);
const TRANSPORT_VALUES = new Set(['send-message', 'port']);
const OUTCOME_VALUES = new Set(Object.values(FIREFOX_TRANSPORT_OUTCOMES));
const ERROR_VALUES = new Set(Object.values(FIREFOX_TRANSPORT_ERROR_CATEGORIES));
const RECEIVED_TYPES = new Set(['MediaStream', 'MediaStreamTrack', 'Object']);
const TRACK_STATES = new Set(['live', 'ended']);
const ANALYSER_STATES = new Set(['active', 'silent', 'unsupported', 'untested']);
const OWNERSHIP_STATES = new Set(['received', 'sender-retained', 'released', 'unknown', 'untested']);
const TRANSPORT_STATES = new Set(['IDLE', 'RUNNING', 'COMPLETE', 'STOPPED']);
const CLONE_STATES = new Set(['none', 'owned', 'released', 'unsupported']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function safeBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function safeSource(value) {
  return SOURCE_VALUES.has(value) ? value : null;
}

function safeTransport(value) {
  return TRANSPORT_VALUES.has(value) ? value : null;
}

function safeOutcome(value) {
  return OUTCOME_VALUES.has(value) ? value : FIREFOX_TRANSPORT_OUTCOMES.UNTESTED;
}

function safeError(value) {
  return ERROR_VALUES.has(value) ? value : null;
}

function safeReceivedType(value) {
  return RECEIVED_TYPES.has(value) ? value : null;
}

function safeReadyState(value) {
  return TRACK_STATES.has(value) ? value : null;
}

function safeAnalyser(value) {
  return ANALYSER_STATES.has(value) ? value : 'untested';
}

function safeOwnership(value) {
  return OWNERSHIP_STATES.has(value) ? value : 'unknown';
}

/** Rebuild one transfer result from a closed scalar shape. */
export function sanitizeFirefoxTransferResult(value, defaults = {}) {
  const input = isRecord(value) ? value : {};
  return {
    transport: safeTransport(input.transport) || safeTransport(defaults.transport),
    source: safeSource(input.source) || safeSource(defaults.source),
    outcome: safeOutcome(input.outcome),
    accepted: typeof input.accepted === 'boolean' ? input.accepted : null,
    receivedType: safeReceivedType(input.receivedType),
    kind: input.kind === 'audio' ? 'audio' : null,
    readyState: safeReadyState(input.readyState),
    muted: safeBoolean(input.muted),
    analyserActivity: safeAnalyser(input.analyserActivity),
    analyserPeak: safeFinite(input.analyserPeak),
    ended: safeBoolean(input.ended),
    ownership: safeOwnership(input.ownership),
    errorCategory: safeError(input.errorCategory),
  };
}

/** Rebuild the complete transport status without retaining transfer objects. */
export function sanitizeFirefoxTransportStatus(value) {
  const input = isRecord(value) ? value : {};
  return {
    success: input.success === true,
    state: TRANSPORT_STATES.has(input.state) ? input.state : 'IDLE',
    sourceAvailable: input.sourceAvailable === true,
    cloneState: CLONE_STATES.has(input.cloneState) ? input.cloneState : 'none',
    attempts: Array.isArray(input.attempts)
      ? input.attempts.map(attempt => sanitizeFirefoxTransferResult(attempt))
      : [],
  };
}

function emptyAttempt(transport, source, outcome, errorCategory = null) {
  return sanitizeFirefoxTransferResult({
    transport,
    source,
    outcome,
    accepted: outcome === FIREFOX_TRANSPORT_OUTCOMES.ACCEPTED ? true : null,
    analyserActivity: outcome === FIREFOX_TRANSPORT_OUTCOMES.UNTESTED ? 'untested' : 'unsupported',
    ownership: outcome === FIREFOX_TRANSPORT_OUTCOMES.UNTESTED ? 'untested' : 'unknown',
    errorCategory,
  }, { transport, source });
}

function classifyError(error, fallback = FIREFOX_TRANSPORT_ERROR_CATEGORIES.TRANSPORT_ERROR) {
  const name = typeof error?.name === 'string' ? error.name : '';
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (name === 'DataCloneError' || message.includes('clone')) {
    return FIREFOX_TRANSPORT_ERROR_CATEGORIES.DATA_CLONE_ERROR;
  }
  if (message.includes('receiving end') || message.includes('no listener')) {
    return FIREFOX_TRANSPORT_ERROR_CATEGORIES.NO_RECEIVER;
  }
  return fallback;
}

function isExpectedReply(value, source, transport) {
  return isRecord(value)
    && value.source === source
    && value.transport === transport
    && typeof value.accepted === 'boolean';
}

function normalizeReply(value, source, transport) {
  if (!isExpectedReply(value, source, transport)) {
    return emptyAttempt(transport, source, FIREFOX_TRANSPORT_OUTCOMES.REJECTED,
      FIREFOX_TRANSPORT_ERROR_CATEGORIES.INVALID_REPLY);
  }
  const result = sanitizeFirefoxTransferResult(value, { source, transport });
  if (result.accepted !== true) {
    return { ...result, outcome: FIREFOX_TRANSPORT_OUTCOMES.REJECTED };
  }
  const validType = source === 'captured-stream'
    ? result.receivedType === 'MediaStream'
    : result.receivedType === 'MediaStreamTrack' && result.kind === 'audio';
  if (!validType) {
    return emptyAttempt(transport, source, FIREFOX_TRANSPORT_OUTCOMES.REJECTED,
      FIREFOX_TRANSPORT_ERROR_CATEGORIES.INVALID_REPLY);
  }
  return { ...result, outcome: FIREFOX_TRANSPORT_OUTCOMES.ACCEPTED, accepted: true };
}

function createMessage(transport, source, payload) {
  return {
    target: FIREFOX_YOUTUBE_SPIKE_MESSAGE_TARGET,
    action: transport === 'send-message'
      ? FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS.SEND_MESSAGE
      : FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS.PORT_TRANSFER,
    data: { source, payload },
  };
}

function stopTrack(track) {
  try { track?.stop?.(); } catch { /* best effort */ }
}

/**
 * Attempt both WebExtension transport paths for one real captured source.
 * The browser may reject every attempt; rejection is a valid capability result.
 */
export class FirefoxWebExtensionTransportProbe {
  constructor({
    runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime || null,
    timeoutMs = 1500,
    setTimeoutImpl = globalThis.setTimeout,
    clearTimeoutImpl = globalThis.clearTimeout,
  } = {}) {
    this.runtime = runtime;
    this.timeoutMs = Number.isSafeInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : 1500;
    this.setTimeoutImpl = setTimeoutImpl;
    this.clearTimeoutImpl = clearTimeoutImpl;
    this.state = 'IDLE';
    this.sourceAvailable = false;
    this.cloneState = 'none';
    this.results = [];
    this.ownedClones = new Set();
    this.pendingCancellers = new Set();
    this.ports = new Set();
    this.runId = 0;
    this.startPromise = null;
  }

  async start({ captureProbe } = {}) {
    if (this.startPromise) return this.status();
    if (this.state === 'COMPLETE' || this.state === 'RUNNING') return this.status();
    this.state = 'RUNNING';
    this.results = [];
    this.sourceAvailable = false;
    this.cloneState = 'none';
    const runId = ++this.runId;
    const promise = this._run(captureProbe, runId);
    this.startPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.startPromise === promise) this.startPromise = null;
    }
  }

  async restart({ captureProbe } = {}) {
    await this.stop();
    return this.start({ captureProbe });
  }

  async stop() {
    this.runId += 1;
    for (const cancel of [...this.pendingCancellers]) cancel();
    for (const port of [...this.ports]) {
      try { port.disconnect?.(); } catch { /* best effort */ }
    }
    this.ports.clear();
    for (const clone of this.ownedClones) stopTrack(clone);
    this.ownedClones.clear();
    if (this.cloneState === 'owned') this.cloneState = 'released';
    this.state = 'STOPPED';
    return this.status();
  }

  status() {
    return {
      success: this.results.some(result => result.outcome === FIREFOX_TRANSPORT_OUTCOMES.ACCEPTED),
      state: TRANSPORT_STATES.has(this.state) ? this.state : 'IDLE',
      sourceAvailable: this.sourceAvailable,
      cloneState: CLONE_STATES.has(this.cloneState) ? this.cloneState : 'none',
      attempts: this.results.map(result => sanitizeFirefoxTransferResult(result)),
    };
  }

  async _run(captureProbe, runId) {
    const stream = captureProbe?.captureStream || null;
    const track = Array.isArray(captureProbe?.audioTracks)
      ? captureProbe.audioTracks.find(candidate => candidate?.kind === 'audio') || captureProbe.audioTracks[0]
      : null;
    this.sourceAvailable = Boolean(stream || track);
    if (!this.sourceAvailable) {
      this.results = ['captured-stream', 'original-audio-track', 'cloned-audio-track']
        .flatMap(source => ['send-message', 'port'].map(transport => emptyAttempt(
          transport,
          source,
          FIREFOX_TRANSPORT_OUTCOMES.UNTESTED,
          FIREFOX_TRANSPORT_ERROR_CATEGORIES.SOURCE_UNAVAILABLE,
        )));
      this.state = 'COMPLETE';
      return this.status();
    }

    const sources = [{ source: 'captured-stream', payload: stream }, { source: 'original-audio-track', payload: track }];
    if (track && typeof track.clone === 'function') {
      try {
        const clone = track.clone();
        if (clone) {
          this.ownedClones.add(clone);
          this.cloneState = 'owned';
          sources.push({ source: 'cloned-audio-track', payload: clone });
        } else {
          this.cloneState = 'unsupported';
          sources.push({
            source: 'cloned-audio-track',
            payload: null,
            unavailableError: FIREFOX_TRANSPORT_ERROR_CATEGORIES.CLONE_UNSUPPORTED,
          });
        }
      } catch {
        this.cloneState = 'unsupported';
        sources.push({
          source: 'cloned-audio-track',
          payload: null,
          unavailableError: FIREFOX_TRANSPORT_ERROR_CATEGORIES.CLONE_UNSUPPORTED,
        });
      }
    } else if (!track) {
      this.cloneState = 'unsupported';
      sources.push({
        source: 'cloned-audio-track',
        payload: null,
        unavailableError: FIREFOX_TRANSPORT_ERROR_CATEGORIES.SOURCE_UNAVAILABLE,
      });
    } else {
      this.cloneState = 'unsupported';
      sources.push({
        source: 'cloned-audio-track',
        payload: null,
        unavailableError: FIREFOX_TRANSPORT_ERROR_CATEGORIES.CLONE_UNSUPPORTED,
      });
    }

    if (!stream) {
      sources[0].payload = null;
    }
    if (!track) {
      sources[1].payload = null;
    }

    for (const { source, payload, unavailableError } of sources) {
      if (runId !== this.runId) return this.status();
      for (const transport of ['send-message', 'port']) {
        if (runId !== this.runId) return this.status();
        if (!payload) {
          const outcome = unavailableError === FIREFOX_TRANSPORT_ERROR_CATEGORIES.CLONE_UNSUPPORTED
            ? FIREFOX_TRANSPORT_OUTCOMES.UNSUPPORTED
            : FIREFOX_TRANSPORT_OUTCOMES.UNTESTED;
          this.results.push(emptyAttempt(transport, source, outcome,
            unavailableError || FIREFOX_TRANSPORT_ERROR_CATEGORIES.SOURCE_UNAVAILABLE));
          continue;
        }
        const result = transport === 'send-message'
          ? await this._sendMessage(source, payload)
          : await this._sendPort(source, payload);
        this.results.push(result);
      }
    }
    if (runId === this.runId) this.state = 'COMPLETE';
    return this.status();
  }

  async _sendMessage(source, payload) {
    const transport = 'send-message';
    if (typeof this.runtime?.sendMessage !== 'function') {
      return emptyAttempt(transport, source, FIREFOX_TRANSPORT_OUTCOMES.UNSUPPORTED,
        FIREFOX_TRANSPORT_ERROR_CATEGORIES.API_UNAVAILABLE);
    }
    try {
      const reply = await this.runtime.sendMessage(createMessage(transport, source, payload));
      return normalizeReply(reply, source, transport);
    } catch (error) {
      return emptyAttempt(transport, source, FIREFOX_TRANSPORT_OUTCOMES.REJECTED, classifyError(error));
    }
  }

  _sendPort(source, payload) {
    const transport = 'port';
    if (typeof this.runtime?.connect !== 'function') {
      return Promise.resolve(emptyAttempt(transport, source, FIREFOX_TRANSPORT_OUTCOMES.UNSUPPORTED,
        FIREFOX_TRANSPORT_ERROR_CATEGORIES.API_UNAVAILABLE));
    }

    return new Promise(resolve => {
      let port = null;
      let timer = null;
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        if (timer !== null) this.clearTimeoutImpl?.(timer);
        this.pendingCancellers.delete(cancel);
        this.ports.delete(port);
        try { port?.onMessage?.removeListener?.(onMessage); } catch { /* best effort */ }
        try { port?.onDisconnect?.removeListener?.(onDisconnect); } catch { /* best effort */ }
        try { port?.disconnect?.(); } catch { /* best effort */ }
        resolve(result);
      };
      const cancel = () => finish(emptyAttempt(transport, source, FIREFOX_TRANSPORT_OUTCOMES.REJECTED,
        FIREFOX_TRANSPORT_ERROR_CATEGORIES.ABORTED));
      const onMessage = reply => finish(normalizeReply(reply, source, transport));
      const onDisconnect = () => finish(emptyAttempt(transport, source, FIREFOX_TRANSPORT_OUTCOMES.REJECTED,
        FIREFOX_TRANSPORT_ERROR_CATEGORIES.PORT_DISCONNECTED));
      this.pendingCancellers.add(cancel);

      try {
        port = this.runtime.connect({ name: FIREFOX_YOUTUBE_SPIKE_PORT_NAME });
        if (!port) {
          finish(emptyAttempt(transport, source, FIREFOX_TRANSPORT_OUTCOMES.REJECTED,
            FIREFOX_TRANSPORT_ERROR_CATEGORIES.PORT_CONNECT_ERROR));
          return;
        }
        this.ports.add(port);
        port.onMessage?.addListener?.(onMessage);
        port.onDisconnect?.addListener?.(onDisconnect);
        timer = this.setTimeoutImpl?.(() => finish(emptyAttempt(transport, source,
          FIREFOX_TRANSPORT_OUTCOMES.REJECTED, FIREFOX_TRANSPORT_ERROR_CATEGORIES.PORT_TIMEOUT)), this.timeoutMs);
        port.postMessage(createMessage(transport, source, payload));
      } catch (error) {
        finish(emptyAttempt(transport, source, FIREFOX_TRANSPORT_OUTCOMES.REJECTED,
          classifyError(error, FIREFOX_TRANSPORT_ERROR_CATEGORIES.PORT_POST_ERROR)));
      }
    });
  }
}
