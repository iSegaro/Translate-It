import { getTargetLanguageAsync } from '@/shared/config/config.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';
import {
  LIVE_CAPTION_TRANSLATION_MODE,
  createLiveCaptionTranslationRequest,
  createLiveCaptionTranslatedCaptionSegment,
  normalizeLiveCaptionTranscriptSegment,
  normalizeLiveCaptionTranslationError
} from './liveCaptionTranslationContracts.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionTranslationAdapter');

export class LiveCaptionTranslationAdapter {
  constructor(options = {}) {
    this.translationService = options.translationService || unifiedTranslationService;
    this.targetLanguageResolver = options.targetLanguageResolver || getTargetLanguageAsync;
  }

  async translateFinalizedSegment(segment, options = {}) {
    const transcriptSegment = normalizeLiveCaptionTranscriptSegment(segment);
    let resolvedTargetLanguage = options.targetLanguage ?? transcriptSegment.targetLanguage ?? null;

    try {
      if (!resolvedTargetLanguage) {
        resolvedTargetLanguage = await this.targetLanguageResolver();
      }

      const request = createLiveCaptionTranslationRequest(transcriptSegment, {
        ...options,
        targetLanguage: resolvedTargetLanguage,
        sourceLanguage: options.sourceLanguage ?? transcriptSegment.sourceLanguage ?? transcriptSegment.detectedLanguage ?? 'auto',
        mode: options.mode || LIVE_CAPTION_TRANSLATION_MODE
      });

      logger.debug('Live-caption translation request', {
        sessionId: request.metadata.sessionId,
        videoFingerprint: request.metadata.videoFingerprint,
        segmentStartMs: request.metadata.segmentStartMs,
        segmentEndMs: request.metadata.segmentEndMs,
        sourceLanguage: request.data.sourceLanguage,
        targetLanguage: request.data.targetLanguage,
        textLength: transcriptSegment.originalText.length,
        mode: request.data.mode
      });

      const response = await this.translationService.handleTranslationRequest(request, options.sender);

      if (!response || response.success === false) {
        throw normalizeLiveCaptionTranslationError(response, {
          ...request.metadata,
          provider: request.data.provider ?? response?.provider ?? null
        });
      }

      const captionSegment = createLiveCaptionTranslatedCaptionSegment(transcriptSegment, response, {
        ...request.metadata,
        provider: response.provider ?? request.data.provider ?? null,
        sourceLanguage: response.sourceLanguage ?? request.data.sourceLanguage,
        targetLanguage: response.targetLanguage ?? request.data.targetLanguage
      });

      logger.debug('Live-caption translation request completed', {
        sessionId: captionSegment.sessionId,
        videoFingerprint: captionSegment.videoFingerprint,
        segmentStartMs: captionSegment.segmentStartMs,
        segmentEndMs: captionSegment.segmentEndMs,
        sourceLanguage: captionSegment.sourceLanguage,
        targetLanguage: captionSegment.targetLanguage,
        provider: captionSegment.provider,
        translatedLength: captionSegment.translatedText.length
      });

      return captionSegment;
    } catch (error) {
      const normalizedError = normalizeLiveCaptionTranslationError(error, {
        sessionId: transcriptSegment.sessionId,
        videoFingerprint: transcriptSegment.videoFingerprint,
        segmentStartMs: transcriptSegment.segmentStartMs,
        segmentEndMs: transcriptSegment.segmentEndMs,
        sourceLanguage: transcriptSegment.sourceLanguage,
        targetLanguage: resolvedTargetLanguage
      });

      logger.debug('Live-caption translation request failed with normalized error', {
        sessionId: normalizedError.sessionId,
        videoFingerprint: normalizedError.videoFingerprint,
        segmentStartMs: normalizedError.segmentStartMs,
        segmentEndMs: normalizedError.segmentEndMs,
        type: normalizedError.type,
        code: normalizedError.code,
        provider: normalizedError.provider
      });

      throw normalizedError;
    }
  }
}

export default LiveCaptionTranslationAdapter;
