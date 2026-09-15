/**
 * DEV-only Firefox transport receiver for the Phase 2 capability spike.
 *
 * It accepts only the spike-local action namespace from this extension's
 * YouTube content script. Received media objects are inspected transiently;
 * no media, tracks, samples, raw messages, or errors are logged or stored.
 */

import {
  FIREFOX_TRANSPORT_ERROR_CATEGORIES,
  FIREFOX_TRANSPORT_OUTCOMES,
  FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS,
  FIREFOX_YOUTUBE_SPIKE_MESSAGE_TARGET,
  FIREFOX_YOUTUBE_SPIKE_PORT_NAME,
  sanitizeFirefoxTransferResult,
} from './spikeDevTransport.js';

const SOURCE_VALUES = new Set(['captured-stream', 'original-audio-track', 'cloned-audio-track']);
const ACTION_VALUES = new Set(Object.values(FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS));

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isYouTubeUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const hostname = new URL(value).hostname;
    return hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

/** Background auth fence: runtime identity plus a YouTube content sender. */
export function isAuthorizedFirefoxSpikeSender(sender, browserAPI) {
  const extensionId = browserAPI?.runtime?.id;
  const senderUrl = sender?.url || sender?.tab?.url;
  return typeof extensionId === 'string'
    && extensionId.length > 0
    && sender?.id === extensionId
    && isYouTubeUrl(senderUrl);
}

function transportForAction(action) {
  return action === FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS.SEND_MESSAGE
    ? 'send-message'
    : action === FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS.PORT_TRANSFER
      ? 'port'
      : null;
}

function rejectedResult(transport, source, errorCategory) {
  return sanitizeFirefoxTransferResult({
    transport,
    source,
    outcome: FIREFOX_TRANSPORT_OUTCOMES.REJECTED,
    accepted: false,
    analyserActivity: 'unsupported',
    ownership: 'unknown',
    errorCategory,
  }, { transport, source });
}

function parseTransferMessage(message, transport) {
  if (!isRecord(message)
    || message.target !== FIREFOX_YOUTUBE_SPIKE_MESSAGE_TARGET
    || !ACTION_VALUES.has(message.action)
    || transportForAction(message.action) !== transport
    || !isRecord(message.data)
    || !SOURCE_VALUES.has(message.data.source)
    || !Object.prototype.hasOwnProperty.call(message.data, 'payload')) return null;
  return { source: message.data.source, payload: message.data.payload };
}

function getConstructor(options, name) {
  return options[name] || globalThis[name] || null;
}

function isInstance(value, Constructor) {
  if (typeof Constructor !== 'function') return false;
  try { return value instanceof Constructor; } catch { return false; }
}

function readTrackFacts(track) {
  const readyState = track?.readyState === 'live' || track?.readyState === 'ended'
    ? track.readyState
    : null;
  return {
    kind: track?.kind === 'audio' ? 'audio' : null,
    readyState,
    muted: typeof track?.muted === 'boolean' ? track.muted : null,
    ended: readyState === null ? null : readyState === 'ended',
  };
}

function getStreamTracks(stream) {
  try {
    const tracks = stream?.getAudioTracks?.();
    return tracks && typeof tracks[Symbol.iterator] === 'function' ? [...tracks] : [];
  } catch {
    return [];
  }
}

function measureStream(stream, options) {
  const AudioContextFactory = options.audioContextFactory || getConstructor(options, 'AudioContext');
  if (typeof AudioContextFactory !== 'function') {
    return { analyserActivity: 'unsupported', analyserPeak: null };
  }

  let context = null;
  let source = null;
  let analyser = null;
  try {
    try {
      context = new AudioContextFactory();
    } catch {
      context = AudioContextFactory();
    }
    if (!context || typeof context.createMediaStreamSource !== 'function'
      || typeof context.createAnalyser !== 'function') {
      return { analyserActivity: 'unsupported', analyserPeak: null };
    }
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    source.connect?.(analyser);
    const size = Number.isInteger(analyser.fftSize) && analyser.fftSize > 0 ? analyser.fftSize : 1024;
    const samples = new Float32Array(size);
    if (typeof analyser.getFloatTimeDomainData === 'function') {
      analyser.getFloatTimeDomainData(samples);
    } else if (typeof analyser.getByteTimeDomainData === 'function') {
      const bytes = new Uint8Array(size);
      analyser.getByteTimeDomainData(bytes);
      for (let index = 0; index < bytes.length; index += 1) samples[index] = (bytes[index] - 128) / 128;
    } else {
      return { analyserActivity: 'unsupported', analyserPeak: null };
    }
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    return {
      analyserActivity: peak <= 0.0001 ? 'silent' : 'active',
      analyserPeak: Number.isFinite(peak) ? peak : null,
    };
  } catch {
    return { analyserActivity: 'unsupported', analyserPeak: null };
  } finally {
    try { source?.disconnect?.(); } catch { /* best effort */ }
    try { analyser?.disconnect?.(); } catch { /* best effort */ }
    try { context?.close?.(); } catch { /* best effort */ }
  }
}

/** Inspect only native received types and scalar track facts. */
export function inspectFirefoxTransferPayload(source, payload, options = {}) {
  const transport = options.transport || 'send-message';
  const MediaStreamConstructor = getConstructor(options, 'MediaStream');
  const MediaStreamTrackConstructor = getConstructor(options, 'MediaStreamTrack');
  const isStream = isInstance(payload, MediaStreamConstructor);
  const isTrack = isInstance(payload, MediaStreamTrackConstructor);

  if (!isStream && !isTrack) {
    return sanitizeFirefoxTransferResult({
      transport,
      source,
      outcome: FIREFOX_TRANSPORT_OUTCOMES.REJECTED,
      accepted: false,
      receivedType: isRecord(payload) ? 'Object' : null,
      analyserActivity: 'unsupported',
      ownership: 'unknown',
      errorCategory: FIREFOX_TRANSPORT_ERROR_CATEGORIES.UNSUPPORTED_PAYLOAD,
    }, { transport, source });
  }

  const track = isTrack ? payload : getStreamTracks(payload)[0] || null;
  const facts = readTrackFacts(track);
  if (isTrack && facts.kind !== 'audio') {
    return sanitizeFirefoxTransferResult({
      transport,
      source,
      outcome: FIREFOX_TRANSPORT_OUTCOMES.REJECTED,
      accepted: false,
      receivedType: 'MediaStreamTrack',
      readyState: facts.readyState,
      muted: facts.muted,
      ended: facts.ended,
      ownership: 'received',
      analyserActivity: 'unsupported',
      errorCategory: FIREFOX_TRANSPORT_ERROR_CATEGORIES.UNSUPPORTED_PAYLOAD,
    }, { transport, source });
  }
  const analyser = isStream
    ? measureStream(payload, options)
    : { analyserActivity: 'unsupported', analyserPeak: null };
  return sanitizeFirefoxTransferResult({
    transport,
    source,
    outcome: FIREFOX_TRANSPORT_OUTCOMES.ACCEPTED,
    accepted: true,
    receivedType: isStream ? 'MediaStream' : 'MediaStreamTrack',
    kind: facts.kind,
    readyState: facts.readyState,
    muted: facts.muted,
    analyserActivity: analyser.analyserActivity,
    analyserPeak: analyser.analyserPeak,
    ended: isStream
      ? (() => {
        const tracks = getStreamTracks(payload);
        return tracks.length ? tracks.every(item => item?.readyState === 'ended') : null;
      })()
      : facts.ended,
    ownership: 'received',
  }, { transport, source });
}

export class FirefoxSpikeBackgroundReceiver {
  constructor(options = {}) {
    this.browserAPI = options.browserAPI || globalThis.browser || globalThis.chrome || null;
    this.isAuthorizedSender = options.isAuthorizedSender
      || (sender => isAuthorizedFirefoxSpikeSender(sender, this.browserAPI));
    this.inspectPayload = options.inspectPayload || inspectFirefoxTransferPayload;
    this.inspectOptions = options.inspectOptions || {};
    this.ports = new Set();
  }

  async handleMessage(message, sender) {
    const transport = transportForAction(message?.action);
    if (!transport || message?.target !== FIREFOX_YOUTUBE_SPIKE_MESSAGE_TARGET) return null;
    if (!this.isAuthorizedSender(sender)) {
      return rejectedResult(transport, null, FIREFOX_TRANSPORT_ERROR_CATEGORIES.UNAUTHORIZED);
    }
    const parsed = parseTransferMessage(message, transport);
    if (!parsed) return rejectedResult(transport, null, FIREFOX_TRANSPORT_ERROR_CATEGORIES.INVALID_MESSAGE);
    try {
      const result = this.inspectPayload(parsed.source, parsed.payload, {
        ...this.inspectOptions,
        transport,
      });
      return sanitizeFirefoxTransferResult(result, { source: parsed.source, transport });
    } catch {
      return rejectedResult(transport, parsed.source, FIREFOX_TRANSPORT_ERROR_CATEGORIES.TRANSPORT_ERROR);
    }
  }

  handlePort(port) {
    if (!port || port.name !== FIREFOX_YOUTUBE_SPIKE_PORT_NAME) return false;
    if (!this.isAuthorizedSender(port.sender)) {
      try { port.disconnect?.(); } catch { /* best effort */ }
      return true;
    }
    this.ports.add(port);
    let handled = false;
    const cleanup = () => {
      this.ports.delete(port);
      try { port.onMessage?.removeListener?.(onMessage); } catch { /* best effort */ }
      try { port.onDisconnect?.removeListener?.(cleanup); } catch { /* best effort */ }
    };
    const onMessage = async message => {
      if (handled) return;
      handled = true;
      const response = await this.handleMessage(message, port.sender)
        || rejectedResult('port', null, FIREFOX_TRANSPORT_ERROR_CATEGORIES.INVALID_MESSAGE);
      try { port.postMessage(response); } catch { /* sender will observe disconnect */ }
      cleanup();
      try { port.disconnect?.(); } catch { /* best effort */ }
    };
    port.onMessage?.addListener?.(onMessage);
    port.onDisconnect?.addListener?.(cleanup);
    return true;
  }

  dispose() {
    for (const port of this.ports) {
      try { port.disconnect?.(); } catch { /* best effort */ }
    }
    this.ports.clear();
  }
}

export function installFirefoxSpikeBackgroundReceiver({
  browserAPI = globalThis.browser || globalThis.chrome,
  isDevelopment = typeof __IS_DEVELOPMENT__ !== 'undefined' && __IS_DEVELOPMENT__ === true,
  ...options
} = {}) {
  if (!isDevelopment) return undefined;
  const runtime = browserAPI?.runtime;
  if (!runtime?.onMessage?.addListener || !runtime?.onConnect?.addListener) return undefined;
  const receiver = new FirefoxSpikeBackgroundReceiver({ browserAPI, ...options });
  const onMessage = (message, sender) => receiver.handleMessage(message, sender);
  runtime.onMessage.addListener(onMessage);
  runtime.onConnect.addListener(port => receiver.handlePort(port));
  return receiver;
}
