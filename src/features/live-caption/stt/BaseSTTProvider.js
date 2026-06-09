import { CONFIG } from '@/shared/config/config.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { isTransientError } from '@/shared/error-management/ErrorMatcher.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { createLiveCaptionNotImplementedError } from '../core/contracts.js';

export const STT_PROVIDER_STATUS = Object.freeze({
  IDLE: 'idle',
  READY: 'ready',
  TRANSCRIBING: 'transcribing',
  RETRYING: 'retrying',
  ERROR: 'error',
  DISPOSED: 'disposed'
});

export const STT_PROVIDER_ERROR_CODES = Object.freeze({
  PROVIDER_NOT_FOUND: 'provider_not_found',
  INVALID_AUDIO_CHUNK: 'invalid_audio_chunk',
  MISSING_API_KEY: 'missing_api_key',
  INVALID_API_KEY: 'invalid_api_key',
  TRANSCRIPTION_FAILED: 'transcription_failed',
  RETRY_EXHAUSTED: 'retry_exhausted'
});

export function normalizeSTTResult(result = {}, providerId = null, fallback = {}) {
  const rawText = result?.text ?? result?.transcript ?? fallback.text ?? '';
  const detectedLanguage = result?.detectedLanguage ?? result?.language ?? fallback.detectedLanguage ?? null;
  const confidence = result?.confidence ?? result?.avgLogprob ?? result?.avg_logprob ?? fallback.confidence ?? null;
  const startTime = result?.startTime ?? result?.start ?? fallback.startTime ?? null;
  const endTime = result?.endTime ?? result?.end ?? fallback.endTime ?? null;
  const isFinal = result?.isFinal ?? fallback.isFinal ?? true;
  const normalizedConfidence = confidence == null ? null : Number(confidence);
  const normalizedStartTime = startTime == null ? null : Number(startTime);
  const normalizedEndTime = endTime == null ? null : Number(endTime);

  return Object.freeze({
    text: typeof rawText === 'string' ? rawText : String(rawText ?? ''),
    detectedLanguage,
    confidence: Number.isFinite(normalizedConfidence) ? normalizedConfidence : null,
    startTime: Number.isFinite(normalizedStartTime) ? normalizedStartTime : null,
    endTime: Number.isFinite(normalizedEndTime) ? normalizedEndTime : null,
    isFinal: Boolean(isFinal),
    provider: result?.provider ?? providerId ?? fallback.provider ?? null
  });
}

export function createSTTProviderStatus(providerId, state = STT_PROVIDER_STATUS.IDLE, details = {}) {
  return Object.freeze({
    providerId,
    state,
    retryCount: details.retryCount ?? 0,
    ready: details.ready ?? state === STT_PROVIDER_STATUS.READY,
    lastError: details.lastError ?? null,
    lastUpdatedAt: details.lastUpdatedAt ?? Date.now(),
    sessionId: details.sessionId ?? null,
    videoFingerprint: details.videoFingerprint ?? null
  });
}

export function createSTTProviderError(code, message, options = {}) {
  const error = new Error(message || 'Live caption STT provider error');
  error.name = 'LiveCaptionSTTProviderError';
  error.code = code;
  error.type = options.type || ErrorTypes.UNKNOWN;
  error.providerId = options.providerId ?? null;
  error.providerName = options.providerName ?? null;
  error.stage = options.stage ?? 'transcription';
  error.statusCode = options.statusCode ?? null;
  error.retryable = Boolean(options.retryable);
  error.details = options.details ?? null;
  error.cause = options.cause ?? null;
  error.at = options.at ?? Date.now();
  return error;
}

export function isRetryableSTTError(error) {
  if (!error) {
    return false;
  }

  if (error.retryable === true) {
    return true;
  }

  const statusCode = error.statusCode ?? error.status ?? null;
  if ([429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }

  return isTransientError(error);
}

export function normalizeSTTProviderError(error, options = {}) {
  const providerId = options.providerId ?? null;
  const providerName = options.providerName ?? providerId ?? null;
  const stage = options.stage ?? 'transcription';

  if (!error) {
    return createSTTProviderError(STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED, 'Live caption transcription failed', {
      providerId,
      providerName,
      stage,
      retryable: false,
      type: ErrorTypes.UNKNOWN
    });
  }

  if (error.code && error.providerId === providerId) {
    return error;
  }

  const statusCode = error.statusCode ?? error.status ?? null;
  const message = error.message || 'Live caption transcription failed';

  if (error.type === ErrorTypes.API_KEY_MISSING || statusCode === 401 || statusCode === 403 || error.type === ErrorTypes.API_KEY_INVALID) {
    return createSTTProviderError(STT_PROVIDER_ERROR_CODES.INVALID_API_KEY, message, {
      providerId,
      providerName,
      stage,
      statusCode,
      retryable: false,
      type: ErrorTypes.API_KEY_INVALID,
      cause: error
    });
  }

  const retryable = isRetryableSTTError(error);
  const type = error.type || (retryable ? ErrorTypes.NETWORK_ERROR : ErrorTypes.API_RESPONSE_INVALID);

  return createSTTProviderError(
    retryable ? STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED : STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED,
    message,
    {
      providerId,
      providerName,
      stage,
      statusCode,
      retryable,
      type,
      cause: error
    }
  );
}

/**
 * Abstract base contract for live-caption speech-to-text providers.
 * Subclasses implement transcription, while shared helpers keep STT separate
 * from the translation provider hierarchy.
 */
export class BaseSTTProvider {
  constructor(providerId, options = {}) {
    if (new.target === BaseSTTProvider) {
      throw createLiveCaptionNotImplementedError('BaseSTTProvider');
    }

    this.providerId = providerId || null;
    this.providerName = options.providerName || this.providerId || this.constructor.name;
    this.retryLimit = Number.isInteger(options.retryLimit)
      ? Math.max(0, options.retryLimit)
      : CONFIG.LIVE_CAPTION_RETRY_LIMIT;
    this.logger = options.logger || getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, this.providerName);
    this.state = STT_PROVIDER_STATUS.IDLE;
    this.lastError = null;
    this.lastUpdatedAt = Date.now();
  }

  async transcribeChunk() {
    throw createLiveCaptionNotImplementedError(`${this.constructor.name}.transcribeChunk`);
  }

  async getStatus() {
    throw createLiveCaptionNotImplementedError(`${this.constructor.name}.getStatus`);
  }

  async dispose() {
    this.state = STT_PROVIDER_STATUS.DISPOSED;
    this.lastUpdatedAt = Date.now();
    return createSTTProviderStatus(this.providerId, this.state, {
      lastError: this.lastError,
      lastUpdatedAt: this.lastUpdatedAt
    });
  }

  createStatus(details = {}) {
    return createSTTProviderStatus(this.providerId, this.state, {
      ...details,
      lastError: details.lastError ?? this.lastError,
      lastUpdatedAt: details.lastUpdatedAt ?? this.lastUpdatedAt
    });
  }

  normalizeError(error, options = {}) {
    return normalizeSTTProviderError(error, {
      providerId: this.providerId,
      providerName: this.providerName,
      ...options
    });
  }

  async executeWithRetry(operation, options = {}) {
    const retryLimit = Number.isInteger(options.retryLimit)
      ? Math.max(0, options.retryLimit)
      : this.retryLimit;

    const sessionId = options.sessionId ?? null;
    const videoFingerprint = options.videoFingerprint ?? null;

    let attempt = 0;
    let lastError = null;
    this.state = STT_PROVIDER_STATUS.TRANSCRIBING;
    this.lastUpdatedAt = Date.now();

    while (attempt <= retryLimit) {
      try {
        if (attempt > 0) {
          this.state = STT_PROVIDER_STATUS.RETRYING;
          this.logger.debug(`[${this.providerName}] Retrying transcription`, {
            providerId: this.providerId,
            attempt,
            retryLimit,
            sessionId,
            videoFingerprint
          });
        }

        const result = await operation({ attempt, retryLimit });
        this.state = STT_PROVIDER_STATUS.READY;
        this.lastError = null;
        this.lastUpdatedAt = Date.now();
        return result;
      } catch (error) {
        const normalized = this.normalizeError(error, {
          stage: 'transcription',
          retryable: error?.retryable
        });
        lastError = normalized;

        if (attempt < retryLimit && isRetryableSTTError(normalized)) {
          this.logger.debug(`[${this.providerName}] Transcription attempt failed, retrying`, {
            providerId: this.providerId,
            attempt: attempt + 1,
            retryLimit,
            code: normalized.code,
            type: normalized.type,
            statusCode: normalized.statusCode,
            sessionId,
            videoFingerprint
          });
          attempt += 1;
          continue;
        }

        const finalError = isRetryableSTTError(normalized) && attempt >= retryLimit
          ? createSTTProviderError(STT_PROVIDER_ERROR_CODES.RETRY_EXHAUSTED, 'Live caption transcription retry limit exhausted', {
              providerId: this.providerId,
              providerName: this.providerName,
              stage: 'transcription',
              statusCode: normalized.statusCode,
              retryable: false,
              type: normalized.type,
              cause: normalized,
              details: {
                retryLimit,
                sessionId,
                videoFingerprint
              }
            })
          : normalized;

        this.state = STT_PROVIDER_STATUS.ERROR;
        this.lastError = finalError;
        this.lastUpdatedAt = Date.now();

        this.logger.warn(`[${this.providerName}] Transcription failed`, {
          providerId: this.providerId,
          code: finalError.code,
          type: finalError.type,
          statusCode: finalError.statusCode,
          retryable: finalError.retryable,
          retryLimit,
          sessionId,
          videoFingerprint
        });

        throw finalError;
      }
    }

    this.state = STT_PROVIDER_STATUS.ERROR;
    this.lastError = lastError;
    this.lastUpdatedAt = Date.now();
    throw lastError;
  }
}

export default BaseSTTProvider;
