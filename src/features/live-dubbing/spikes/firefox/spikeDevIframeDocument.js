/**
 * DEV-only extension-document receiver for the Firefox iframe transfer spike.
 *
 * This document has no WebExtension API access. It accepts one nonce-bound
 * message from its content/page parent, reconstructs a local MediaStream from
 * the transferred clone, measures scalar audio activity, replies once, then
 * closes and stops every receiver-owned resource.
 */

import { FIREFOX_SPIKE_IFRAME_ACTION } from './spikeDevIframeTransfer.js';

const RECEIVER_TYPES = new Set(['MediaStream', 'Object']);
const TRACK_STATES = new Set(['live', 'ended']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isYouTubeOrigin(origin) {
  if (typeof origin !== 'string') return false;
  try {
    const hostname = new URL(origin).hostname;
    return hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

function trackFacts(track) {
  return {
    kind: track?.kind === 'audio' ? 'audio' : null,
    readyState: TRACK_STATES.has(track?.readyState) ? track.readyState : null,
    muted: typeof track?.muted === 'boolean' ? track.muted : null,
  };
}

function analyserFacts(stream, windowRef) {
  const AudioContextFactory = windowRef?.AudioContext || windowRef?.webkitAudioContext;
  if (typeof AudioContextFactory !== 'function') {
    return { analyserActivity: 'unsupported', analyserPeak: null, cleanup: () => {} };
  }
  let context = null;
  let source = null;
  let analyser = null;
  try {
    try { context = new AudioContextFactory(); } catch { context = AudioContextFactory(); }
    const cleanup = () => {
      try { source?.disconnect?.(); } catch { /* best effort */ }
      try { analyser?.disconnect?.(); } catch { /* best effort */ }
      try { context?.close?.(); } catch { /* best effort */ }
    };
    if (!context?.createMediaStreamSource || !context?.createAnalyser) {
      return { analyserActivity: 'unsupported', analyserPeak: null, cleanup };
    }
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    source.connect?.(analyser);
    const size = Number.isInteger(analyser.fftSize) && analyser.fftSize > 0 ? analyser.fftSize : 1024;
    const values = new Float32Array(size);
    if (typeof analyser.getFloatTimeDomainData === 'function') {
      analyser.getFloatTimeDomainData(values);
    } else if (typeof analyser.getByteTimeDomainData === 'function') {
      const bytes = new Uint8Array(size);
      analyser.getByteTimeDomainData(bytes);
      for (let index = 0; index < bytes.length; index += 1) values[index] = (bytes[index] - 128) / 128;
    } else {
      return { analyserActivity: 'unsupported', analyserPeak: null, cleanup };
    }
    let peak = 0;
    for (const value of values) peak = Math.max(peak, Math.abs(value));
    return {
      analyserActivity: peak <= 0.0001 ? 'silent' : 'active',
      analyserPeak: Number.isFinite(peak) ? peak : null,
      cleanup,
    };
  } catch {
    try { source?.disconnect?.(); } catch { /* best effort */ }
    try { analyser?.disconnect?.(); } catch { /* best effort */ }
    try { context?.close?.(); } catch { /* best effort */ }
    return { analyserActivity: 'unsupported', analyserPeak: null, cleanup: () => {} };
  }
}

function rejectResponse(nonce, origin, errorCategory, receivedType = null) {
  return {
    action: FIREFOX_SPIKE_IFRAME_ACTION,
    nonce,
    origin,
    supported: false,
    accepted: false,
    receiverType: RECEIVER_TYPES.has(receivedType) ? receivedType : null,
    receiverKind: null,
    receiverReadyState: null,
    receiverMuted: null,
    receiverAnalyserActivity: 'unsupported',
    receiverAnalyserPeak: null,
    errorCategory,
  };
}

function processTransfer(event, windowRef, options) {
  const data = event.data;
  const nonce = typeof data?.nonce === 'string' ? data.nonce : null;
  const origin = event.origin;
  if (!nonce || nonce !== options.expectedNonce || !isYouTubeOrigin(origin)) return null;
  if (!isRecord(data) || data.action !== FIREFOX_SPIKE_IFRAME_ACTION) {
    return rejectResponse(nonce, data?.origin || origin, 'UNSUPPORTED_PAYLOAD');
  }
  const TrackConstructor = options.MediaStreamTrack || windowRef?.MediaStreamTrack;
  const StreamConstructor = options.MediaStream || windowRef?.MediaStream;
  let isTrack = false;
  try { isTrack = typeof TrackConstructor === 'function' && data.track instanceof TrackConstructor; } catch { isTrack = false; }
  if (!isTrack || data.origin !== options.extensionOrigin) {
    return rejectResponse(nonce, options.extensionOrigin, 'UNSUPPORTED_PAYLOAD', isRecord(data.track) ? 'Object' : null);
  }
  const facts = trackFacts(data.track);
  if (facts.kind !== 'audio') return rejectResponse(nonce, options.extensionOrigin, 'UNSUPPORTED_PAYLOAD');
  if (typeof StreamConstructor !== 'function') {
    try { data.track.stop?.(); } catch { /* best effort */ }
    return rejectResponse(nonce, options.extensionOrigin, 'MEDIA_STREAM_UNAVAILABLE');
  }

  let stream = null;
  let analyser = null;
  try {
    stream = new StreamConstructor([data.track]);
    analyser = analyserFacts(stream, windowRef);
    return {
      action: FIREFOX_SPIKE_IFRAME_ACTION,
      nonce,
      origin: options.extensionOrigin,
      supported: true,
      accepted: true,
      receiverType: 'MediaStream',
      receiverKind: facts.kind,
      receiverReadyState: facts.readyState,
      receiverMuted: facts.muted,
      receiverAnalyserActivity: analyser.analyserActivity,
      receiverAnalyserPeak: analyser.analyserPeak,
      errorCategory: null,
    };
  } catch {
    return rejectResponse(nonce, options.extensionOrigin, 'TRANSFER_FAILED');
  } finally {
    try { analyser?.cleanup?.(); } catch { /* best effort */ }
    try { stream?.getTracks?.().forEach(track => track.stop?.()); } catch { /* best effort */ }
    if (!stream) {
      try { data.track.stop?.(); } catch { /* best effort */ }
    }
  }
}

/** Install one-shot receiver; returned dispose is idempotent. */
export function installFirefoxSpikeIframeReceiver({
  windowRef = globalThis,
  extensionOrigin,
  MediaStream,
  MediaStreamTrack,
  expectedNonce,
} = {}) {
  let handled = false;
  let disposed = false;
  let hashNonce = null;
  try {
    hashNonce = decodeURIComponent(windowRef.location?.hash?.slice(1) || '');
  } catch { hashNonce = null; }
  const options = {
    extensionOrigin,
    MediaStream,
    MediaStreamTrack,
    expectedNonce: expectedNonce || hashNonce,
  };
  const listener = event => {
    if (disposed || handled || event?.source !== windowRef.parent) return;
    if (!isYouTubeOrigin(event.origin)) return;
    if (!isRecord(event.data) || event.data.action !== FIREFOX_SPIKE_IFRAME_ACTION) return;
    if (event.data.nonce !== options.expectedNonce) return;
    handled = true;
    const response = processTransfer(event, windowRef, options);
    if (!response) return;
    try { windowRef.parent.postMessage(response, event.origin); } catch { /* parent observes timeout */ }
    dispose();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    windowRef.removeEventListener?.('message', listener);
  };
  windowRef.addEventListener?.('message', listener);
  return { dispose };
}

if (typeof window !== 'undefined' && window.parent !== window) {
  installFirefoxSpikeIframeReceiver({
    extensionOrigin: window.location?.origin,
  });
}
