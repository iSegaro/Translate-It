import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  StreamingAudioSource,
  STREAMING_AUDIO_FORMATS,
  STREAMING_AUDIO_SOURCE_STATES,
  createStreamingAudioChunk
} from './StreamingAudioSource.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'MediaRecorderStreamingAudioSource');
let mediaRecorderSourceClockCounter = 0;

const DEFAULT_MIME_TYPE = 'audio/webm';
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

function createMediaRecorderSourceClockId(sourceId, sourceResetId) {
  mediaRecorderSourceClockCounter += 1;
  return `live-caption:media-recorder:${sourceId}:${sourceResetId}:${Date.now().toString(36)}:${mediaRecorderSourceClockCounter.toString(36)}`;
}

export class MediaRecorderStreamingAudioSource extends StreamingAudioSource {
  constructor({
    sourceId = 'media_recorder_streaming_audio_source',
    onChunk = null,
    onError = null,
    onStateChange = null,
    mediaRecorderFactory = null,
    logger: sourceLogger = logger
  } = {}) {
    super(sourceId, { logger: sourceLogger });

    this.onChunk = typeof onChunk === 'function' ? onChunk : null;
    this.onError = typeof onError === 'function' ? onError : null;
    this.onStateChange = typeof onStateChange === 'function' ? onStateChange : null;
    this.mediaRecorderFactory = typeof mediaRecorderFactory === 'function' ? mediaRecorderFactory : null;

    this.mediaStream = null;
    this.mediaRecorder = null;
    this.recorderState = 'inactive';
    this.chunkTimeslice = DEFAULT_TIMESLICE;
    this.chunkStartMs = 0;
    this.sourceClockId = null;
    this.sourceResetId = 0;
    this.sourceSequence = 0;
    this.segmentChunks = [];
    this.segmentBoundaryTimer = null;
    this.segmentRotationPending = false;
    this.activeRecorderMimeType = DEFAULT_MIME_TYPE;
  }

  _notifyStateChange(state, details = {}) {
    this.onStateChange?.(state, {
      sourceId: this.sourceId,
      recorderState: this.recorderState,
      ...details
    });
  }

  _clearSegmentTimer() {
    if (this.segmentBoundaryTimer) {
      clearTimeout(this.segmentBoundaryTimer);
      this.segmentBoundaryTimer = null;
    }
  }

  _scheduleSegmentBoundary() {
    this._clearSegmentTimer();

    if (!this.mediaRecorder || this.recorderState !== 'recording' || !Number.isFinite(this.chunkTimeslice) || this.chunkTimeslice <= 0) {
      return;
    }

    this.segmentBoundaryTimer = setTimeout(() => {
      this.segmentBoundaryTimer = null;

      if (!this.mediaRecorder || this.recorderState !== 'recording') {
        return;
      }

      this.segmentRotationPending = true;
      try {
        this.mediaRecorder.stop();
      } catch (error) {
        logger.warn('Error rotating MediaRecorder segment:', error);
        this.segmentRotationPending = false;
      }
    }, this.chunkTimeslice);
  }

  _emitFinalizedChunk(chunkPayload, { sessionId, tabId, videoFingerprint, chunkStartMs, chunkEndMs, mimeType }) {
    if (!chunkPayload || chunkPayload.size <= 0) {
      logger.debug('Skipping finalized chunk emission: empty payload', {
        sessionId,
        tabId,
        videoFingerprint,
        chunkStartMs,
        chunkEndMs
      });
      return null;
    }

    const normalizedChunk = createStreamingAudioChunk({
      payload: chunkPayload,
      format: STREAMING_AUDIO_FORMATS.WEBM_OPUS,
      mimeType: chunkPayload.type || mimeType || DEFAULT_MIME_TYPE,
      chunkStartMs,
      chunkEndMs,
      source: 'mediaRecorder',
      sessionId,
      tabId,
      videoFingerprint,
      metadata: {
        recorderMimeType: chunkPayload.type || mimeType || DEFAULT_MIME_TYPE
      }
    });

    this.sourceSequence += 1;
    this.onChunk?.(normalizedChunk);
    return normalizedChunk;
  }

  _resetSourceClockLineage() {
    this.sourceResetId += 1;
    this.sourceClockId = createMediaRecorderSourceClockId(this.sourceId, this.sourceResetId);
    this.sourceSequence = 0;
  }

  _handleMediaRecorderStop() {
    const sessionId = this.session?.sessionId ?? null;
    const tabId = this.session?.tabId ?? null;
    const videoFingerprint = this.session?.videoFingerprint ?? null;
    const chunkStartMs = this.chunkStartMs;
    const chunkEndMs = chunkStartMs + this.chunkTimeslice;
    const mimeType = this.activeRecorderMimeType || this.mediaRecorder?.mimeType || DEFAULT_MIME_TYPE;
    const bufferedChunks = Array.isArray(this.segmentChunks) ? this.segmentChunks.slice() : [];
    const shouldRestart = this.segmentRotationPending && this.recorderState === 'recording' && Boolean(this.mediaStream);
    const shouldEmit = this.segmentRotationPending && this.recorderState === 'recording';

    this.segmentRotationPending = false;
    this.segmentChunks = [];
    this.mediaRecorder = null;

    if (!shouldEmit) {
      logger.debug('Skipping finalized MediaRecorder stop flush: not a segment rotation', {
        sessionId,
        tabId,
        videoFingerprint,
        chunkStartMs,
        chunkEndMs,
        recorderState: this.recorderState
      });
      if (shouldRestart && this.mediaStream && this.session?.sessionId && this.session?.tabId && this.session?.videoFingerprint) {
        this._startMediaRecorder(this.mediaStream, mimeType);
      }
      return;
    }

    if (bufferedChunks.length > 0) {
      const finalizedBlob = new Blob(bufferedChunks, { type: mimeType });
      this._emitFinalizedChunk(finalizedBlob, {
        sessionId,
        tabId,
        videoFingerprint,
        chunkStartMs,
        chunkEndMs,
        mimeType: finalizedBlob.type || mimeType
      });
      this.chunkStartMs = chunkEndMs;
    } else {
      logger.debug('Empty finalized MediaRecorder segment ignored', {
        sessionId,
        tabId,
        videoFingerprint,
        chunkStartMs,
        chunkEndMs
      });
    }

    if (shouldRestart && this.mediaStream && this.session?.sessionId && this.session?.tabId && this.session?.videoFingerprint) {
      this._startMediaRecorder(this.mediaStream, mimeType);
    } else {
      this.recorderState = 'inactive';
      this._setState(STREAMING_AUDIO_SOURCE_STATES.IDLE, {
        sessionId,
        tabId,
        videoFingerprint
      });
      this._notifyStateChange('idle', {
        sessionId,
        tabId,
        videoFingerprint
      });
    }
  }

  _resolveMediaRecorderFactory() {
    if (this.mediaRecorderFactory) {
      return this.mediaRecorderFactory;
    }

    if (typeof globalThis.MediaRecorder === 'function') {
      return (stream, options) => new globalThis.MediaRecorder(stream, options);
    }

    return null;
  }

  _startMediaRecorder(stream, selectedMime) {
    const recorderFactory = this._resolveMediaRecorderFactory();
    if (!recorderFactory) {
      throw new Error('MediaRecorder is not supported in this environment');
    }

    const recorder = recorderFactory(stream, selectedMime ? { mimeType: selectedMime } : {});
    this.mediaRecorder = recorder;
    this.activeRecorderMimeType = recorder.mimeType || selectedMime || DEFAULT_MIME_TYPE;
    this.segmentChunks = [];
    this.recorderState = 'recording';

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.segmentChunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      this._handleMediaRecorderStop();
    };

    recorder.onerror = (event) => {
      logger.error('MediaRecorder runtime error:', event.error);
      this.onError?.(event.error || new Error('MediaRecorder runtime error'));
    };

    recorder.start();
    this._scheduleSegmentBoundary();
    this._setState(STREAMING_AUDIO_SOURCE_STATES.ACTIVE, {
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null
    });
    this._notifyStateChange('capturing', {
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null
    });
  }

  async start(sessionConfig, {
    stream,
    mimeType = DEFAULT_MIME_TYPE,
    chunkTimeslice = DEFAULT_TIMESLICE
  } = {}) {
    const normalizedSession = this._normalizeSessionConfig(sessionConfig);

    this.session = {
      ...normalizedSession,
      startedAt: normalizedSession.timestamp,
      stoppedAt: null,
      destroyedAt: null
    };
    this.mediaStream = stream ?? null;
    this.chunkTimeslice = normalizeOptionalNumber(chunkTimeslice, DEFAULT_TIMESLICE) ?? DEFAULT_TIMESLICE;
    this.chunkStartMs = 0;
    this._resetSourceClockLineage();
    this.segmentRotationPending = false;
    this.lastError = null;

    this._setState(STREAMING_AUDIO_SOURCE_STATES.STARTING, {
      sessionId: normalizedSession.sessionId,
      tabId: normalizedSession.tabId,
      videoFingerprint: normalizedSession.videoFingerprint
    });
    this._notifyStateChange('starting', {
      sessionId: normalizedSession.sessionId,
      tabId: normalizedSession.tabId,
      videoFingerprint: normalizedSession.videoFingerprint
    });

    this._startMediaRecorder(stream, normalizeOptionalString(mimeType) || DEFAULT_MIME_TYPE);

    return this._createSessionSnapshot();
  }

  async pause() {
    if (!this.mediaRecorder || this.recorderState !== 'recording') {
      return this._createSessionSnapshot();
    }

    try {
      this._clearSegmentTimer();
      this.segmentRotationPending = false;
      this.mediaRecorder.pause();
      this.recorderState = 'paused';
      this._notifyStateChange('paused', {
        sessionId: this.session?.sessionId ?? null,
        tabId: this.session?.tabId ?? null,
        videoFingerprint: this.session?.videoFingerprint ?? null
      });
    } catch (error) {
      logger.warn('Error pausing MediaRecorder:', error);
    }

    return this._createSessionSnapshot();
  }

  async resume() {
    if (!this.mediaRecorder || this.recorderState !== 'paused') {
      return this._createSessionSnapshot();
    }

    try {
      this.mediaRecorder.resume();
      this._scheduleSegmentBoundary();
      this.recorderState = 'recording';
      this._notifyStateChange('capturing', {
        sessionId: this.session?.sessionId ?? null,
        tabId: this.session?.tabId ?? null,
        videoFingerprint: this.session?.videoFingerprint ?? null
      });
    } catch (error) {
      logger.warn('Error resuming MediaRecorder:', error);
    }

    return this._createSessionSnapshot();
  }

  async stop() {
    this._clearSegmentTimer();
    this.segmentRotationPending = false;

    if (this.mediaRecorder) {
      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch (error) {
        logger.warn('Error stopping MediaRecorder:', error);
      }
    }

    this.mediaRecorder = null;
    this.recorderState = 'inactive';
    this._setState(STREAMING_AUDIO_SOURCE_STATES.IDLE, {
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null
    });
    this._notifyStateChange('idle', {
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null
    });

    if (this.session) {
      this.session.stoppedAt = Date.now();
    }

    return this._createSessionSnapshot();
  }

  async destroy() {
    await this.stop();

    if (this.session) {
      this.session.destroyedAt = Date.now();
    }

    this._setState(STREAMING_AUDIO_SOURCE_STATES.DESTROYED, {
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null
    });
    this._notifyStateChange('idle', {
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null,
      destroyed: true
    });
    this.mediaStream = null;
    this.segmentChunks = [];
    return this._createSessionSnapshot();
  }

  getSourceClockSnapshot() {
    if (!this.sourceClockId) {
      return null;
    }

    return Object.freeze({
      sourceMs: this.chunkStartMs,
      sourceClockId: this.sourceClockId,
      sourceResetId: this.sourceResetId,
      sourceTimelineType: 'capture',
      sourceSequence: this.sourceSequence,
      captureState: this.recorderState === 'recording'
        ? 'capturing'
        : this.recorderState === 'paused'
          ? 'paused'
          : this.recorderState === 'inactive'
            ? this.destroyed
              ? 'destroyed'
              : 'idle'
            : this.recorderState,
      wallClockMs: Date.now()
    });
  }
}

export default MediaRecorderStreamingAudioSource;
