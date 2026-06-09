import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js';
import { TranslationMode } from '@/shared/config/config.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';

export const LIVE_CAPTION_TRANSLATION_CONTEXT = MessageContexts.LIVE_CAPTION;
export const LIVE_CAPTION_TRANSLATION_MODE = TranslationMode.Selection;

export const LIVE_CAPTION_TRANSLATION_ERROR_CODES = Object.freeze({
  INVALID_TRANSCRIPT_SEGMENT: 'invalid_transcript_segment',
  TRANSLATION_FAILED: 'translation_failed'
});

function normalizeTextValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeTextValue(item))
      .filter((item) => item.length > 0)
      .join('\n');
  }

  if (value && typeof value === 'object') {
    return normalizeTextValue(value.text ?? value.translatedText ?? value.value ?? '');
  }

  return typeof value === 'string' ? value : String(value ?? '');
}

function toNumberOrNull(value) {
  if (value == null || value === '') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function normalizeLiveCaptionTranscriptSegment(segment = {}) {
  const sessionId = segment.sessionId ?? null;
  const videoFingerprint = segment.videoFingerprint ?? null;
  const segmentStartMs = toNumberOrNull(segment.segmentStartMs ?? segment.startMs);
  const segmentEndMs = toNumberOrNull(segment.segmentEndMs ?? segment.endMs);
  const originalText = normalizeTextValue(segment.originalText ?? segment.text ?? '');

  if (!sessionId || !videoFingerprint || segmentStartMs == null || segmentEndMs == null || !originalText) {
    const error = new Error('Invalid live-caption transcript segment');
    error.code = LIVE_CAPTION_TRANSLATION_ERROR_CODES.INVALID_TRANSCRIPT_SEGMENT;
    error.type = ErrorTypes.VALIDATION;
    error.sessionId = sessionId;
    error.videoFingerprint = videoFingerprint;
    error.segmentStartMs = segmentStartMs;
    error.segmentEndMs = segmentEndMs;
    throw error;
  }

  return Object.freeze({
    sessionId,
    videoFingerprint,
    segmentStartMs,
    segmentEndMs,
    originalText,
    sourceLanguage: segment.sourceLanguage ?? segment.detectedLanguage ?? null,
    targetLanguage: segment.targetLanguage ?? null,
    provider: segment.provider ?? null,
    isFinal: segment.isFinal ?? true
  });
}

export function createLiveCaptionTranscriptSegmentInput(segment = {}) {
  return normalizeLiveCaptionTranscriptSegment(segment);
}

export function createLiveCaptionTranslationRequestMetadata(segment, options = {}) {
  const transcriptSegment = normalizeLiveCaptionTranscriptSegment(segment);

  return Object.freeze({
    messageId: options.messageId || `live-caption-translate-${transcriptSegment.sessionId}-${transcriptSegment.segmentStartMs}-${transcriptSegment.segmentEndMs}-${Date.now()}`,
    action: MessageActions.TRANSLATE,
    context: options.context || LIVE_CAPTION_TRANSLATION_CONTEXT,
    mode: options.mode || LIVE_CAPTION_TRANSLATION_MODE,
    sessionId: transcriptSegment.sessionId,
    videoFingerprint: transcriptSegment.videoFingerprint,
    segmentStartMs: transcriptSegment.segmentStartMs,
    segmentEndMs: transcriptSegment.segmentEndMs,
    sourceLanguage: options.sourceLanguage ?? transcriptSegment.sourceLanguage ?? 'auto',
    targetLanguage: options.targetLanguage ?? transcriptSegment.targetLanguage ?? null
  });
}

export function createLiveCaptionTranslationRequest(segment, options = {}) {
  const transcriptSegment = normalizeLiveCaptionTranscriptSegment(segment);
  const metadata = createLiveCaptionTranslationRequestMetadata(transcriptSegment, options);

  return {
    action: metadata.action,
    messageId: metadata.messageId,
    context: metadata.context,
    data: {
      text: transcriptSegment.originalText,
      sourceLanguage: metadata.sourceLanguage,
      targetLanguage: metadata.targetLanguage,
      mode: metadata.mode,
      sessionId: metadata.sessionId,
      videoFingerprint: metadata.videoFingerprint,
      segmentStartMs: metadata.segmentStartMs,
      segmentEndMs: metadata.segmentEndMs
    },
    metadata
  };
}

export function createLiveCaptionTranslatedCaptionSegment(segment, translationResult = {}, metadata = {}) {
  const transcriptSegment = normalizeLiveCaptionTranscriptSegment(segment);
  const translatedText = normalizeTextValue(
    translationResult.translatedText
      ?? translationResult.translation
      ?? translationResult.text
      ?? translationResult.results
      ?? ''
  );

  return Object.freeze({
    sessionId: metadata.sessionId ?? transcriptSegment.sessionId,
    videoFingerprint: metadata.videoFingerprint ?? transcriptSegment.videoFingerprint,
    segmentStartMs: metadata.segmentStartMs ?? transcriptSegment.segmentStartMs,
    segmentEndMs: metadata.segmentEndMs ?? transcriptSegment.segmentEndMs,
    originalText: transcriptSegment.originalText,
    translatedText,
    sourceLanguage: translationResult.sourceLanguage ?? metadata.sourceLanguage ?? transcriptSegment.sourceLanguage ?? null,
    targetLanguage: translationResult.targetLanguage ?? metadata.targetLanguage ?? transcriptSegment.targetLanguage ?? null,
    provider: translationResult.provider ?? metadata.provider ?? transcriptSegment.provider ?? null,
    isFinal: translationResult.isFinal ?? transcriptSegment.isFinal ?? true
  });
}

export function normalizeLiveCaptionTranslationError(error, metadata = {}) {
  const sourceError = error?.error ?? error;
  const errorType = sourceError?.type || matchErrorToType(sourceError) || ErrorTypes.TRANSLATION_FAILED;
  const statusCode = sourceError?.statusCode ?? sourceError?.status ?? null;
  const message = typeof sourceError === 'string'
    ? sourceError
    : sourceError?.message || 'Live caption translation failed';

  return Object.freeze({
    code: sourceError?.code || LIVE_CAPTION_TRANSLATION_ERROR_CODES.TRANSLATION_FAILED,
    type: errorType,
    message,
    provider: sourceError?.provider ?? sourceError?.providerName ?? metadata.provider ?? null,
    providerName: sourceError?.providerName ?? null,
    providerId: sourceError?.providerId ?? null,
    statusCode,
    sessionId: metadata.sessionId ?? null,
    videoFingerprint: metadata.videoFingerprint ?? null,
    segmentStartMs: metadata.segmentStartMs ?? null,
    segmentEndMs: metadata.segmentEndMs ?? null,
    sourceLanguage: metadata.sourceLanguage ?? null,
    targetLanguage: metadata.targetLanguage ?? null,
    retryable: Boolean(sourceError?.retryable),
    details: sourceError?.details ?? null,
    at: Date.now()
  });
}

export default {
  LIVE_CAPTION_TRANSLATION_CONTEXT,
  LIVE_CAPTION_TRANSLATION_MODE,
  LIVE_CAPTION_TRANSLATION_ERROR_CODES,
  normalizeLiveCaptionTranscriptSegment,
  createLiveCaptionTranscriptSegmentInput,
  createLiveCaptionTranslationRequestMetadata,
  createLiveCaptionTranslationRequest,
  createLiveCaptionTranslatedCaptionSegment,
  normalizeLiveCaptionTranslationError
};
