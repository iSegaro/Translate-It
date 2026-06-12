import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import {
  BaseSTTProvider,
  createSTTProviderError,
  normalizeSTTResult,
  STT_PROVIDER_ERROR_CODES,
  STT_PROVIDER_STATUS
} from '../BaseSTTProvider.js';
import { isCancellationError } from '@/shared/error-management/ErrorMatcher.js';
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'whisper-1';
export const OPENAI_WHISPER_PROVIDER_ID = 'openai_whisper';

function toBlob(audioChunk, mimeType = 'audio/webm') {
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
          for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
          }
          blob = new Blob([array], { type: mime });
        } catch (e) {
          // Parse fail
        }
      } else {
        try {
          const binary = atob(chunkStr);
          const array = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
          }
          blob = new Blob([array], { type: mimeType });
        } catch (e) {
          // Not base64
        }
      }
    }
  }

  if (!blob || !(blob instanceof Blob) || blob.size === 0) {
    throw createSTTProviderError(STT_PROVIDER_ERROR_CODES.INVALID_AUDIO_CHUNK, 'Live caption audio chunk is invalid or empty', {
      providerId: OPENAI_WHISPER_PROVIDER_ID,
      providerName: 'OpenAI Whisper',
      type: ErrorTypes.API_RESPONSE_INVALID,
      retryable: false
    });
  }

  return blob;
}

function normalizeOpenAIError(error, providerId = OPENAI_WHISPER_PROVIDER_ID) {
  if (!error) {
    return createSTTProviderError(STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED, 'OpenAI Whisper request failed', {
      providerId,
      providerName: 'OpenAI Whisper',
      type: ErrorTypes.UNKNOWN,
      retryable: false
    });
  }

  if (error.code && error.providerId === providerId) {
    return error;
  }

  const statusCode = error.statusCode ?? error.status ?? null;
  const message = error.message || 'OpenAI Whisper request failed';

  if (error.type === ErrorTypes.API_KEY_MISSING || statusCode === 401 || statusCode === 403 || error.type === ErrorTypes.API_KEY_INVALID) {
    return createSTTProviderError(STT_PROVIDER_ERROR_CODES.INVALID_API_KEY, message, {
      providerId,
      providerName: 'OpenAI Whisper',
      type: ErrorTypes.API_KEY_INVALID,
      statusCode,
      retryable: false,
      cause: error
    });
  }

  return createSTTProviderError(STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED, message, {
    providerId,
    providerName: 'OpenAI Whisper',
    type: error.type || ErrorTypes.NETWORK_ERROR,
    statusCode,
    retryable: Boolean(error.retryable),
    cause: error
  });
}

export class OpenAIWhisperProvider extends BaseSTTProvider {
  static id = OPENAI_WHISPER_PROVIDER_ID;
  static displayName = 'OpenAI Whisper';
  static mode = 'batch';

  constructor(options = {}) {
    super(OPENAI_WHISPER_PROVIDER_ID, {
      providerName: 'OpenAI Whisper',
      retryLimit: options.retryLimit
    });

    this.apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
    this.endpointUrl = options.endpointUrl || DEFAULT_ENDPOINT;
    this.model = options.model || DEFAULT_MODEL;
    this.requestImpl = options.requestImpl || this._defaultRequestImpl.bind(this);
    this.responseParser = options.responseParser || this._defaultResponseParser.bind(this);

    if (!this.apiKey) {
      throw createSTTProviderError(STT_PROVIDER_ERROR_CODES.MISSING_API_KEY, 'OpenAI API key is required for live-caption transcription', {
        providerId: this.providerId,
        providerName: this.providerName,
        stage: 'startup',
        type: ErrorTypes.API_KEY_MISSING,
        retryable: false
      });
    }

    this.state = STT_PROVIDER_STATUS.READY;
    this.lastUpdatedAt = Date.now();
  }

  async transcribeChunk(audioChunk, options = {}) {
    let chunk;
    try {
      chunk = toBlob(audioChunk, options.mimeType || audioChunk?.mimeType || 'audio/webm');
    } catch (err) {
      this.logger.error(`[${this.providerName}] Failed to parse audio chunk`, {
        providerId: this.providerId,
        sessionId: options.sessionId ?? null,
        error: err.message,
        errorCode: err.code
      });
      throw err;
    }
    const retryLimit = options.retryLimit ?? this.retryLimit;

    this.logger.debug(`[${this.providerName}] Starting transcription request`, {
      providerId: this.providerId,
      sessionId: options.sessionId ?? null,
      videoFingerprint: options.videoFingerprint ?? null,
      chunkStartMs: options.chunkStartMs ?? null,
      chunkEndMs: options.chunkEndMs ?? null,
      audioSizeBytes: chunk.size,
      audioMimeType: chunk.type,
      retryLimit
    });

    const result = await this.executeWithRetry(async () => {
      try {
        const rawResponse = await this.requestImpl(this._buildRequest(chunk, options), options);
        return this._normalizeTranscriptionResult(rawResponse, options);
      } catch (err) {
        if (isCancellationError(err)) {
          throw err;
        }

        this.logger.warn(`[${this.providerName}] Attempt execution failed`, {
          providerId: this.providerId,
          sessionId: options.sessionId ?? null,
          videoFingerprint: options.videoFingerprint ?? null,
          statusCode: err.statusCode ?? err.status ?? null,
          errorType: err.type ?? null,
          errorMessage: err.message ?? null,
          audioSizeBytes: chunk.size,
          audioMimeType: chunk.type
        });
        throw err;
      }
    }, {
      retryLimit,
      sessionId: options.sessionId ?? null,
      videoFingerprint: options.videoFingerprint ?? null
    });

    this.logger.debug(`[${this.providerName}] Transcription completed`, {
      providerId: this.providerId,
      sessionId: options.sessionId ?? null,
      videoFingerprint: options.videoFingerprint ?? null,
      hasText: Boolean(result?.text),
      detectedLanguage: result?.detectedLanguage ?? null
    });

    return result;
  }

  async getStatus() {
    return this.createStatus({
      ready: Boolean(this.apiKey) && this.state !== STT_PROVIDER_STATUS.ERROR && this.state !== STT_PROVIDER_STATUS.DISPOSED,
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
    formData.append('file', audioBlob, options.fileName || 'live-caption.webm');
    formData.append('model', options.model || this.model);
    formData.append('response_format', options.responseFormat || 'verbose_json');

    if (options.language) {
      formData.append('language', options.language);
    }

    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }

    return {
      url: this.endpointUrl,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      },
      body: formData,
      signal: options.signal ?? null,
      sessionId: options.sessionId ?? null,
      videoFingerprint: options.videoFingerprint ?? null,
      chunkStartMs: options.chunkStartMs ?? null,
      chunkEndMs: options.chunkEndMs ?? null
    };
  }

  async _defaultRequestImpl(request) {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: request.signal || undefined
    });

    const contentType = response.headers?.get?.('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const error = new Error(typeof payload === 'string' ? payload : payload?.error?.message || response.statusText || 'OpenAI Whisper request failed');
      error.statusCode = response.status;
      error.response = payload;
      
      const msg = (error.message || '').toLowerCase();
      const isQuotaError = msg.includes('quota') || msg.includes('balance') || msg.includes('insufficient');

      error.type = response.status === 401 || response.status === 403
        ? ErrorTypes.API_KEY_INVALID
        : response.status === 429
          ? (isQuotaError ? ErrorTypes.QUOTA_EXCEEDED : ErrorTypes.RATE_LIMIT_REACHED)
          : response.status >= 500
            ? ErrorTypes.SERVER_ERROR
            : ErrorTypes.API_RESPONSE_INVALID;
      throw error;
    }

    return payload;
  }

  _defaultResponseParser(payload, options = {}) {
    if (typeof payload === 'string') {
      return normalizeSTTResult({
        text: payload,
        detectedLanguage: options.language ?? null,
        startTime: options.chunkStartMs ?? null,
        endTime: options.chunkEndMs ?? null,
        isFinal: true,
        provider: this.providerId
      }, this.providerId, options);
    }

    return normalizeSTTResult(payload || {}, this.providerId, {
      detectedLanguage: options.language ?? null,
      startTime: options.chunkStartMs ?? null,
      endTime: options.chunkEndMs ?? null,
      isFinal: true,
      provider: this.providerId
    });
  }

  _normalizeTranscriptionResult(rawResponse, options = {}) {
    const normalizedResponse = this.responseParser(rawResponse, options);
    if (!normalizedResponse?.text && normalizedResponse?.text !== '') {
      throw createSTTProviderError(STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED, 'OpenAI Whisper response did not include transcript text', {
        providerId: this.providerId,
        providerName: this.providerName,
        type: ErrorTypes.API_RESPONSE_INVALID,
        retryable: false
      });
    }

    return normalizeSTTResult(normalizedResponse, this.providerId, {
      detectedLanguage: options.language ?? null,
      startTime: options.chunkStartMs ?? null,
      endTime: options.chunkEndMs ?? null,
      isFinal: true,
      provider: this.providerId
    });
  }

  normalizeError(error, options = {}) {
    return normalizeOpenAIError(error, options.providerId || this.providerId);
  }
}

export default OpenAIWhisperProvider;
