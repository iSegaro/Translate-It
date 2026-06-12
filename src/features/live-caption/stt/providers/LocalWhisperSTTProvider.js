import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import {
  BaseSTTProvider,
  createSTTProviderError,
  normalizeSTTResult,
  STT_PROVIDER_ERROR_CODES,
  STT_PROVIDER_STATUS
} from '../BaseSTTProvider.js';
import { isCancellationError } from '@/shared/error-management/ErrorMatcher.js';

export const LOCAL_WHISPER_PROVIDER_ID = 'local_whisper';
const DEFAULT_ENDPOINT = 'http://127.0.0.1:8765/v1/audio/transcriptions';
const DEFAULT_MIME_TYPE = 'audio/webm';

function toBlob(audioChunk, mimeType = DEFAULT_MIME_TYPE) {
  let blob = null;

  if (audioChunk instanceof Blob) {
    blob = audioChunk;
  } else if (audioChunk?.blob instanceof Blob) {
    blob = audioChunk.blob;
  } else if (audioChunk?.payload instanceof Blob) {
    blob = audioChunk.payload;
  } else if (audioChunk instanceof ArrayBuffer) {
    blob = new Blob([audioChunk], { type: mimeType });
  } else if (ArrayBuffer.isView(audioChunk)) {
    blob = new Blob([audioChunk], { type: mimeType });
  } else if (audioChunk?.arrayBuffer && typeof audioChunk.arrayBuffer === 'function') {
    blob = audioChunk;
  } else {
    let chunkStr = null;
    if (typeof audioChunk === 'string') {
      chunkStr = audioChunk;
    } else if (typeof audioChunk?.chunkPayload === 'string') {
      chunkStr = audioChunk.chunkPayload;
    } else if (typeof audioChunk?.payload === 'string') {
      chunkStr = audioChunk.payload;
    }

    if (chunkStr) {
      if (chunkStr.startsWith('data:')) {
        try {
          const parts = chunkStr.split(',');
          const base64 = parts[1];
          const mime = parts[0].split(';')[0].split(':')[1] || mimeType;
          const binary = atob(base64);
          const array = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) {
            array[i] = binary.charCodeAt(i);
          }
          blob = new Blob([array], { type: mime });
        } catch {
          // Parse fail.
        }
      } else {
        try {
          const binary = atob(chunkStr);
          const array = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) {
            array[i] = binary.charCodeAt(i);
          }
          blob = new Blob([array], { type: mimeType });
        } catch {
          // Not base64.
        }
      }
    }
  }

  if (!blob || !(blob instanceof Blob) || blob.size === 0) {
    throw createSTTProviderError(STT_PROVIDER_ERROR_CODES.INVALID_AUDIO_CHUNK, 'Live caption audio chunk is invalid or empty', {
      providerId: LOCAL_WHISPER_PROVIDER_ID,
      providerName: 'Local Whisper',
      type: ErrorTypes.API_RESPONSE_INVALID,
      retryable: false
    });
  }

  return blob;
}

function resolveMimeExtension(mimeType = DEFAULT_MIME_TYPE) {
  const normalized = String(mimeType || DEFAULT_MIME_TYPE).split(';')[0].trim().toLowerCase();
  const subtype = normalized.includes('/') ? normalized.split('/')[1] : '';
  const extension = subtype.replace(/[^a-z0-9.+-]/g, '') || 'webm';

  return `chunk.${extension}`;
}

function resolveLanguage(options = {}) {
  const language = options.language ?? options.sourceLanguage ?? null;
  if (!language || String(language).toLowerCase() === 'auto') {
    return null;
  }

  return String(language);
}

function createBodySnippet(payload) {
  if (payload == null) {
    return null;
  }

  let rawValue;
  if (typeof payload === 'string') {
    rawValue = payload;
  } else {
    try {
      rawValue = JSON.stringify(payload);
    } catch {
      rawValue = String(payload);
    }
  }

  const normalized = String(rawValue).replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized.slice(0, 240) : null;
}

function normalizeSegments(segments) {
  if (!Array.isArray(segments)) {
    return null;
  }

  return segments
    .map((segment) => {
      if (!segment || typeof segment !== 'object') {
        return null;
      }

      return Object.freeze({
        text: typeof segment.text === 'string' ? segment.text : String(segment.text ?? ''),
        startTime: Number.isFinite(Number(segment.startTime ?? segment.start)) ? Number(segment.startTime ?? segment.start) : null,
        endTime: Number.isFinite(Number(segment.endTime ?? segment.end)) ? Number(segment.endTime ?? segment.end) : null,
        confidence: Number.isFinite(Number(segment.confidence ?? segment.avgLogprob ?? segment.avg_logprob))
          ? Number(segment.confidence ?? segment.avgLogprob ?? segment.avg_logprob)
          : null,
        language: segment.language ?? segment.detectedLanguage ?? null,
        id: segment.id ?? segment.segmentId ?? null
      });
    })
    .filter(Boolean);
}

function normalizeLocalWhisperResponse(payload = {}, options = {}) {
  if (typeof payload === 'string') {
    const normalized = normalizeSTTResult({
      text: payload,
      detectedLanguage: options.language ?? options.sourceLanguage ?? null,
      startTime: options.chunkStartMs ?? null,
      endTime: options.chunkEndMs ?? null,
      isFinal: true,
      provider: LOCAL_WHISPER_PROVIDER_ID
    }, LOCAL_WHISPER_PROVIDER_ID, {
      text: payload,
      detectedLanguage: options.language ?? options.sourceLanguage ?? null,
      startTime: options.chunkStartMs ?? null,
      endTime: options.chunkEndMs ?? null,
      isFinal: true,
      provider: LOCAL_WHISPER_PROVIDER_ID
    });

    return Object.freeze({
      ...normalized,
      duration: null,
      segments: null
    });
  }

  const segments = normalizeSegments(payload?.segments);
  const textFromSegments = segments?.length
    ? segments.map((segment) => segment.text).filter(Boolean).join(' ').trim()
    : '';
  const text = payload?.text ?? payload?.transcript ?? textFromSegments ?? '';
  const normalized = normalizeSTTResult({
    text,
    detectedLanguage: payload?.detectedLanguage ?? payload?.language ?? options.language ?? options.sourceLanguage ?? null,
    confidence: payload?.confidence ?? payload?.avgLogprob ?? payload?.avg_logprob ?? null,
    startTime: payload?.startTime ?? payload?.start ?? options.chunkStartMs ?? null,
    endTime: payload?.endTime ?? payload?.end ?? options.chunkEndMs ?? null,
    isFinal: true,
    provider: LOCAL_WHISPER_PROVIDER_ID
  }, LOCAL_WHISPER_PROVIDER_ID, {
    text,
    detectedLanguage: payload?.detectedLanguage ?? payload?.language ?? options.language ?? options.sourceLanguage ?? null,
    startTime: options.chunkStartMs ?? null,
    endTime: options.chunkEndMs ?? null,
    isFinal: true,
    provider: LOCAL_WHISPER_PROVIDER_ID
  });

  return Object.freeze({
    ...normalized,
    duration: Number.isFinite(Number(payload?.duration)) ? Number(payload.duration) : null,
    segments
  });
}

function normalizeLocalWhisperError(error, providerId = LOCAL_WHISPER_PROVIDER_ID) {
  if (!error) {
    return createSTTProviderError(STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED, 'Local Whisper request failed', {
      providerId,
      providerName: 'Local Whisper',
      type: ErrorTypes.UNKNOWN,
      retryable: false
    });
  }

  if (error.code && error.providerId === providerId) {
    return error;
  }

  const statusCode = error.statusCode ?? error.status ?? null;
  const message = error.message || 'Local Whisper request failed';
  const responseBodySnippet = error.responseBodySnippet ?? error.cause?.responseBodySnippet ?? error.details?.responseBodySnippet ?? null;
  const serverErrorBodySnippet = error.serverErrorBodySnippet ?? error.cause?.serverErrorBodySnippet ?? error.details?.serverErrorBodySnippet ?? null;

  return createSTTProviderError(STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED, message, {
    providerId,
    providerName: 'Local Whisper',
    type: error.type || (statusCode >= 500 ? ErrorTypes.SERVER_ERROR : statusCode ? ErrorTypes.API_RESPONSE_INVALID : ErrorTypes.NETWORK_ERROR),
    statusCode,
    retryable: Boolean(error.retryable) || [429, 500, 502, 503, 504].includes(statusCode),
    details: {
      ...(error.details && typeof error.details === 'object' ? error.details : {}),
      responseBodySnippet,
      serverErrorBodySnippet
    },
    cause: error
  });
}

export class LocalWhisperSTTProvider extends BaseSTTProvider {
  static id = LOCAL_WHISPER_PROVIDER_ID;
  static displayName = 'Local Whisper';
  static mode = 'batch';

  static isSupported() {
    return true;
  }

  constructor(options = {}) {
    super(LOCAL_WHISPER_PROVIDER_ID, {
      providerName: 'Local Whisper',
      retryLimit: options.retryLimit
    });

    this.endpointUrl = options.endpointUrl || DEFAULT_ENDPOINT;
    this.requestImpl = options.requestImpl || this._defaultRequestImpl.bind(this);
    this.responseParser = options.responseParser || ((payload, requestOptions) => normalizeLocalWhisperResponse(payload, requestOptions));
    this.endpointHost = (() => {
      try {
        return new URL(this.endpointUrl).host;
      } catch {
        return this.endpointUrl;
      }
    })();

    this.state = STT_PROVIDER_STATUS.READY;
    this.lastUpdatedAt = Date.now();

    this.logger.info('Initialized local whisper STT provider', {
      providerId: this.providerId,
      endpointHost: this.endpointHost
    });
  }

  async transcribeChunk(audioChunk, options = {}) {
    let chunk;
    try {
      chunk = toBlob(audioChunk, options.mimeType || audioChunk?.mimeType || DEFAULT_MIME_TYPE);
    } catch (err) {
      this.logger.error('[Local Whisper] Failed to parse audio chunk', {
        providerId: this.providerId,
        endpointHost: this.endpointHost,
        error: err.message,
        errorCode: err.code
      });
      throw err;
    }

    const retryLimit = options.retryLimit ?? this.retryLimit;
    let attemptCount = 0;

    this.logger.debug('[Local Whisper] Starting transcription request', {
      providerId: this.providerId,
      endpointHost: this.endpointHost,
      sessionId: options.sessionId ?? null,
      videoFingerprint: options.videoFingerprint ?? null,
      chunkStartMs: options.chunkStartMs ?? null,
      chunkEndMs: options.chunkEndMs ?? null,
      audioSizeBytes: chunk.size,
      audioMimeType: chunk.type,
      retryLimit
    });

    const result = await this.executeWithRetry(async () => {
      attemptCount += 1;
      const rawResponse = await this.requestImpl(this._buildRequest(chunk, options), options);
      return this._normalizeTranscriptionResult(rawResponse, options);
    }, {
      retryLimit,
      sessionId: options.sessionId ?? null,
      videoFingerprint: options.videoFingerprint ?? null
    }).catch((error) => {
      if (isCancellationError(error)) {
        throw error;
      }

      const originalRetryable = Boolean(error?.cause?.retryable ?? error?.details?.retryable ?? error?.retryable);
      const responseBodySnippet = error?.details?.responseBodySnippet ?? error?.cause?.responseBodySnippet ?? error?.cause?.details?.responseBodySnippet ?? null;
      const serverErrorBodySnippet = error?.details?.serverErrorBodySnippet ?? error?.cause?.serverErrorBodySnippet ?? error?.cause?.details?.serverErrorBodySnippet ?? null;
      this.logger.warn('[Local Whisper] Final transcription failure', {
        providerId: this.providerId,
        endpointHost: this.endpointHost,
        sessionId: options.sessionId ?? null,
        videoFingerprint: options.videoFingerprint ?? null,
        chunkStartMs: options.chunkStartMs ?? null,
        chunkEndMs: options.chunkEndMs ?? null,
        audioSizeBytes: chunk.size,
        audioMimeType: chunk.type,
        statusCode: error?.statusCode ?? error?.status ?? null,
        retryable: Boolean(error?.retryable),
        originalRetryable,
        responseBodySnippet,
        serverErrorBodySnippet,
        attemptCount,
        retryLimit
      });
      throw error;
    });

    this.logger.debug('[Local Whisper] Transcription completed', {
      providerId: this.providerId,
      endpointHost: this.endpointHost,
      sessionId: options.sessionId ?? null,
      videoFingerprint: options.videoFingerprint ?? null,
      charCount: (result?.text || '').length,
      segmentCount: Array.isArray(result?.segments) ? result.segments.length : 0
    });

    return result;
  }

  async getStatus() {
    return this.createStatus({
      ready: this.state !== STT_PROVIDER_STATUS.ERROR && this.state !== STT_PROVIDER_STATUS.DISPOSED,
      retryCount: 0
    });
  }

  async dispose() {
    this.state = STT_PROVIDER_STATUS.DISPOSED;
    this.lastUpdatedAt = Date.now();
    return this.createStatus({
      ready: false,
      lastUpdatedAt: this.lastUpdatedAt
    });
  }

  _buildRequest(audioBlob, options = {}) {
    const formData = new FormData();
    formData.append('file', audioBlob, options.fileName || resolveMimeExtension(audioBlob.type || options.mimeType || DEFAULT_MIME_TYPE));
    formData.append('task', 'transcribe');
    formData.append('response_format', 'json');

    const language = resolveLanguage(options);
    if (language) {
      formData.append('language', language);
    }

    return {
      url: this.endpointUrl,
      method: 'POST',
      body: formData,
      signal: options.signal ?? null,
      sessionId: options.sessionId ?? null,
      videoFingerprint: options.videoFingerprint ?? null,
      chunkStartMs: options.chunkStartMs ?? null,
      chunkEndMs: options.chunkEndMs ?? null,
      mimeType: audioBlob.type || options.mimeType || DEFAULT_MIME_TYPE
    };
  }

  async _defaultRequestImpl(request) {
    let response;
    try {
      response = await fetch(request.url, {
        method: request.method,
        body: request.body,
        signal: request.signal || undefined
      });
    } catch (error) {
      if (isCancellationError(error) || request.signal?.aborted) {
        throw error;
      }

      const networkError = new Error(error?.message || 'Local Whisper request failed');
      networkError.type = ErrorTypes.NETWORK_ERROR;
      networkError.retryable = true;
      networkError.cause = error;
      throw networkError;
    }

    const contentType = response.headers?.get?.('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const error = new Error(typeof payload === 'string' ? payload : payload?.error?.message || response.statusText || 'Local Whisper request failed');
      error.statusCode = response.status;
      error.response = payload;
      error.responseBodySnippet = createBodySnippet(payload);
      if (response.status >= 500) {
        error.serverErrorBodySnippet = error.responseBodySnippet;
      }
      error.type = response.status >= 500
        ? ErrorTypes.SERVER_ERROR
        : response.status === 429
          ? ErrorTypes.RATE_LIMIT_REACHED
          : ErrorTypes.API_RESPONSE_INVALID;
      error.retryable = [429, 500, 502, 503, 504].includes(response.status);
      throw error;
    }

    return payload;
  }

  _normalizeTranscriptionResult(rawResponse, options = {}) {
    const normalizedResponse = this.responseParser(rawResponse, options);
    const normalized = normalizeLocalWhisperResponse(normalizedResponse || rawResponse || {}, options);

    if (!normalized?.text && normalized?.text !== '') {
      throw createSTTProviderError(STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED, 'Local Whisper response did not include transcript text', {
        providerId: this.providerId,
        providerName: this.providerName,
        type: ErrorTypes.API_RESPONSE_INVALID,
        retryable: false
      });
    }

    return normalized;
  }

  normalizeError(error, options = {}) {
    return normalizeLocalWhisperError(error, options.providerId || this.providerId);
  }
}

export default LocalWhisperSTTProvider;
