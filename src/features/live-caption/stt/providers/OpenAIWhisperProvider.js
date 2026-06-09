import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import {
  BaseSTTProvider,
  createSTTProviderError,
  normalizeSTTResult,
  STT_PROVIDER_ERROR_CODES,
  STT_PROVIDER_STATUS
} from '../BaseSTTProvider.js';
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'whisper-1';
export const OPENAI_WHISPER_PROVIDER_ID = 'openai_whisper';

function toBlob(audioChunk, mimeType = 'audio/webm') {
  if (audioChunk instanceof Blob) {
    return audioChunk;
  }

  if (audioChunk?.blob instanceof Blob) {
    return audioChunk.blob;
  }

  if (audioChunk?.payload instanceof Blob) {
    return audioChunk.payload;
  }

  if (audioChunk instanceof ArrayBuffer) {
    return new Blob([audioChunk], { type: mimeType });
  }

  if (ArrayBuffer.isView(audioChunk)) {
    return new Blob([audioChunk], { type: mimeType });
  }

  if (audioChunk?.arrayBuffer && typeof audioChunk.arrayBuffer === 'function') {
    return audioChunk;
  }

  throw createSTTProviderError(STT_PROVIDER_ERROR_CODES.INVALID_AUDIO_CHUNK, 'Live caption audio chunk is invalid', {
    providerId: OPENAI_WHISPER_PROVIDER_ID,
    providerName: 'OpenAI Whisper',
    type: ErrorTypes.API_RESPONSE_INVALID,
    retryable: false
  });
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
    const chunk = toBlob(audioChunk, options.mimeType || audioChunk?.mimeType || 'audio/webm');
    const retryLimit = options.retryLimit ?? this.retryLimit;

    this.logger.debug(`[${this.providerName}] Starting transcription request`, {
      providerId: this.providerId,
      sessionId: options.sessionId ?? null,
      videoFingerprint: options.videoFingerprint ?? null,
      chunkStartMs: options.chunkStartMs ?? null,
      chunkEndMs: options.chunkEndMs ?? null,
      retryLimit
    });

    const result = await this.executeWithRetry(async () => {
      const rawResponse = await this.requestImpl(this._buildRequest(chunk, options), options);
      return this._normalizeTranscriptionResult(rawResponse, options);
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
      error.type = response.status === 401 || response.status === 403
        ? ErrorTypes.API_KEY_INVALID
        : response.status === 429
          ? ErrorTypes.RATE_LIMIT_REACHED
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
