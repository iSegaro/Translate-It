/**
 * Capture-side audio primitives for live dubbing.
 *
 * The capture context is intentionally fixed-rate. AudioContext is allowed to
 * choose a different rate on some browsers, but accepting that result here
 * would make the source sample clock and the wire format disagree.
 *
 * Canonical input framing lives here as the single source of truth for the
 * offscreen capture boundary: fixed 100ms frames (1600 samples at 16kHz).
 * The frame size is delivered to the capture AudioWorklet via MessagePort
 * `configure` after construction (processorOptions cloning is not reliably
 * available in all content AudioWorklet runtimes).
 */

export const INPUT_SAMPLE_RATE = 16_000;
export const INPUT_FRAME_SAMPLES = 1_600;
export const CAPTURE_PROCESSOR_NAME = 'live-dubbing-capture-processor';
// Stable, web-accessible worklet location. Prefer extension URL via runtime.getURL
// (Firefox content AudioWorklet requires web_accessible_resources); fallback to
// Vite-transformed relative URL for tests and non-extension environments.
function resolveCaptureWorkletUrl() {
  const stablePath = 'assets/live-dubbing/liveDubbingCapture.worklet.js';
  try {
    const runtime = globalThis.browser?.runtime ?? globalThis.chrome?.runtime;
    if (runtime?.getURL) {
      const url = runtime.getURL(stablePath);
      if (typeof url === 'string' && url && !url.includes('://invalid/')) return url;
    }
  } catch {
    // runtime unavailable in test environments
  }
  try {
    return new URL('./liveDubbingCapture.worklet.js', import.meta.url).href;
  } catch {
    return stablePath;
  }
}
export const CAPTURE_WORKLET_URL = resolveCaptureWorkletUrl();

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeFrameSamples(value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError('frameSamples must be a positive integer');
  }
  return value;
}

function normalizeSampleRate(value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError('sampleRate must be a positive integer');
  }
  return value;
}

function createAudioError(code, message, fields = {}) {
  const error = new Error(message);
  error.name = 'LiveDubbingAudioError';
  error.code = code;
  Object.assign(error, fields);
  return error;
}

const SAFE_CANONICAL_CODE = /^[A-Za-z0-9_.-]{1,80}$/;

function isCanonicalError(error) {
  return typeof error?.code === 'string' && SAFE_CANONICAL_CODE.test(error.code);
}

const INPUT_WORKLET_NODE_ERROR_MAP = Object.freeze({
  NotSupportedError: 'INPUT_AUDIO_WORKLET_NODE_NOT_SUPPORTED',
  IndexSizeError: 'INPUT_AUDIO_WORKLET_NODE_INDEX_SIZE',
  InvalidStateError: 'INPUT_AUDIO_WORKLET_NODE_INVALID_STATE',
  OperationError: 'INPUT_AUDIO_WORKLET_NODE_OPERATION_FAILED',
  TypeError: 'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR',
});

function getInputWorkletNodeErrorCode(error) {
  if (isCanonicalError(error)) return null;
  const name = typeof error?.name === 'string' ? error.name : '';
  return INPUT_WORKLET_NODE_ERROR_MAP[name] || 'INPUT_AUDIO_WORKLET_NODE_FAILED';
}

function getSafeInputWorkletNodeMessage(code) {
  switch (code) {
    case 'INPUT_AUDIO_WORKLET_NODE_NOT_SUPPORTED':
      return 'Capture worklet node not supported';
    case 'INPUT_AUDIO_WORKLET_NODE_INDEX_SIZE':
      return 'Capture worklet node index size error';
    case 'INPUT_AUDIO_WORKLET_NODE_INVALID_STATE':
      return 'Capture worklet node invalid state';
    case 'INPUT_AUDIO_WORKLET_NODE_OPERATION_FAILED':
      return 'Capture worklet node operation failed';
    case 'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR':
      return 'Capture worklet node type error';
    default:
      return 'Failed to create capture worklet node';
  }
}

function getAudioContextFactory(options) {
  if (typeof options.audioContextFactory === 'function') return options.audioContextFactory;
  if (typeof options.contextFactory === 'function') return options.contextFactory;

  const AudioContextConstructor = options.AudioContext
    || globalThis.AudioContext
    || globalThis.webkitAudioContext;
  if (typeof AudioContextConstructor !== 'function') return null;

  return contextOptions => new AudioContextConstructor(contextOptions);
}

function getBufferLength(channel) {
  return channel && Number.isInteger(channel.length) ? channel.length : 0;
}

// DEV-only scalar diagnostics (Firefox) - safe scalars only, no identifiers / audio
function isDevFirefoxDiagnostics() {
  try {
    return typeof __IS_DEVELOPMENT__ !== 'undefined' && __IS_DEVELOPMENT__ && typeof __BROWSER__ !== 'undefined' && __BROWSER__ === 'firefox';
  } catch {
    return false;
  }
}

function getContextStateScalar(context) {
  const s = context?.state;
  return s === 'running' || s === 'suspended' || s === 'closed' ? s : 'other';
}

function getStreamDiagnostics(stream) {
  let audioTracks = 0;
  let liveAudioTracks = 0;
  let trackReady = false;
  let trackMuted = false;
  let trackEnabled = false;
  try {
    const audioList = typeof stream?.getAudioTracks === 'function'
      ? stream.getAudioTracks()
      : (typeof stream?.getTracks === 'function' ? (stream.getTracks() || []).filter(t => t?.kind === 'audio') : []);
    const list = Array.isArray(audioList) ? audioList : [...(audioList || [])];
    audioTracks = list.length;
    for (const track of list) {
      try {
        if (track?.readyState === 'live') trackReady = true;
        if (track?.muted === true) trackMuted = true;
        // aggregated enabled: true if any track enabled
        if (track?.enabled === true) trackEnabled = true;
      } catch { /* diagnostic ignore */ }
    }
    try {
      liveAudioTracks = list.filter(t => t?.readyState === 'live').length;
    } catch {
      liveAudioTracks = trackReady ? audioTracks : 0;
    }
    // if no explicit enabled true but tracks exist, consider enabled if not explicitly false
    if (!trackEnabled && list.length > 0) {
      try {
        trackEnabled = list.some(t => t?.enabled !== false);
      } catch { /* diagnostic ignore */ }
    }
  } catch { /* diagnostic ignore */ }
  return { audioTracks, liveAudioTracks, trackReady, trackMuted, trackEnabled };
}

/**
 * Clamp a floating point audio sample to the PCM domain.
 * Non-finite samples are silence rather than an invalid PCM value.
 */
export function clampAudioSample(sample) {
  if (!isFiniteNumber(sample)) return 0;
  return Math.max(-1, Math.min(1, sample));
}

/**
 * Convert one normalized sample using the asymmetric PCM16 range mandated by
 * signed PCM: -1 maps to -32768 and +1 maps to +32767.
 */
export function floatToPcm16(sample) {
  const clamped = clampAudioSample(sample);
  return clamped < 0
    ? Math.round(clamped * 0x8000)
    : Math.round(clamped * 0x7fff);
}

/**
 * Deterministically downmix channel planes by averaging the channel values.
 * Missing values in a short channel are treated as silence.
 */
export function downmixToMono(channels, frameCount = undefined) {
  const channelList = Array.from(channels || []);
  const inferredFrameCount = channelList.reduce(
    (largest, channel) => Math.max(largest, getBufferLength(channel)),
    0,
  );
  const count = frameCount === undefined ? inferredFrameCount : frameCount;
  if (!Number.isInteger(count) || count < 0) {
    throw new TypeError('frameCount must be a non-negative integer');
  }

  const mono = new Float32Array(count);
  if (channelList.length === 0) return mono;

  for (let index = 0; index < count; index += 1) {
    let sum = 0;
    for (const channel of channelList) {
      const value = channel?.[index];
      sum += isFiniteNumber(value) ? value : 0;
    }
    mono[index] = clampAudioSample(sum / channelList.length);
  }
  return mono;
}

/**
 * Encode mono normalized samples as a tightly-sized transferable PCM16 LE
 * ArrayBuffer. This function deliberately does not resample.
 */
export function encodePcm16Le(samples) {
  const source = samples || [];
  const buffer = new ArrayBuffer(source.length * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < source.length; index += 1) {
    view.setInt16(index * 2, floatToPcm16(source[index]), true);
  }
  return buffer;
}

export const encodePcm16LE = encodePcm16Le;

function createFrame(samples, offset, count, sourceSampleStart, sampleRate, partial) {
  const frameSamples = samples.subarray(offset, offset + count);
  const sourceTimeStart = isFiniteNumber(sourceSampleStart)
    ? sourceSampleStart / sampleRate
    : undefined;
  return {
    type: 'pcm',
    buffer: encodePcm16Le(frameSamples),
    sampleRate,
    channels: 1,
    sampleCount: count,
    sourceSampleStart,
    sourceSampleEnd: isFiniteNumber(sourceSampleStart)
      ? sourceSampleStart + count
      : undefined,
    sourceTimeStart,
    sourceTimestamp: sourceTimeStart,
    partial,
  };
}

/**
 * Frame a mono sample block without resampling. The final short frame is
 * retained by default so callers can choose whether to transmit or carry it.
 */
export function frameMonoPcm16(
  samples,
  {
    frameSamples = INPUT_FRAME_SAMPLES,
    sampleRate = INPUT_SAMPLE_RATE,
    sourceSampleStart = 0,
    includePartial = true,
  } = {},
) {
  const normalizedFrameSamples = normalizeFrameSamples(frameSamples);
  const normalizedSampleRate = normalizeSampleRate(sampleRate);
  const source = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  const frames = [];
  for (let offset = 0; offset < source.length; offset += normalizedFrameSamples) {
    const count = Math.min(normalizedFrameSamples, source.length - offset);
    const partial = count < normalizedFrameSamples;
    if (partial && !includePartial) break;
    frames.push(createFrame(
      source,
      offset,
      count,
      isFiniteNumber(sourceSampleStart) ? sourceSampleStart + offset : undefined,
      normalizedSampleRate,
      partial,
    ));
  }
  return frames;
}

/**
 * Stateful pure framing helper used by tests and non-worklet integrations.
 */
export class MonoPcm16Framer {
  constructor({
    frameSamples = INPUT_FRAME_SAMPLES,
    sampleRate = INPUT_SAMPLE_RATE,
  } = {}) {
    this.frameSamples = normalizeFrameSamples(frameSamples);
    this.sampleRate = normalizeSampleRate(sampleRate);
    this.pending = new Float32Array(0);
    this.nextSourceSample = null;
  }

  push(samples, { sourceSampleStart = undefined } = {}) {
    const incoming = samples instanceof Float32Array
      ? samples
      : Float32Array.from(samples || []);
    if (incoming.length === 0) return [];

    if (this.nextSourceSample === null) {
      this.nextSourceSample = isFiniteNumber(sourceSampleStart) ? sourceSampleStart : 0;
    }

    const combined = new Float32Array(this.pending.length + incoming.length);
    combined.set(this.pending);
    combined.set(incoming, this.pending.length);

    const frames = [];
    let offset = 0;
    let frameSourceSample = this.nextSourceSample;
    while (combined.length - offset >= this.frameSamples) {
      frames.push(createFrame(
        combined,
        offset,
        this.frameSamples,
        frameSourceSample,
        this.sampleRate,
        false,
      ));
      offset += this.frameSamples;
      frameSourceSample += this.frameSamples;
    }

    this.pending = combined.slice(offset);
    this.nextSourceSample = frameSourceSample;
    return frames;
  }

  flush() {
    if (this.pending.length === 0) return [];
    const frames = [createFrame(
      this.pending,
      0,
      this.pending.length,
      this.nextSourceSample,
      this.sampleRate,
      true,
    )];
    this.pending = new Float32Array(0);
    this.nextSourceSample = null;
    return frames;
  }

  clear() {
    this.pending = new Float32Array(0);
    this.nextSourceSample = null;
  }
}

function isArrayBuffer(value) {
  return value instanceof ArrayBuffer
    || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer);
}

function getMessageBuffer(data) {
  if (isArrayBuffer(data?.buffer)) return data.buffer;
  if (ArrayBuffer.isView(data?.buffer)) {
    return data.buffer.buffer.slice(
      data.buffer.byteOffset,
      data.buffer.byteOffset + data.buffer.byteLength,
    );
  }
  if (isArrayBuffer(data?.pcm)) return data.pcm;
  if (ArrayBuffer.isView(data?.pcm)) {
    return data.pcm.buffer.slice(
      data.pcm.byteOffset,
      data.pcm.byteOffset + data.pcm.byteLength,
    );
  }
  return null;
}

function disconnect(node) {
  try {
    node?.disconnect?.();
  } catch {
    // Audio graph cleanup is best effort; all owned resources are still closed.
  }
}

function closePort(port) {
  try {
    port?.close?.();
  } catch {
    // MessagePort close is idempotent in browsers but not in all test doubles.
  }
}

function stopStreamTracks(stream) {
  let tracks = [];
  try {
    tracks = typeof stream?.getTracks === 'function' ? stream.getTracks() || [] : [];
  } catch {
    tracks = [];
  }
  const audioTracks = tracks.length > 0 || typeof stream?.getAudioTracks !== 'function'
    ? tracks
    : (() => {
      try {
        return stream.getAudioTracks() || [];
      } catch {
        return [];
      }
    })();
  for (const track of audioTracks) {
    try {
      track?.stop?.();
    } catch {
      // Track cleanup is best effort and must not block graph teardown.
    }
  }
}

async function closeContext(context) {
  try {
    await context?.close?.();
  } catch {
    // Contexts can already be closed when a setup step fails.
  }
}

/**
 * Verify a context instead of silently accepting browser resampling.
 */
export function verifyInputAudioContext(context, sampleRate = INPUT_SAMPLE_RATE) {
  if (!context || context.sampleRate !== sampleRate) {
    throw createAudioError(
      'INPUT_AUDIO_CONTEXT_SAMPLE_RATE_MISMATCH',
      `Expected input AudioContext at ${sampleRate} Hz`,
      { expectedSampleRate: sampleRate, actualSampleRate: context?.sampleRate },
    );
  }
  return context;
}

/**
 * Owns one tab MediaStream -> capture AudioWorklet graph. The stream is never
 * connected directly to the destination: the only sink is a zero-gain node.
 */
export class TabAudioPipeline {
  constructor(options = {}) {
    if (options.sampleRate !== undefined && options.sampleRate !== INPUT_SAMPLE_RATE) {
      throw createAudioError('INPUT_AUDIO_SAMPLE_RATE_FIXED', 'Capture sample rate is fixed at 16000 Hz');
    }
    if (options.frameSamples !== undefined && options.frameSamples !== INPUT_FRAME_SAMPLES) {
      throw createAudioError('INPUT_AUDIO_FRAME_SIZE_FIXED', 'Capture frame size is fixed to 1600 samples');
    }
    this.sampleRate = INPUT_SAMPLE_RATE;
    this.frameSamples = INPUT_FRAME_SAMPLES;

    this.audioContextFactory = getAudioContextFactory(options);
    this.audioWorkletNodeFactory = options.audioWorkletNodeFactory
      || options.workletNodeFactory
      || null;
    this.AudioWorkletNode = options.AudioWorkletNode || null;
    this.workletUrl = options.workletUrl || CAPTURE_WORKLET_URL;
    this.processorName = options.processorName || CAPTURE_PROCESSOR_NAME;
    this.onFrame = options.onFrame || options.onPcmFrame || null;
    this.onError = options.onError || null;
    this.stopStreamOnCleanup = options.stopStreamOnCleanup ?? true;
    this.state = 'idle';
    this.context = null;
    this.source = null;
    this.workletNode = null;
    this.sink = null;
    this.stream = null;
    this._flushWaiters = [];
    this._startPromise = null;
    this.generation = 0;
    // DEV-only capture diagnostics scalars (bounded, no identifiers)
    this._captureDiagnostics = {
      sourceCreated: 0,
      workletCreated: 0,
      configurePosted: 0,
      configuredAck: 0,
      captureConfigured: false,
      sourceConnected: 0,
      sinkConnected: 0,
      contextResumed: 0,
      pcmMessages: 0,
      heartbeatCount: 0,
      lastHeartbeat: null,
      contextState: 'other',
      streamDiagnostics: null,
      processNeverObserved: false,
    };
    this._devHeartbeatTimeout = null;
    this._devLogEmitted = false;
  }

  async start(stream) {
    if (this.state === 'running') return this.getGraphInfo();
    if (this._startPromise) return this._startPromise;
    if (!stream) throw new TypeError('A MediaStream is required for capture');
    if (typeof this.audioContextFactory !== 'function') {
      throw createAudioError('INPUT_AUDIO_CONTEXT_UNAVAILABLE', 'AudioContext is unavailable');
    }

    this.state = 'starting';
    this.stream = stream;
    const generation = ++this.generation;
    this._startPromise = this._start(stream, generation);
    try {
      return await this._startPromise;
    } finally {
      this._startPromise = null;
    }
  }

  _getDiagnosticsSnapshot() {
    // safe scalar snapshot only, no identifiers / raw audio
    const d = this._captureDiagnostics || {};
    const s = d.streamDiagnostics || { audioTracks: 0, liveAudioTracks: 0, trackReady: false, trackMuted: false, trackEnabled: false };
    return {
      sourceCreated: d.sourceCreated ? 1 : 0,
      workletCreated: d.workletCreated ? 1 : 0,
      configurePosted: d.configurePosted ? 1 : 0,
      configuredAck: d.configuredAck ? 1 : 0,
      captureConfigured: d.captureConfigured === true,
      sourceConnected: d.sourceConnected ? 1 : 0,
      sinkConnected: d.sinkConnected ? 1 : 0,
      contextResumed: d.contextResumed ? 1 : 0,
      pcmMessages: Number.isInteger(d.pcmMessages) ? d.pcmMessages : 0,
      heartbeatCount: Number.isInteger(d.heartbeatCount) ? d.heartbeatCount : 0,
      lastHeartbeat: d.lastHeartbeat ? { ...d.lastHeartbeat } : null,
      contextState: d.contextState || 'other',
      audioTracks: s.audioTracks,
      liveAudioTracks: s.liveAudioTracks,
      trackReady: s.trackReady,
      trackMuted: s.trackMuted,
      trackEnabled: s.trackEnabled,
      processNeverObserved: d.processNeverObserved === true,
      sampleRate: this.context?.sampleRate ?? this.sampleRate,
      expectedSampleRate: this.sampleRate,
    };
  }

  _maybeLogDiagnostics(stage) {
    if (!isDevFirefoxDiagnostics() || this._devLogEmitted) return;
    // bounded single emission per session at RUNNING or when process never observed
    try {
      const snapshot = this._getDiagnosticsSnapshot();
      // structured log via console.debug (guarded, DEV-only) - no identifiers
      console.debug(`[LiveDubbing][CaptureDiagnostics][${stage}]`, snapshot);
    } catch { /* diagnostic ignore */ }
  }

  _clearDevHeartbeatTimeout() {
    if (this._devHeartbeatTimeout) {
      try { clearTimeout(this._devHeartbeatTimeout); } catch { /* diagnostic ignore */ }
      this._devHeartbeatTimeout = null;
    }
  }

  _scheduleProcessObserveCheck(generation) {
    if (!isDevFirefoxDiagnostics()) return;
    this._clearDevHeartbeatTimeout();
    // bounded one-shot check, does not keep session alive (cleared on teardown)
    try {
      this._devHeartbeatTimeout = setTimeout(() => {
        this._devHeartbeatTimeout = null;
        if (this.generation !== generation || this.state !== 'running') return;
        const d = this._captureDiagnostics;
        if (!d) return;
        const neverObserved = d.heartbeatCount === 0 && d.pcmMessages === 0;
        if (neverObserved) {
          d.processNeverObserved = true;
          this._maybeLogDiagnostics('processNeverObserved');
          // also log classification hint
          try {
            const snap = this._getDiagnosticsSnapshot();
            console.debug('[LiveDubbing][CaptureDiagnostics][classificationHint]', {
              // A track muted/inactive if trackReady false or muted true
              hintA_trackInactive: snap.trackReady === false || snap.trackMuted === true || snap.trackEnabled === false,
              // B graph not pulled if context not running or sink not connected
              hintB_graphNotPulled: snap.contextState !== 'running' || snap.sinkConnected === 0 || snap.sourceConnected === 0,
              // C zero input channels if heartbeat shows 0
              hintC_zeroInput: snap.heartbeatCount > 0 && snap.lastHeartbeat && snap.lastHeartbeat.channelCount === 0,
              // D samples but no PCM if heartbeat has samples but pcmMessages 0
              hintD_noPcmEmit: snap.heartbeatCount > 0 && snap.lastHeartbeat && snap.lastHeartbeat.sampleCount > 0 && snap.pcmMessages === 0,
              // E PCM leaves worklet but not received (would be Controller side)
              hintE_pcmNotReceived: snap.pcmMessages > 0,
            });
          } catch { /* diagnostic ignore */ }
        }
      }, 1200);
      // do not keep process alive if environment supports unref
      if (typeof this._devHeartbeatTimeout?.unref === 'function') {
        try { this._devHeartbeatTimeout.unref(); } catch { /* diagnostic ignore */ }
      }
    } catch { /* diagnostic ignore */ }
  }

  async _start(stream, generation) {
    // reset per-session DEV diagnostics
    if (isDevFirefoxDiagnostics()) {
      this._captureDiagnostics = {
        sourceCreated: 0,
        workletCreated: 0,
        configurePosted: 0,
        configuredAck: 0,
        captureConfigured: false,
        sourceConnected: 0,
        sinkConnected: 0,
        contextResumed: 0,
        pcmMessages: 0,
        heartbeatCount: 0,
        lastHeartbeat: null,
        contextState: 'other',
        streamDiagnostics: getStreamDiagnostics(stream),
        processNeverObserved: false,
      };
      this._devLogEmitted = false;
      this._clearDevHeartbeatTimeout();
    }
    try {
      try {
        this.context = await this.audioContextFactory({
          sampleRate: this.sampleRate,
        });
      } catch (error) {
        if (isCanonicalError(error)) throw error;
        throw createAudioError('INPUT_AUDIO_CONTEXT_CREATE_FAILED', 'Failed to create input AudioContext');
      }
      this._assertCurrentGeneration(generation);
      verifyInputAudioContext(this.context, this.sampleRate);
      if (isDevFirefoxDiagnostics()) {
        this._captureDiagnostics.contextState = getContextStateScalar(this.context);
        this._captureDiagnostics.streamDiagnostics = getStreamDiagnostics(stream);
      }

      if (typeof this.context.audioWorklet?.addModule !== 'function') {
        throw createAudioError('INPUT_AUDIO_WORKLET_UNAVAILABLE', 'AudioWorklet is unavailable');
      }
      try {
        await this.context.audioWorklet.addModule(this.workletUrl);
      } catch (error) {
        if (isCanonicalError(error)) throw error;
        throw createAudioError('INPUT_AUDIO_WORKLET_LOAD_FAILED', 'Failed to load capture worklet');
      }
      this._assertCurrentGeneration(generation);

      if (typeof this.context.createMediaStreamSource !== 'function'
        || typeof this.context.createGain !== 'function') {
        throw createAudioError('INPUT_AUDIO_GRAPH_UNAVAILABLE', 'Capture audio graph is unavailable');
      }

      try {
        this.source = this.context.createMediaStreamSource(stream);
        if (isDevFirefoxDiagnostics()) this._captureDiagnostics.sourceCreated = 1;
      } catch (error) {
        if (isCanonicalError(error)) throw error;
        throw createAudioError('INPUT_AUDIO_MEDIA_STREAM_SOURCE_FAILED', 'Failed to create capture media stream source');
      }
      try {
        this.workletNode = this._createWorkletNode();
        if (isDevFirefoxDiagnostics()) this._captureDiagnostics.workletCreated = 1;
      } catch (error) {
        if (isCanonicalError(error)) throw error;
        const mappedCode = getInputWorkletNodeErrorCode(error);
        throw createAudioError(mappedCode, getSafeInputWorkletNodeMessage(mappedCode));
      }
      try {
        this.workletNode.port.postMessage({
          type: 'configure',
          sampleRate: this.sampleRate,
          frameSamples: this.frameSamples,
          diagnosticsEnabled: isDevFirefoxDiagnostics() === true,
        });
        if (isDevFirefoxDiagnostics()) this._captureDiagnostics.configurePosted = 1;
      } catch {
        // Configure is best effort prior to graph connect; port availability is verified in _attachPort
      }
      try {
        this.sink = this.context.createGain();
        this.sink.gain.value = 0;
        this.sink.gain.setValueAtTime?.(0, this.context.currentTime || 0);

        this.source.connect(this.workletNode);
        if (isDevFirefoxDiagnostics()) this._captureDiagnostics.sourceConnected = 1;
        this.workletNode.connect(this.sink);
        this.sink.connect(this.context.destination);
        if (isDevFirefoxDiagnostics()) this._captureDiagnostics.sinkConnected = 1;
        this._attachPort(this.workletNode.port, this.workletNode, generation);
      } catch (error) {
        if (isCanonicalError(error)) throw error;
        throw createAudioError('INPUT_AUDIO_GRAPH_FAILED', 'Failed to connect capture audio graph');
      }

      try {
        await this.context.resume?.();
        if (isDevFirefoxDiagnostics()) {
          this._captureDiagnostics.contextResumed = 1;
          this._captureDiagnostics.contextState = getContextStateScalar(this.context);
        }
      } catch (error) {
        if (isCanonicalError(error)) throw error;
        throw createAudioError('INPUT_AUDIO_CONTEXT_RESUME_FAILED', 'Failed to resume input AudioContext');
      }
      this._assertCurrentGeneration(generation);
      this.state = 'running';
      if (isDevFirefoxDiagnostics()) {
        this._scheduleProcessObserveCheck(generation);
        // emit initial checkpoint (bounded, single)
        this._maybeLogDiagnostics('running');
        this._devLogEmitted = true;
      }
      return this.getGraphInfo();
    } catch (error) {
      await this._teardown();
      this.state = 'idle';
      throw error;
    }
  }

  _createWorkletNode() {
    const nodeOptions = {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    };
    if (typeof this.audioWorkletNodeFactory === 'function') {
      return this.audioWorkletNodeFactory(this.context, this.processorName, nodeOptions);
    }
    const AudioWorkletNodeConstructor = this.AudioWorkletNode || globalThis.AudioWorkletNode;
    if (typeof AudioWorkletNodeConstructor !== 'function') {
      throw createAudioError('INPUT_AUDIO_WORKLET_NODE_UNAVAILABLE', 'AudioWorkletNode is unavailable');
    }
    return new AudioWorkletNodeConstructor(this.context, this.processorName, nodeOptions);
  }

  _attachPort(port, node, generation) {
    if (!port) throw createAudioError('INPUT_AUDIO_PORT_UNAVAILABLE', 'Capture worklet port is unavailable');
    port.onmessage = event => {
      if (this.workletNode !== node || this.generation !== generation || this.state !== 'running') return;
      this._handleWorkletMessage(event);
    };
    port.start?.();
  }

  _handleWorkletMessage(event) {
    const data = event?.data || {};
    if (data.type === 'flushed') {
      const waiters = this._flushWaiters.splice(0);
      for (const resolve of waiters) resolve(data);
      return;
    }
    if (data.type === 'error') {
      const error = createAudioError(
        data.code || 'INPUT_AUDIO_WORKLET_FAILED',
        typeof data.message === 'string' ? data.message : 'Capture worklet failed',
      );
      this.onError?.(error);
      return;
    }
    // DEV diagnostics: captureConfigured ack (safe scalar, no payload)
    if (data.type === 'configured') {
      if (isDevFirefoxDiagnostics() && this._captureDiagnostics) {
        this._captureDiagnostics.configuredAck = 1;
        this._captureDiagnostics.captureConfigured = true;
      }
      return;
    }
    // DEV diagnostics: one-shot heartbeat (bounded, DEV Firefox only)
    if (data.type === 'captureHeartbeat' || data.type === 'heartbeat') {
      if (isDevFirefoxDiagnostics() && this._captureDiagnostics) {
        const count = Number.isInteger(data.channelCount) ? data.channelCount : 0;
        const samples = Number.isInteger(data.sampleCount) ? data.sampleCount : 0;
        const hasNonZero = data.hasNonZeroInput === true;
        // bounded: keep only first 3 heartbeats
        if (this._captureDiagnostics.heartbeatCount < 3) {
          this._captureDiagnostics.heartbeatCount += 1;
          this._captureDiagnostics.lastHeartbeat = {
            processCalled: true,
            channelCount: count,
            sampleCount: samples,
            hasNonZeroInput: hasNonZero,
          };
          // if we now have heartbeat, cancel never-observed flag
          this._captureDiagnostics.processNeverObserved = false;
          this._clearDevHeartbeatTimeout();
          // emit bounded diagnostic once when first heartbeat arrives
          if (this._captureDiagnostics.heartbeatCount === 1) {
            try {
              const snap = this._getDiagnosticsSnapshot();
              console.debug('[LiveDubbing][CaptureDiagnostics][heartbeat]', snap.lastHeartbeat);
            } catch { /* diagnostic ignore */ }
          }
        }
      }
      return;
    }
    if (data.type !== 'pcm') return;

    const buffer = getMessageBuffer(data);
    if (!buffer) return;
    if (isDevFirefoxDiagnostics() && this._captureDiagnostics) {
      this._captureDiagnostics.pcmMessages += 1;
      // if PCM now observed, clear never-observed check
      if (this._captureDiagnostics.pcmMessages === 1) {
        this._captureDiagnostics.processNeverObserved = false;
        this._clearDevHeartbeatTimeout();
      }
    }
    const frame = { ...data, buffer };
    delete frame.pcm;
    try {
      this.onFrame?.(frame);
    } catch (error) {
      this.onError?.(error);
    }
  }

  /** Ask the worklet to emit its final short sample frame, if any. */
  flush() {
    if (this.state !== 'running' || !this.workletNode?.port) return Promise.resolve(null);
    return new Promise(resolve => {
      this._flushWaiters.push(resolve);
      try {
        this.workletNode.port.postMessage({ type: 'flush' });
      } catch (error) {
        this._flushWaiters = this._flushWaiters.filter(waiter => waiter !== resolve);
        this.onError?.(error);
        resolve(null);
      }
    });
  }

  getCaptureDiagnostics() {
    if (!isDevFirefoxDiagnostics() || !this._captureDiagnostics) return null;
    return this._getDiagnosticsSnapshot();
  }

  // alias for tests
  getDiagnostics() {
    return this.getCaptureDiagnostics();
  }

  getGraphInfo() {
    const info = {
      state: this.state,
      sampleRate: this.sampleRate,
      frameSamples: this.frameSamples,
      channels: 1,
      processorName: this.processorName,
    };
    // DEV-only diagnostics exposure for tests / classification (safe scalars)
    if (isDevFirefoxDiagnostics() && this._captureDiagnostics) {
      info.captureDiagnostics = this._getDiagnosticsSnapshot();
    }
    return info;
  }

  async stop() {
    this.generation += 1;
    await this._teardown();
    this.state = 'idle';
    this._flushWaiters.splice(0).forEach(resolve => resolve(null));
  }

  dispose() {
    return this.stop();
  }

  cleanup() {
    return this.stop();
  }

  async _teardown() {
    const source = this.source;
    const workletNode = this.workletNode;
    const sink = this.sink;
    const context = this.context;
    const stream = this.stream;

    this.source = null;
    this.workletNode = null;
    this.sink = null;
    this.context = null;
    this.stream = null;

    this._clearDevHeartbeatTimeout();
    if (workletNode?.port) workletNode.port.onmessage = null;

    disconnect(source);
    disconnect(workletNode);
    disconnect(sink);
    closePort(workletNode?.port);
    await closeContext(context);
    if (this.stopStreamOnCleanup) stopStreamTracks(stream);
  }

  _assertCurrentGeneration(generation) {
    if (this.generation !== generation) {
      throw createAudioError('INPUT_AUDIO_START_CANCELLED', 'Capture setup was cancelled');
    }
  }
}

export const LiveDubbingTabAudioPipeline = TabAudioPipeline;

export default TabAudioPipeline;
