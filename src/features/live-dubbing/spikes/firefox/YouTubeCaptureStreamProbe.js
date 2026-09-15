/**
 * Firefox Desktop YouTube captureStream probe (DEV spike only).
 *
 * This deliberately stays page/content-side. The Phase 2 transport probe may
 * attempt to cross the captured objects separately, but this owner never
 * calls a provider, touches credentials, sends audio payloads, or enters the
 * production Coordinator path.
 */

export const FIREFOX_CAPTURE_PROBE_STATUS = Object.freeze({
  STOPPED: 'STOPPED',
  UNAVAILABLE: 'UNAVAILABLE',
  NO_MEDIA: 'NO_MEDIA',
  NO_TRACKS: 'NO_TRACKS',
  PAUSED: 'PAUSED',
  MUTED: 'MUTED',
  SILENT: 'SILENT',
  ACTIVE: 'ACTIVE',
  STALE: 'STALE',
  ENDED: 'ENDED',
  CAPTURE_ERROR: 'CAPTURE_ERROR',
});

export const FIREFOX_CAPTURE_PROBE_REASONS = new Set([
  'BRIDGE_ERROR',
  'CAPTURE_STREAM_UNAVAILABLE',
  'AUDIO_CONTEXT_UNAVAILABLE',
  'NO_AUDIO_TRACKS',
  'CAPTURE_STREAM_FAILED',
  'TRACKS_ENDED',
  'MEDIA_PAUSED',
  'MEDIA_MUTED',
  'SILENT_AUDIO',
  'MEDIA_ERROR',
  'AUDIO_ANALYSIS_FAILED',
  'YOUTUBE_NAVIGATION',
  'MEDIA_REPLACED',
  'NO_MEDIA',
  'PAUSED',
  'ENDED',
]);

const MEDIA_EVENTS = Object.freeze([
  'play',
  'pause',
  'ended',
  'emptied',
  'loadedmetadata',
  'volumechange',
  'error',
]);

const TRACK_EVENTS = Object.freeze(['ended', 'mute', 'unmute']);
const YOUTUBE_NAVIGATION_EVENTS = Object.freeze([
  'yt-navigate-start',
  'yt-navigate-finish',
  'yt-page-data-updated',
]);
const ANALYSER_FFT_SIZE = 1024;
const SILENCE_THRESHOLD = 0.0001;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return value && typeof value[Symbol.iterator] === 'function' ? [...value] : [];
}

function isPlaying(media) {
  return Boolean(media) && media.paused === false && media.ended !== true;
}

function mediaElements(documentRef, selector) {
  try {
    return asArray(documentRef?.querySelectorAll?.(selector));
  } catch {
    return [];
  }
}

function locateMedia(documentRef) {
  const videos = mediaElements(documentRef, 'video');
  const audios = mediaElements(documentRef, 'audio');
  const all = [...videos, ...audios];
  const activeVideo = videos.find(isPlaying);
  if (activeVideo) return { media: activeVideo, mediaType: 'video' };

  const activeAudio = audios.find(isPlaying);
  if (activeAudio) return { media: activeAudio, mediaType: 'audio' };

  const paused = all.find(media => media.ended !== true && media.paused === true);
  if (paused) return { state: FIREFOX_CAPTURE_PROBE_STATUS.PAUSED };
  if (all.some(media => media.ended === true)) {
    return { state: FIREFOX_CAPTURE_PROBE_STATUS.ENDED };
  }
  return { state: FIREFOX_CAPTURE_PROBE_STATUS.NO_MEDIA };
}

function trackSnapshot(tracks) {
  return tracks.map(track => ({
    readyState: typeof track?.readyState === 'string' ? track.readyState : null,
    muted: track?.muted === true,
  }));
}

function emptyStatus(state = FIREFOX_CAPTURE_PROBE_STATUS.STOPPED, reason = null) {
  return {
    success: ![
      FIREFOX_CAPTURE_PROBE_STATUS.UNAVAILABLE,
      FIREFOX_CAPTURE_PROBE_STATUS.CAPTURE_ERROR,
    ].includes(state),
    state,
    reason,
    mediaType: null,
    captureMethod: null,
    trackCount: 0,
    audioTracks: [],
    rms: null,
    peak: null,
  };
}

/**
 * Local scalar-only Firefox YouTube captureStream probe.
 *
 * The returned DTO contains no media, stream, URL, title, or sample data.
 */
export class YouTubeCaptureStreamProbe {
  constructor({
    documentRef = globalThis.document,
    windowRef = globalThis,
    audioContextFactory,
    mutationObserverFactory,
    analyserFftSize = ANALYSER_FFT_SIZE,
  } = {}) {
    this.documentRef = documentRef;
    this.windowRef = windowRef;
    this.audioContextFactory = audioContextFactory;
    this.mutationObserverFactory = mutationObserverFactory;
    this.analyserFftSize = analyserFftSize;

    this.media = null;
    this.mediaType = null;
    this.captureMethod = null;
    this.captureStream = null;
    this.captureTracks = [];
    this.audioTracks = [];
    this.audioContext = null;
    this.sourceNode = null;
    this.analyserNode = null;
    this.sinkNode = null;
    this.mutationObserver = null;
    this.listeners = [];
    this.probeActive = false;
    this.state = FIREFOX_CAPTURE_PROBE_STATUS.STOPPED;
    this.reason = null;
    this.lastMeasurement = { rms: null, peak: null };
  }

  /** Start once; use restart() for an explicit recapture. */
  async start() {
    if (this.probeActive) return this.status();

    const located = locateMedia(this.documentRef);
    if (!located.media) {
      this._setState(located.state || FIREFOX_CAPTURE_PROBE_STATUS.NO_MEDIA, located.state);
      return this.status();
    }

    this.media = located.media;
    this.mediaType = located.mediaType;
    this._attachMediaListeners();
    this._attachPageObservers();

    const captureMethod = typeof this.media.captureStream === 'function'
      ? 'captureStream'
      : typeof this.media.mozCaptureStream === 'function'
        ? 'mozCaptureStream'
        : null;
    if (!captureMethod) {
      this._setState(
        FIREFOX_CAPTURE_PROBE_STATUS.UNAVAILABLE,
        'CAPTURE_STREAM_UNAVAILABLE',
      );
      await this._cleanupResources();
      return this.status();
    }

    this.captureMethod = captureMethod;
    try {
      this.captureStream = this.media[captureMethod]();
      this.captureTracks = this._readTracks(this.captureStream, true);
      this.audioTracks = this._readTracks(this.captureStream, false);
    } catch {
      this._setState(FIREFOX_CAPTURE_PROBE_STATUS.CAPTURE_ERROR, 'CAPTURE_STREAM_FAILED');
      await this._cleanupResources();
      return this.status();
    }

    this._attachTrackListeners();
    this.probeActive = true;

    if (!this.audioTracks.length) {
      this._setState(FIREFOX_CAPTURE_PROBE_STATUS.NO_TRACKS, 'NO_AUDIO_TRACKS');
      return this.status();
    }

    if (this.audioTracks.every(track => track?.readyState === 'ended')) {
      this._setState(FIREFOX_CAPTURE_PROBE_STATUS.ENDED, 'TRACKS_ENDED');
      return this.status();
    }

    const audioContextFactory = this._resolveAudioContextFactory();
    if (!audioContextFactory) {
      this._setState(FIREFOX_CAPTURE_PROBE_STATUS.UNAVAILABLE, 'AUDIO_CONTEXT_UNAVAILABLE');
      await this._cleanupResources();
      return this.status();
    }

    try {
      await this._setupAudioGraph(audioContextFactory);
    } catch {
      this._setState(FIREFOX_CAPTURE_PROBE_STATUS.CAPTURE_ERROR, 'AUDIO_ANALYSIS_FAILED');
      await this._cleanupResources();
      return this.status();
    }

    this._refreshState();
    return this.status();
  }

  /** Explicit recapture after media replacement or YouTube navigation. */
  async restart() {
    await this.stop();
    return this.start();
  }

  /** Stop is idempotent and only stops tracks owned by this probe. */
  async stop() {
    await this._cleanupResources();
    this._setState(FIREFOX_CAPTURE_PROBE_STATUS.STOPPED, null);
    return this.status();
  }

  /** Return a fresh scalar-only snapshot; never recaptures media. */
  status() {
    if (this.probeActive) this._refreshState();
    const snapshot = emptyStatus(this.state, this.reason);
    snapshot.mediaType = this.mediaType;
    snapshot.captureMethod = this.captureMethod;
    snapshot.trackCount = this.audioTracks.length;
    snapshot.audioTracks = trackSnapshot(this.audioTracks);
    snapshot.rms = this.lastMeasurement.rms;
    snapshot.peak = this.lastMeasurement.peak;
    return snapshot;
  }

  _setState(state, reason = null) {
    this.state = state;
    this.reason = reason;
    if (state !== FIREFOX_CAPTURE_PROBE_STATUS.ACTIVE
      && state !== FIREFOX_CAPTURE_PROBE_STATUS.SILENT) {
      this.lastMeasurement = { rms: null, peak: null };
    }
  }

  _resolveAudioContextFactory() {
    return this.audioContextFactory
      || this.windowRef?.AudioContext
      || this.windowRef?.webkitAudioContext
      || globalThis.AudioContext
      || globalThis.webkitAudioContext
      || null;
  }

  _readTracks(stream, allTracks) {
    if (!stream) throw new TypeError('captureStream returned no stream');
    const getter = allTracks ? stream.getTracks : stream.getAudioTracks;
    if (typeof getter !== 'function') throw new TypeError('captureStream has no track getter');
    const tracks = getter.call(stream);
    if (!tracks || typeof tracks[Symbol.iterator] !== 'function') {
      throw new TypeError('captureStream returned invalid tracks');
    }
    return [...tracks];
  }

  async _setupAudioGraph(AudioContextFactory) {
    let context;
    try {
      context = new AudioContextFactory();
    } catch {
      context = AudioContextFactory();
    }
    if (!isRecord(context)
      || typeof context.createMediaStreamSource !== 'function'
      || typeof context.createAnalyser !== 'function') {
      throw new TypeError('AudioContext is unavailable');
    }

    this.audioContext = context;
    this.sourceNode = context.createMediaStreamSource(this.captureStream);
    this.analyserNode = context.createAnalyser();
    this.analyserNode.fftSize = this.analyserFftSize;
    this.sourceNode.connect(this.analyserNode);

    // Keep the analyser live without routing captured audio to the user.
    if (typeof context.createGain === 'function' && context.destination) {
      this.sinkNode = context.createGain();
      if (this.sinkNode.gain) this.sinkNode.gain.value = 0;
      this.analyserNode.connect(this.sinkNode);
      this.sinkNode.connect(context.destination);
    }

    if (typeof context.resume === 'function') await context.resume();
  }

  _attachMediaListeners() {
    for (const eventName of MEDIA_EVENTS) {
      this._addListener(this.media, eventName, () => {
        if (eventName === 'error') {
          this._setState(FIREFOX_CAPTURE_PROBE_STATUS.CAPTURE_ERROR, 'MEDIA_ERROR');
          return;
        }
        if (this.probeActive) this._refreshState();
      });
    }
  }

  _attachTrackListeners() {
    for (const track of this.audioTracks) {
      for (const eventName of TRACK_EVENTS) {
        this._addListener(track, eventName, () => {
          if (this.probeActive) this._refreshState();
        });
      }
    }
  }

  _attachPageObservers() {
    for (const eventName of YOUTUBE_NAVIGATION_EVENTS) {
      this._addListener(this.documentRef, eventName, () => {
        if (this.probeActive) this._setState(FIREFOX_CAPTURE_PROBE_STATUS.STALE, 'YOUTUBE_NAVIGATION');
      });
    }
    if (this.windowRef !== this.documentRef) {
      for (const eventName of YOUTUBE_NAVIGATION_EVENTS) {
        this._addListener(this.windowRef, eventName, () => {
          if (this.probeActive) this._setState(FIREFOX_CAPTURE_PROBE_STATUS.STALE, 'YOUTUBE_NAVIGATION');
        });
      }
    }

    const Observer = this.mutationObserverFactory
      || this.windowRef?.MutationObserver
      || globalThis.MutationObserver;
    const root = this.documentRef?.documentElement || this.documentRef;
    if (typeof Observer === 'function' && root && typeof root === 'object') {
      try {
        this.mutationObserver = new Observer(() => this._checkForReplacement());
        this.mutationObserver.observe(root, { childList: true, subtree: true });
      } catch {
        this.mutationObserver = null;
      }
    }
  }

  _addListener(target, eventName, handler) {
    if (typeof target?.addEventListener !== 'function') return;
    target.addEventListener(eventName, handler);
    this.listeners.push({ target, eventName, handler });
  }

  _checkForReplacement() {
    if (!this.probeActive || this.state === FIREFOX_CAPTURE_PROBE_STATUS.STALE) return;
    let connected = true;
    try {
      connected = this.media?.isConnected !== false
        && (!this.documentRef?.contains || this.documentRef.contains(this.media));
    } catch {
      connected = false;
    }
    const located = locateMedia(this.documentRef);
    if (!connected || (located.media && located.media !== this.media)) {
      this._setState(FIREFOX_CAPTURE_PROBE_STATUS.STALE, 'MEDIA_REPLACED');
    }
  }

  _refreshState() {
    if (!this.probeActive || this.state === FIREFOX_CAPTURE_PROBE_STATUS.STALE) return;
    this._checkForReplacement();
    if (this.state === FIREFOX_CAPTURE_PROBE_STATUS.STALE) return;

    try {
      this.audioTracks = this._readTracks(this.captureStream, false);
    } catch {
      this._setState(FIREFOX_CAPTURE_PROBE_STATUS.CAPTURE_ERROR, 'CAPTURE_STREAM_FAILED');
      return;
    }
    if (!this.audioTracks.length) {
      this._setState(FIREFOX_CAPTURE_PROBE_STATUS.NO_TRACKS, 'NO_AUDIO_TRACKS');
      return;
    }
    if (this.media?.ended === true || this.audioTracks.every(track => track?.readyState === 'ended')) {
      this._setState(FIREFOX_CAPTURE_PROBE_STATUS.ENDED, 'TRACKS_ENDED');
      return;
    }
    if (this.media?.paused === true) {
      this._setState(FIREFOX_CAPTURE_PROBE_STATUS.PAUSED, 'MEDIA_PAUSED');
      return;
    }
    if (this.media?.muted === true || this.audioTracks.every(track => track?.muted === true)) {
      this._setState(FIREFOX_CAPTURE_PROBE_STATUS.MUTED, 'MEDIA_MUTED');
      return;
    }

    // Rebuild only scalar measurements; samples never leave this method.
    const measurement = this._measure();
    this.lastMeasurement = measurement;
    this._setState(
      measurement.peak !== null && measurement.peak <= SILENCE_THRESHOLD
        ? FIREFOX_CAPTURE_PROBE_STATUS.SILENT
        : FIREFOX_CAPTURE_PROBE_STATUS.ACTIVE,
      measurement.peak !== null && measurement.peak <= SILENCE_THRESHOLD ? 'SILENT_AUDIO' : null,
    );
  }

  _measure() {
    if (!this.analyserNode) return { rms: null, peak: null };
    const size = Number.isInteger(this.analyserNode.fftSize) && this.analyserNode.fftSize > 0
      ? this.analyserNode.fftSize
      : this.analyserFftSize;
    const samples = new Float32Array(size);
    if (typeof this.analyserNode.getFloatTimeDomainData === 'function') {
      this.analyserNode.getFloatTimeDomainData(samples);
    } else if (typeof this.analyserNode.getByteTimeDomainData === 'function') {
      const bytes = new Uint8Array(size);
      this.analyserNode.getByteTimeDomainData(bytes);
      for (let index = 0; index < bytes.length; index += 1) {
        samples[index] = (bytes[index] - 128) / 128;
      }
    } else {
      return { rms: null, peak: null };
    }

    let sum = 0;
    let peak = 0;
    for (const sample of samples) {
      const absolute = Math.abs(sample);
      sum += sample * sample;
      if (absolute > peak) peak = absolute;
    }
    return {
      rms: Math.sqrt(sum / samples.length),
      peak,
    };
  }

  async _cleanupResources() {
    this.probeActive = false;
    for (const { target, eventName, handler } of this.listeners.splice(0)) {
      try { target.removeEventListener?.(eventName, handler); } catch { /* best effort */ }
    }
    try { this.mutationObserver?.disconnect?.(); } catch { /* best effort */ }
    this.mutationObserver = null;

    for (const node of [this.sourceNode, this.analyserNode, this.sinkNode]) {
      try { node?.disconnect?.(); } catch { /* best effort */ }
    }
    this.sourceNode = null;
    this.analyserNode = null;
    this.sinkNode = null;

    try {
      await this.audioContext?.close?.();
    } catch { /* best effort */ }
    this.audioContext = null;

    let tracks = this.captureTracks;
    if (this.captureStream) {
      try { tracks = this._readTracks(this.captureStream, true); } catch { /* best effort */ }
    }
    for (const track of new Set(tracks)) {
      try { track.stop?.(); } catch { /* best effort */ }
    }
    this.captureTracks = [];
    this.audioTracks = [];
    this.captureStream = null;
    this.media = null;
    this.mediaType = null;
    this.captureMethod = null;
    this.lastMeasurement = { rms: null, peak: null };
  }
}
