/**
 * DEV-only content-script runtime capability checks for the Firefox spike.
 *
 * No provider, network request, SDP, WebSocket connection, or audio payload
 * leaves this module. Results are scalar-only and intentionally say when a
 * capability was not tested.
 */

export const FIREFOX_RUNTIME_CAPABILITY_RESULTS = Object.freeze({
  UNTESTED: 'untested',
  SUPPORTED: 'supported',
  UNSUPPORTED: 'unsupported',
  FAILED: 'failed',
  STOPPED: 'stopped',
});

const RESULT_VALUES = new Set(Object.values(FIREFOX_RUNTIME_CAPABILITY_RESULTS));
const AUDIO_GRAPH_STATES = new Set(['active', 'inactive', 'untested', 'unsupported']);

function safeResult(value) {
  return RESULT_VALUES.has(value) ? value : FIREFOX_RUNTIME_CAPABILITY_RESULTS.UNTESTED;
}

function safeBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function safeAudioGraph(value) {
  const input = value && typeof value === 'object' ? value : {};
  const state = AUDIO_GRAPH_STATES.has(input.state) ? input.state : 'untested';
  return {
    state,
    supported: typeof input.supported === 'boolean' ? input.supported : false,
    connected: safeBoolean(input.connected),
  };
}

function safeCapability(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    result: safeResult(input.result),
    supported: safeBoolean(input.supported),
    constructed: safeBoolean(input.constructed),
    closed: safeBoolean(input.closed),
    network: input.network === false ? false : null,
  };
}

/** Rebuild runtime capability status from only known scalar values. */
export function sanitizeFirefoxRuntimeCapabilities(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    audioGraph: safeAudioGraph(input.audioGraph),
    webSocket: safeCapability(input.webSocket),
    rtcPeerConnection: safeCapability(input.rtcPeerConnection),
    fetch: safeCapability(input.fetch),
  };
}

function getConstructor(windowRef, name) {
  if (windowRef && Object.prototype.hasOwnProperty.call(windowRef, name)) return windowRef[name];
  return globalThis[name] || null;
}

function probeAudioGraph(captureProbe) {
  const context = captureProbe?.audioContext;
  const source = captureProbe?.sourceNode;
  const analyser = captureProbe?.analyserNode;
  if (!context && !source && !analyser) {
    return { state: 'untested', supported: false, connected: null };
  }
  const supported = Boolean(context && source && analyser);
  return {
    state: supported ? 'active' : 'unsupported',
    supported,
    connected: Boolean(source?.connect && analyser),
  };
}

function probeWebSocket(windowRef) {
  const Constructor = getConstructor(windowRef, 'WebSocket');
  if (typeof Constructor !== 'function') {
    return { result: 'unsupported', supported: false, constructed: false, closed: null, network: false };
  }
  // A no-argument construction fails before a URL exists, so it does not open
  // a socket or perform a network connection while proving the constructor is callable.
  try {
    Reflect.construct(Constructor, []);
    return { result: 'failed', supported: true, constructed: true, closed: true, network: false };
  } catch {
    return { result: 'supported', supported: true, constructed: false, closed: null, network: false };
  }
}

function probeRtcPeerConnection(windowRef) {
  const Constructor = getConstructor(windowRef, 'RTCPeerConnection');
  if (typeof Constructor !== 'function') {
    return { result: 'unsupported', supported: false, constructed: false, closed: null, network: false };
  }
  let peer = null;
  let channel = null;
  try {
    peer = new Constructor();
    if (typeof peer.createDataChannel !== 'function') {
      return { result: 'failed', supported: true, constructed: true, closed: null, network: false };
    }
    channel = peer.createDataChannel('translate-it-firefox-spike');
    return { result: 'supported', supported: true, constructed: true, closed: true, network: false };
  } catch {
    return { result: 'failed', supported: true, constructed: Boolean(peer), closed: Boolean(peer), network: false };
  } finally {
    try { channel?.close?.(); } catch { /* best effort */ }
    try { peer?.close?.(); } catch { /* best effort */ }
  }
}

function probeFetch(windowRef) {
  return typeof getConstructor(windowRef, 'fetch') === 'function'
    ? { result: 'supported', supported: true, constructed: null, closed: null, network: false }
    : { result: 'unsupported', supported: false, constructed: null, closed: null, network: false };
}

export class FirefoxRuntimeCapabilitiesProbe {
  constructor({ windowRef = globalThis, captureProbe = null } = {}) {
    this.windowRef = windowRef;
    this.captureProbe = captureProbe;
    this.started = false;
    this.capabilities = sanitizeFirefoxRuntimeCapabilities({});
  }

  start({ captureProbe = this.captureProbe } = {}) {
    if (this.started) return this.status();
    this.started = true;
    this.captureProbe = captureProbe;
    this.capabilities = sanitizeFirefoxRuntimeCapabilities({
      audioGraph: probeAudioGraph(captureProbe),
      webSocket: probeWebSocket(this.windowRef),
      rtcPeerConnection: probeRtcPeerConnection(this.windowRef),
      fetch: probeFetch(this.windowRef),
    });
    return this.status();
  }

  restart(options = {}) {
    this.stop();
    this.started = false;
    return this.start(options);
  }

  stop() {
    this.started = false;
    return this.status();
  }

  status() {
    return sanitizeFirefoxRuntimeCapabilities(this.capabilities);
  }
}
