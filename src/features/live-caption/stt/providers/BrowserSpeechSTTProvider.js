import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  BaseSTTProvider,
  createSTTProviderError,
  normalizeSTTResult,
  STT_PROVIDER_ERROR_CODES,
  STT_PROVIDER_STATUS
} from '../BaseSTTProvider.js';

export const BROWSER_SPEECH_PROVIDER_ID = 'browser_speech';
export const BROWSER_SPEECH_PROVIDER_DISPLAY_NAME = 'Browser Speech';

function getSpeechRecognitionConstructor(recognitionConstructor = null) {
  return recognitionConstructor
    || globalThis.SpeechRecognition
    || globalThis.webkitSpeechRecognition
    || null;
}

function normalizeRecognitionTranscript(result = {}) {
  const alternatives = Array.isArray(result)
    ? result
    : typeof result.length === 'number'
      ? Array.from(result)
      : [];
  const firstAlternative = alternatives[0] || result[0] || result?.[0] || null;

  return typeof firstAlternative?.transcript === 'string'
    ? firstAlternative.transcript
    : typeof result.transcript === 'string'
      ? result.transcript
      : '';
}

function toMonotonicSegmentWindow(startMs, text = '') {
  const minimumDuration = 600;
  const estimatedDuration = Math.max(minimumDuration, Math.min(3000, String(text).length * 60));
  const endMs = startMs + estimatedDuration;
  return { segmentStartMs: startMs, segmentEndMs: endMs };
}

export class BrowserSpeechSTTProvider extends BaseSTTProvider {
  static id = BROWSER_SPEECH_PROVIDER_ID;
  static displayName = BROWSER_SPEECH_PROVIDER_DISPLAY_NAME;
  static mode = 'session';

  static isSupported(recognitionConstructor = null) {
    return Boolean(getSpeechRecognitionConstructor(recognitionConstructor));
  }

  constructor(options = {}) {
    super(BROWSER_SPEECH_PROVIDER_ID, {
      providerName: BROWSER_SPEECH_PROVIDER_DISPLAY_NAME,
      retryLimit: 0
    });

    this.logger = options.logger || getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, this.providerName);
    this.recognitionConstructor = options.recognitionConstructor || getSpeechRecognitionConstructor();
    this.recognition = null;
    this.sessionActive = false;
    this.sessionStartedAt = null;
    this.lastSegmentEndMs = 0;
    this.finalResultCount = 0;
    this.sessionContext = null;
    this.onTranscriptResult = null;
    this.onErrorCallback = null;
    this.onStatusChange = null;

    this.state = BrowserSpeechSTTProvider.isSupported(this.recognitionConstructor)
      ? STT_PROVIDER_STATUS.READY
      : STT_PROVIDER_STATUS.ERROR;
    this.lastUpdatedAt = Date.now();
  }

  _assertSupported() {
    if (!BrowserSpeechSTTProvider.isSupported(this.recognitionConstructor)) {
      throw createSTTProviderError(STT_PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND, 'Browser Speech STT is not supported in this browser', {
        providerId: this.providerId,
        providerName: this.providerName,
        stage: 'startup',
        retryable: false,
        type: ErrorTypes.API_CONFIG_INVALID
      });
    }
  }

  _emitStatusChange(status) {
    if (typeof this.onStatusChange === 'function') {
      Promise.resolve(this.onStatusChange(status)).catch((error) => {
        this.logger.debug('[BrowserSpeechSTTProvider] status callback failed', {
          providerId: this.providerId,
          error: error?.message ?? String(error)
        });
      });
    }
  }

  _emitTranscriptResult(result) {
    if (typeof this.onTranscriptResult !== 'function') {
      return;
    }

    Promise.resolve(this.onTranscriptResult(result, this.sessionContext)).catch((error) => {
      this.logger.error('[BrowserSpeechSTTProvider] transcript callback failed', {
        providerId: this.providerId,
        sessionId: this.sessionContext?.sessionId ?? null,
        error: error?.message ?? String(error)
      });
    });
  }

  _emitError(error) {
    if (typeof this.onErrorCallback !== 'function') {
      return;
    }

    Promise.resolve(this.onErrorCallback(error, this.sessionContext)).catch((callbackError) => {
      this.logger.error('[BrowserSpeechSTTProvider] error callback failed', {
        providerId: this.providerId,
        sessionId: this.sessionContext?.sessionId ?? null,
        error: callbackError?.message ?? String(callbackError)
      });
    });
  }

  _createRecognition() {
    const Recognition = getSpeechRecognitionConstructor(this.recognitionConstructor);
    if (typeof Recognition !== 'function') {
      this._assertSupported();
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (!this.sessionActive || this.state === STT_PROVIDER_STATUS.DISPOSED) {
        return;
      }

      const results = event?.results;
      const startIndex = Math.max(0, Number(event?.resultIndex ?? 0));

      for (let index = startIndex; index < (results?.length ?? 0); index += 1) {
        const result = results[index];
        if (!result?.isFinal) {
          continue;
        }

        const transcript = normalizeRecognitionTranscript(result).trim();
        if (!transcript) {
          continue;
        }

        const segmentStartMs = this.lastSegmentEndMs;
        const { segmentEndMs } = toMonotonicSegmentWindow(segmentStartMs, transcript);
        this.lastSegmentEndMs = segmentEndMs;
        this.finalResultCount += 1;

        const normalized = normalizeSTTResult({
          text: transcript,
          detectedLanguage: recognition.lang || this.sessionContext?.language || null,
          provider: this.providerId,
          isFinal: true,
          startTime: segmentStartMs,
          endTime: segmentEndMs
        }, this.providerId);

        this.logger.info('[BrowserSpeechSTTProvider] Final transcript result emitted', {
          providerId: this.providerId,
          sessionId: this.sessionContext?.sessionId ?? null,
          resultIndex: this.finalResultCount,
          charCount: normalized.text.length,
          segmentStartMs,
          segmentEndMs
        });

        this._emitTranscriptResult({
          ...normalized,
          segmentStartMs,
          segmentEndMs
        });
      }
    };

    recognition.onerror = (event) => {
      const message = event?.error || event?.message || 'Browser Speech recognition failed';
      const error = createSTTProviderError(STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED, message, {
        providerId: this.providerId,
        providerName: this.providerName,
        stage: 'transcription',
        retryable: false,
        type: ErrorTypes.API_RESPONSE_INVALID
      });

      this.state = STT_PROVIDER_STATUS.ERROR;
      this.lastError = error;
      this.lastUpdatedAt = Date.now();

      this.logger.warn('[BrowserSpeechSTTProvider] Recognition error', {
        providerId: this.providerId,
        sessionId: this.sessionContext?.sessionId ?? null,
        code: error.code,
        type: error.type
      });

      this._emitError(error);
      this._emitStatusChange(this.createStatus({
        ready: false,
        lastError: error
      }));
    };

    recognition.onend = () => {
      if (this.state !== STT_PROVIDER_STATUS.DISPOSED) {
        this.sessionActive = false;
        if (this.state !== STT_PROVIDER_STATUS.ERROR) {
          this.state = STT_PROVIDER_STATUS.READY;
          this.lastError = null;
        }
        this.lastUpdatedAt = Date.now();
        this._emitStatusChange(this.createStatus());
      }

      this.logger.debug('[BrowserSpeechSTTProvider] Recognition ended', {
        providerId: this.providerId,
        sessionId: this.sessionContext?.sessionId ?? null,
        finalResultCount: this.finalResultCount
      });
    };

    return recognition;
  }

  async startSession(context = {}) {
    this._assertSupported();

    if (this.sessionActive && this.state === STT_PROVIDER_STATUS.TRANSCRIBING) {
      return this.createStatus({
        ready: false,
        sessionId: this.sessionContext?.sessionId ?? context.sessionId ?? null,
        videoFingerprint: this.sessionContext?.videoFingerprint ?? context.videoFingerprint ?? null
      });
    }

    this.sessionContext = {
      sessionId: context.sessionId ?? this.sessionContext?.sessionId ?? null,
      tabId: context.tabId ?? this.sessionContext?.tabId ?? null,
      videoFingerprint: context.videoFingerprint ?? this.sessionContext?.videoFingerprint ?? null,
      language: context.language ?? context.lang ?? context.locale ?? this.sessionContext?.language ?? null
    };
    this.onTranscriptResult = context.onTranscriptResult || null;
    this.onErrorCallback = context.onError || null;
    this.onStatusChange = context.onStatusChange || null;

    if (!this.recognition) {
      this.recognition = this._createRecognition();
    }

    if (this.sessionContext.language && this.recognition) {
      this.recognition.lang = this.sessionContext.language;
    } else if (typeof navigator !== 'undefined' && navigator.language) {
      this.recognition.lang = navigator.language;
    }

    this.sessionStartedAt = Date.now();
    this.lastSegmentEndMs = 0;
    this.finalResultCount = 0;
    this.lastError = null;
    this.state = STT_PROVIDER_STATUS.TRANSCRIBING;
    this.sessionActive = true;
    this.lastUpdatedAt = Date.now();

    try {
      this.recognition.start();
    } catch (error) {
      const normalized = createSTTProviderError(STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED, error?.message || 'Browser Speech recognition failed to start', {
        providerId: this.providerId,
        providerName: this.providerName,
        stage: 'startup',
        retryable: false,
        type: ErrorTypes.API_RESPONSE_INVALID,
        cause: error
      });

      this.state = STT_PROVIDER_STATUS.ERROR;
      this.lastError = normalized;
      this.sessionActive = false;
      this.lastUpdatedAt = Date.now();
      this.logger.warn('[BrowserSpeechSTTProvider] Failed to start recognition', {
        providerId: this.providerId,
        sessionId: this.sessionContext?.sessionId ?? null,
        error: normalized.message
      });
      throw normalized;
    }

    this.logger.info('[BrowserSpeechSTTProvider] Recognition session started', {
      providerId: this.providerId,
      sessionId: this.sessionContext?.sessionId ?? null,
      tabId: this.sessionContext?.tabId ?? null,
      videoFingerprint: this.sessionContext?.videoFingerprint ?? null
    });

    return this.createStatus({
      ready: false,
      sessionId: this.sessionContext?.sessionId ?? null,
      videoFingerprint: this.sessionContext?.videoFingerprint ?? null
    });
  }

  async stopSession(context = {}) {
    if (!this.recognition) {
      return this.createStatus({
        ready: true,
        sessionId: context.sessionId ?? this.sessionContext?.sessionId ?? null,
        videoFingerprint: context.videoFingerprint ?? this.sessionContext?.videoFingerprint ?? null
      });
    }

    this.sessionContext = {
      sessionId: context.sessionId ?? this.sessionContext?.sessionId ?? null,
      tabId: context.tabId ?? this.sessionContext?.tabId ?? null,
      videoFingerprint: context.videoFingerprint ?? this.sessionContext?.videoFingerprint ?? null,
      language: context.language ?? this.sessionContext?.language ?? null
    };

    try {
      if (this.sessionActive && typeof this.recognition.stop === 'function') {
        this.recognition.stop();
      }
    } finally {
      this.sessionActive = false;
      this.state = STT_PROVIDER_STATUS.READY;
      this.lastUpdatedAt = Date.now();
      this._emitStatusChange(this.createStatus({
        ready: true
      }));
    }

    this.logger.debug('[BrowserSpeechSTTProvider] Recognition session stopped', {
      providerId: this.providerId,
      sessionId: this.sessionContext?.sessionId ?? null
    });

    return this.createStatus({
      ready: true,
      sessionId: this.sessionContext?.sessionId ?? null,
      videoFingerprint: this.sessionContext?.videoFingerprint ?? null
    });
  }

  async abortSession(context = {}) {
    if (!this.recognition) {
      return this.createStatus({
        ready: true,
        sessionId: context.sessionId ?? this.sessionContext?.sessionId ?? null,
        videoFingerprint: context.videoFingerprint ?? this.sessionContext?.videoFingerprint ?? null
      });
    }

    this.sessionContext = {
      sessionId: context.sessionId ?? this.sessionContext?.sessionId ?? null,
      tabId: context.tabId ?? this.sessionContext?.tabId ?? null,
      videoFingerprint: context.videoFingerprint ?? this.sessionContext?.videoFingerprint ?? null,
      language: context.language ?? this.sessionContext?.language ?? null
    };

    try {
      if (typeof this.recognition.abort === 'function') {
        this.recognition.abort();
      } else if (typeof this.recognition.stop === 'function') {
        this.recognition.stop();
      }
    } finally {
      this.sessionActive = false;
      this.state = STT_PROVIDER_STATUS.READY;
      this.lastUpdatedAt = Date.now();
      this._emitStatusChange(this.createStatus({
        ready: true
      }));
    }

    this.logger.debug('[BrowserSpeechSTTProvider] Recognition session aborted', {
      providerId: this.providerId,
      sessionId: this.sessionContext?.sessionId ?? null
    });

    return this.createStatus({
      ready: true,
      sessionId: this.sessionContext?.sessionId ?? null,
      videoFingerprint: this.sessionContext?.videoFingerprint ?? null
    });
  }

  async getStatus() {
    return this.createStatus({
      ready: BrowserSpeechSTTProvider.isSupported(this.recognitionConstructor) && this.state !== STT_PROVIDER_STATUS.ERROR && this.state !== STT_PROVIDER_STATUS.DISPOSED && !this.sessionActive,
      sessionId: this.sessionContext?.sessionId ?? null,
      videoFingerprint: this.sessionContext?.videoFingerprint ?? null
    });
  }

  async dispose() {
    try {
      if (this.recognition && this.sessionActive) {
        if (typeof this.recognition.abort === 'function') {
          this.recognition.abort();
        } else if (typeof this.recognition.stop === 'function') {
          this.recognition.stop();
        }
      }
    } finally {
      this.recognition = null;
      this.sessionActive = false;
      this.sessionStartedAt = null;
      this.lastSegmentEndMs = 0;
      this.finalResultCount = 0;
      this.sessionContext = null;
      this.onTranscriptResult = null;
      this.onErrorCallback = null;
      this.onStatusChange = null;
      this.state = STT_PROVIDER_STATUS.DISPOSED;
      this.lastUpdatedAt = Date.now();
    }

    return this.createStatus({
      ready: false,
      sessionId: null,
      videoFingerprint: null
    });
  }
}

export default BrowserSpeechSTTProvider;
