import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  StreamingAudioSource,
  STREAMING_AUDIO_FORMATS,
  STREAMING_AUDIO_SOURCE_STATES,
  createStreamingAudioChunk
} from './StreamingAudioSource.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'AudioWorkletPcm16StreamingAudioSource');

export const AUDIO_WORKLET_PCM16_MONO_STREAMING_PROCESSOR_NAME = 'pcm16-mono-streaming-processor';
export const AUDIO_WORKLET_PCM16_MONO_STREAMING_SAMPLE_RATE = 16000;
export const AUDIO_WORKLET_PCM16_MONO_STREAMING_CHANNEL_COUNT = 1;
export const AUDIO_WORKLET_PCM16_MONO_STREAMING_BIT_DEPTH = 16;
export const AUDIO_WORKLET_PCM16_MONO_STREAMING_MIME_TYPE = 'audio/pcm';

const DEFAULT_TIMESLICE = 3000;

function normalizeOptionalNumber(value, fallback = null) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeOptionalString(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function toFloat32Array(samples) {
  if (!samples) {
    return null;
  }

  if (samples instanceof Float32Array) {
    return samples;
  }

  if (samples instanceof ArrayBuffer) {
    return new Float32Array(samples);
  }

  if (ArrayBuffer.isView(samples)) {
    return new Float32Array(samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength));
  }

  if (Array.isArray(samples)) {
    return Float32Array.from(samples);
  }

  return null;
}

function concatFloat32Arrays(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return new Float32Array(0);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + (chunk?.length ?? 0), 0);
  if (totalLength <= 0) {
    return new Float32Array(0);
  }

  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    if (!(chunk instanceof Float32Array) || chunk.length === 0) {
      continue;
    }

    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function resampleMonoBuffer(input, inputSampleRate, targetSampleRate) {
  const sourceRate = Number.isFinite(Number(inputSampleRate)) ? Number(inputSampleRate) : targetSampleRate;
  const destinationRate = Number.isFinite(Number(targetSampleRate)) ? Number(targetSampleRate) : sourceRate;
  const source = input instanceof Float32Array ? input : new Float32Array(0);

  if (source.length === 0) {
    return new Float32Array(0);
  }

  if (sourceRate <= 0 || destinationRate <= 0 || sourceRate === destinationRate) {
    return source.slice();
  }

  const outputLength = Math.max(1, Math.round(source.length * (destinationRate / sourceRate)));
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / destinationRate;

  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * ratio;
    const lowerIndex = Math.floor(sourcePosition);
    const upperIndex = Math.min(source.length - 1, lowerIndex + 1);
    const fraction = sourcePosition - lowerIndex;
    const lowerValue = source[lowerIndex] ?? 0;
    const upperValue = source[upperIndex] ?? lowerValue;
    output[index] = lowerValue + ((upperValue - lowerValue) * fraction);
  }

  return output;
}

function encodePcm16LittleEndian(samples) {
  const source = samples instanceof Float32Array ? samples : new Float32Array(0);
  const buffer = new ArrayBuffer(source.length * 2);
  const view = new DataView(buffer);

  for (let index = 0; index < source.length; index += 1) {
    const value = Math.max(-1, Math.min(1, source[index] ?? 0));
    const encoded = value < 0 ? Math.round(value * 0x8000) : Math.round(value * 0x7fff);
    view.setInt16(index * 2, encoded, true);
  }

  return new Uint8Array(buffer);
}

export class AudioWorkletPcm16StreamingAudioSource extends StreamingAudioSource {
  constructor({
    sourceId = 'audio_worklet_pcm16_streaming_audio_source',
    onChunk = null,
    onError = null,
    onStateChange = null,
    audioContextFactory = null,
    audioWorkletNodeFactory = null,
    audioWorkletModuleUrl = new URL('./worklets/pcm16MonoStreamingProcessor.js', import.meta.url),
    logger: sourceLogger = logger
  } = {}) {
    super(sourceId, { logger: sourceLogger });

    this.onChunk = typeof onChunk === 'function' ? onChunk : null;
    this.onError = typeof onError === 'function' ? onError : null;
    this.onStateChange = typeof onStateChange === 'function' ? onStateChange : null;
    this.audioContextFactory = typeof audioContextFactory === 'function' ? audioContextFactory : null;
    this.audioWorkletNodeFactory = typeof audioWorkletNodeFactory === 'function' ? audioWorkletNodeFactory : null;
    this.audioWorkletModuleUrl = audioWorkletModuleUrl;

    this.targetSampleRate = AUDIO_WORKLET_PCM16_MONO_STREAMING_SAMPLE_RATE;
    this.channelCount = AUDIO_WORKLET_PCM16_MONO_STREAMING_CHANNEL_COUNT;
    this.bitDepth = AUDIO_WORKLET_PCM16_MONO_STREAMING_BIT_DEPTH;
    this.chunkTimeslice = DEFAULT_TIMESLICE;
    this.chunkStartMs = 0;
    this.mediaStream = null;
    this.mediaStreamSource = null;
    this.audioContext = null;
    this.audioWorkletNode = null;
    this.messagePort = null;
    this.pendingFrames = [];
    this.inputSampleRate = null;
    this.flushTimer = null;
    this.captureState = 'idle';
    this.audioContextState = 'closed';
    this.destroyed = false;
  }

  _notifyStateChange(state, details = {}) {
    this.onStateChange?.(state, {
      sourceId: this.sourceId,
      captureState: this.captureState,
      audioContextState: this.audioContextState,
      ...details
    });
  }

  _setCaptureState(state, details = {}) {
    this.captureState = state;
    this._setState(
      state === 'destroyed' ? STREAMING_AUDIO_SOURCE_STATES.DESTROYED
        : state === 'error' ? STREAMING_AUDIO_SOURCE_STATES.ERROR
          : state === 'paused' ? STREAMING_AUDIO_SOURCE_STATES.ACTIVE
            : state === 'capturing' ? STREAMING_AUDIO_SOURCE_STATES.ACTIVE
              : state === 'stopping' ? STREAMING_AUDIO_SOURCE_STATES.STOPPING
                : state === 'starting' ? STREAMING_AUDIO_SOURCE_STATES.STARTING
                  : STREAMING_AUDIO_SOURCE_STATES.IDLE,
      details
    );
    this._notifyStateChange(state, details);
  }

  _clearFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  _scheduleFlushTimer() {
    this._clearFlushTimer();

    if (!Number.isFinite(this.chunkTimeslice) || this.chunkTimeslice <= 0) {
      return;
    }

    this.flushTimer = setInterval(() => {
      void this._flushPendingFrames();
    }, this.chunkTimeslice);
  }

  _appendFrame(samples, sampleRate = null) {
    const monoSamples = toFloat32Array(samples);
    if (!monoSamples || monoSamples.length === 0) {
      return;
    }

    this.pendingFrames.push(monoSamples);
    this.inputSampleRate = Number.isFinite(Number(sampleRate))
      ? Number(sampleRate)
      : (this.inputSampleRate ?? this.audioContext?.sampleRate ?? this.targetSampleRate);
  }

  _extractChunkTiming(sampleCount) {
    const durationMs = sampleCount > 0
      ? Math.max(1, Math.round((sampleCount / this.targetSampleRate) * 1000))
      : 0;

    const chunkStartMs = this.chunkStartMs;
    const chunkEndMs = chunkStartMs + durationMs;
    this.chunkStartMs = chunkEndMs;

    return { chunkStartMs, chunkEndMs };
  }

  _emitChunk(pcmBytes, sampleCount) {
    if (!pcmBytes || pcmBytes.length === 0) {
      return null;
    }

    const { chunkStartMs, chunkEndMs } = this._extractChunkTiming(sampleCount);
    const chunk = createStreamingAudioChunk({
      payload: pcmBytes,
      format: STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ,
      mimeType: AUDIO_WORKLET_PCM16_MONO_STREAMING_MIME_TYPE,
      sampleRate: this.targetSampleRate,
      channelCount: this.channelCount,
      bitDepth: this.bitDepth,
      chunkStartMs,
      chunkEndMs,
      source: 'audioWorklet',
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null,
      metadata: {
        inputSampleRate: this.inputSampleRate ?? this.audioContext?.sampleRate ?? this.targetSampleRate,
        processorName: AUDIO_WORKLET_PCM16_MONO_STREAMING_PROCESSOR_NAME,
        sourceId: this.sourceId
      }
    });

    this.onChunk?.(chunk);
    return chunk;
  }

  async _flushPendingFrames() {
    if (!Array.isArray(this.pendingFrames) || this.pendingFrames.length === 0) {
      return null;
    }

    const pendingFrames = this.pendingFrames;
    this.pendingFrames = [];
    const sourceSamples = concatFloat32Arrays(pendingFrames);
    const resampled = resampleMonoBuffer(
      sourceSamples,
      this.inputSampleRate ?? this.audioContext?.sampleRate ?? this.targetSampleRate,
      this.targetSampleRate
    );
    const pcmBytes = encodePcm16LittleEndian(resampled);
    return this._emitChunk(pcmBytes, resampled.length);
  }

  async _createAudioContext(audioContextOptions = {}) {
    if (this.audioContextFactory) {
      return this.audioContextFactory({
        sampleRate: this.targetSampleRate,
        channelCount: this.channelCount,
        bitDepth: this.bitDepth,
        ...audioContextOptions
      });
    }

    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (typeof AudioContextCtor !== 'function') {
      throw new Error('AudioContext is not supported in this environment');
    }

    return new AudioContextCtor({
      sampleRate: this.targetSampleRate,
      latencyHint: 'interactive',
      ...audioContextOptions
    });
  }

  _createAudioWorkletNode(audioContext, processorOptions = {}) {
    const nodeOptions = {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      processorOptions: {
        targetSampleRate: this.targetSampleRate,
        chunkTimeslice: this.chunkTimeslice,
        ...processorOptions
      }
    };

    if (this.audioWorkletNodeFactory) {
      return this.audioWorkletNodeFactory(audioContext, AUDIO_WORKLET_PCM16_MONO_STREAMING_PROCESSOR_NAME, nodeOptions);
    }

    const AudioWorkletNodeCtor = globalThis.AudioWorkletNode;
    if (typeof AudioWorkletNodeCtor !== 'function') {
      throw new Error('AudioWorkletNode is not supported in this environment');
    }

    return new AudioWorkletNodeCtor(audioContext, AUDIO_WORKLET_PCM16_MONO_STREAMING_PROCESSOR_NAME, nodeOptions);
  }

  _attachWorkletPortHandlers() {
    if (!this.messagePort) {
      return;
    }

    this.messagePort.onmessage = (event) => {
      const payload = event?.data ?? {};

      if (payload?.type === 'frame') {
        this._appendFrame(payload.samples ?? payload.frame ?? payload.buffer ?? null, payload.sampleRate ?? null);
        return;
      }

      if (payload?.type === 'error') {
        const error = payload.error instanceof Error
          ? payload.error
          : new Error(typeof payload.error === 'string' ? payload.error : 'Audio worklet streaming error');
        this.lastError = error;
        this.onError?.(error);
      }
    };
  }

  async _connectGraph(stream, processorOptions = {}) {
    this.audioContext = await this._createAudioContext(processorOptions.audioContextOptions ?? {});
    this.audioContextState = this.audioContext?.state ?? 'running';

    if (this.audioContext?.audioWorklet?.addModule) {
      await this.audioContext.audioWorklet.addModule(this.audioWorkletModuleUrl);
    }

    if (!stream || typeof this.audioContext.createMediaStreamSource !== 'function') {
      throw new Error('AudioWorkletPcm16StreamingAudioSource requires a MediaStream source');
    }

    this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
    this.audioWorkletNode = this._createAudioWorkletNode(this.audioContext, processorOptions.processorOptions ?? {});
    this.messagePort = this.audioWorkletNode?.port ?? null;
    this._attachWorkletPortHandlers();

    if (typeof this.mediaStreamSource.connect === 'function') {
      this.mediaStreamSource.connect(this.audioWorkletNode);
    }

    this.audioContextState = this.audioContext?.state ?? 'running';
  }

  async _suspendAudioContext() {
    if (this.audioContext && typeof this.audioContext.suspend === 'function') {
      try {
        await this.audioContext.suspend();
      } catch (error) {
        logger.warn('Failed to suspend AudioContext:', error);
      }
    }
    this.audioContextState = this.audioContext?.state ?? 'suspended';
  }

  async _resumeAudioContext() {
    if (this.audioContext && typeof this.audioContext.resume === 'function') {
      try {
        await this.audioContext.resume();
      } catch (error) {
        logger.warn('Failed to resume AudioContext:', error);
      }
    }
    this.audioContextState = this.audioContext?.state ?? 'running';
  }

  async _closeAudioContext() {
    if (this.audioContext && typeof this.audioContext.close === 'function') {
      try {
        await this.audioContext.close();
      } catch (error) {
        logger.warn('Failed to close AudioContext:', error);
      }
    }
    this.audioContextState = 'closed';
  }

  _disconnectGraph() {
    try {
      if (this.messagePort) {
        this.messagePort.onmessage = null;
        if (typeof this.messagePort.close === 'function') {
          this.messagePort.close();
        }
      }
    } catch (error) {
      logger.warn('Failed to close AudioWorklet message port:', error);
    }

    try {
      if (this.audioWorkletNode && typeof this.audioWorkletNode.disconnect === 'function') {
        this.audioWorkletNode.disconnect();
      }
    } catch (error) {
      logger.warn('Failed to disconnect AudioWorkletNode:', error);
    }

    try {
      if (this.mediaStreamSource && typeof this.mediaStreamSource.disconnect === 'function') {
        this.mediaStreamSource.disconnect();
      }
    } catch (error) {
      logger.warn('Failed to disconnect MediaStreamAudioSourceNode:', error);
    }

    this.messagePort = null;
    this.audioWorkletNode = null;
    this.mediaStreamSource = null;
  }

  async _cleanupResources() {
    this._clearFlushTimer();
    this.pendingFrames = [];
    this.segmentRotationPending = false;

    this._disconnectGraph();
    await this._suspendAudioContext();
    await this._closeAudioContext();

    this.mediaStream = null;
    this.audioContext = null;
  }

  async start(sessionConfig, {
    stream,
    chunkTimeslice = DEFAULT_TIMESLICE,
    audioContextOptions = {},
    processorOptions = {},
    audioWorkletModuleUrl = null
  } = {}) {
    const normalizedSession = this._normalizeSessionConfig(sessionConfig);

    this.session = {
      ...normalizedSession,
      audioFormat: STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ,
      sampleRate: this.targetSampleRate,
      channelCount: this.channelCount,
      bitDepth: this.bitDepth,
      startedAt: normalizedSession.timestamp,
      stoppedAt: null,
      destroyedAt: null
    };
    this.mediaStream = stream ?? null;
    this.chunkTimeslice = normalizeOptionalNumber(chunkTimeslice, DEFAULT_TIMESLICE) ?? DEFAULT_TIMESLICE;
    this.chunkStartMs = 0;
    this.pendingFrames = [];
    this.inputSampleRate = null;
    this.destroyed = false;
    this.lastError = null;

    this._setCaptureState('starting', {
      sessionId: normalizedSession.sessionId,
      tabId: normalizedSession.tabId,
      videoFingerprint: normalizedSession.videoFingerprint
    });

    try {
      if (audioWorkletModuleUrl) {
        this.audioWorkletModuleUrl = audioWorkletModuleUrl;
      }

      await this._connectGraph(stream, {
        audioContextOptions,
        processorOptions
      });
      this._scheduleFlushTimer();
      this._setCaptureState('capturing', {
        sessionId: normalizedSession.sessionId,
        tabId: normalizedSession.tabId,
        videoFingerprint: normalizedSession.videoFingerprint
      });
      return this._createSessionSnapshot();
    } catch (error) {
      this.lastError = error;
      await this._cleanupResources().catch(() => {});
      this._setCaptureState('error', {
        sessionId: normalizedSession.sessionId,
        tabId: normalizedSession.tabId,
        videoFingerprint: normalizedSession.videoFingerprint,
        error: error?.message ?? null
      });
      throw error;
    }
  }

  async pause() {
    if (!this.audioContext || this.captureState !== 'capturing') {
      return this._createSessionSnapshot();
    }

    this._clearFlushTimer();
    await this._suspendAudioContext();
    this._setCaptureState('paused', {
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null
    });
    return this._createSessionSnapshot();
  }

  async resume() {
    if (!this.audioContext || this.captureState !== 'paused') {
      return this._createSessionSnapshot();
    }

    await this._resumeAudioContext();
    this._scheduleFlushTimer();
    this._setCaptureState('capturing', {
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null
    });
    return this._createSessionSnapshot();
  }

  async stop() {
    if (this.destroyed) {
      return this._createSessionSnapshot();
    }

    this._setCaptureState('stopping', {
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null
    });

    this._clearFlushTimer();
    await this._flushPendingFrames();
    await this._cleanupResources();

    if (this.session) {
      this.session.stoppedAt = Date.now();
    }

    this._setCaptureState('idle', {
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null
    });
    return this._createSessionSnapshot();
  }

  async destroy() {
    if (this.destroyed) {
      return this._createSessionSnapshot();
    }

    await this.stop();
    this.destroyed = true;

    if (this.session) {
      this.session.destroyedAt = Date.now();
    }

    this._setCaptureState('destroyed', {
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null
    });
    this.session = this.session
      ? {
          ...this.session,
          providerOptions: { ...this.session.providerOptions },
          metadata: { ...this.session.metadata }
        }
      : null;
    return this._createSessionSnapshot();
  }
}

export {
  concatFloat32Arrays,
  encodePcm16LittleEndian,
  resampleMonoBuffer
};

export default AudioWorkletPcm16StreamingAudioSource;
