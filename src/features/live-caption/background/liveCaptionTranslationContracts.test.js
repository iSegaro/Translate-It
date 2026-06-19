import { describe, expect, it } from 'vitest';
import {
  LIVE_CAPTION_TRANSLATION_CONTEXT,
  LIVE_CAPTION_TRANSLATION_MODE,
  LIVE_CAPTION_TRANSLATION_ERROR_CODES,
  createLiveCaptionTranscriptSegmentInput,
  createLiveCaptionTranslationRequestMetadata,
  createLiveCaptionTranslationRequest,
  createLiveCaptionTranslatedCaptionSegment,
  normalizeLiveCaptionTranslationError,
  normalizeLiveCaptionTranscriptSegment
} from './liveCaptionTranslationContracts.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { TranslationMode } from '@/shared/config/config.js';

describe('live-caption translation contracts', () => {
  it('validates finalized transcript segment input', () => {
    const segment = createLiveCaptionTranscriptSegmentInput({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: '100',
      segmentEndMs: 250,
      originalText: 'Hello world',
      sourceLanguage: 'en',
      sourceTimelineType: 'capture',
      sourceStartMs: '90',
      sourceEndMs: '260',
      sourceClockId: 'capture-clock-1',
      sourceSequence: '12',
      sourceResetId: 'reset-1',
      projectedMediaStartMs: '310',
      projectedMediaEndMs: 360,
      timelineProjectionStatus: 'mapped',
      timelineProjectionAnchorId: 'anchor-1',
      timelineProjectionReason: 'start'
    });

    expect(segment).toEqual({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 100,
      segmentEndMs: 250,
      mediaStartMs: null,
      mediaEndMs: null,
      sourceTimelineType: 'capture',
      sourceStartMs: 90,
      sourceEndMs: 260,
      sourceClockId: 'capture-clock-1',
      sourceSequence: 12,
      sourceResetId: 'reset-1',
      projectedMediaStartMs: 310,
      projectedMediaEndMs: 360,
      timelineProjectionStatus: 'mapped',
      timelineProjectionAnchorId: 'anchor-1',
      timelineProjectionReason: 'start',
      originalText: 'Hello world',
      sourceLanguage: 'en',
      targetLanguage: null,
      provider: null,
      isFinal: true
    });

    let error;
    try {
      normalizeLiveCaptionTranscriptSegment({
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        segmentStartMs: 100,
        segmentEndMs: 250
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toMatchObject({
      code: LIVE_CAPTION_TRANSLATION_ERROR_CODES.INVALID_TRANSCRIPT_SEGMENT,
      type: ErrorTypes.VALIDATION
    });
  });

  it('creates translation request metadata and request payloads without provider pinning', () => {
    const metadata = createLiveCaptionTranslationRequestMetadata({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 100,
      segmentEndMs: 250,
      originalText: 'Hello world',
      sourceLanguage: 'en',
      sourceTimelineType: 'provider',
      sourceStartMs: 100,
      sourceEndMs: 250,
      sourceClockId: 'provider-session',
      sourceSequence: 99,
      sourceResetId: 'reset-2',
      projectedMediaStartMs: 310,
      projectedMediaEndMs: 360,
      timelineProjectionStatus: 'mapped',
      timelineProjectionAnchorId: 'anchor-1',
      timelineProjectionReason: 'start'
    }, {
      messageId: 'msg-1',
      context: LIVE_CAPTION_TRANSLATION_CONTEXT,
      mode: LIVE_CAPTION_TRANSLATION_MODE,
      targetLanguage: 'fa'
    });

    const request = createLiveCaptionTranslationRequest({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 100,
      segmentEndMs: 250,
      originalText: 'Hello world',
      sourceLanguage: 'en',
      sourceTimelineType: 'provider',
      sourceStartMs: 100,
      sourceEndMs: 250,
      sourceClockId: 'provider-session',
      sourceSequence: 99,
      sourceResetId: 'reset-2',
      projectedMediaStartMs: 310,
      projectedMediaEndMs: 360,
      timelineProjectionStatus: 'mapped',
      timelineProjectionAnchorId: 'anchor-1',
      timelineProjectionReason: 'start'
    }, {
      messageId: 'msg-1',
      targetLanguage: 'fa'
    });

    expect(metadata).toMatchObject({
      messageId: 'msg-1',
      action: MessageActions.TRANSLATE,
      context: LIVE_CAPTION_TRANSLATION_CONTEXT,
      mode: LIVE_CAPTION_TRANSLATION_MODE,
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 100,
      segmentEndMs: 250,
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      sourceTimelineType: 'provider',
      sourceStartMs: 100,
      sourceEndMs: 250,
      sourceClockId: 'provider-session',
      sourceSequence: 99,
      sourceResetId: 'reset-2',
      projectedMediaStartMs: 310,
      projectedMediaEndMs: 360,
      timelineProjectionStatus: 'mapped',
      timelineProjectionAnchorId: 'anchor-1',
      timelineProjectionReason: 'start'
    });
    expect(request).toMatchObject({
      action: MessageActions.TRANSLATE,
      messageId: 'msg-1',
      context: LIVE_CAPTION_TRANSLATION_CONTEXT,
      data: {
        text: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        mode: TranslationMode.Selection,
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        segmentStartMs: 100,
        segmentEndMs: 250
      }
    });
    expect(request.data.provider).toBeUndefined();
  });

  it('normalizes translated caption segments and metadata propagation', () => {
    const caption = createLiveCaptionTranslatedCaptionSegment({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 100,
      segmentEndMs: 250,
      originalText: 'Hello world',
      sourceLanguage: 'en',
      sourceTimelineType: 'provider',
      sourceStartMs: 100,
      sourceEndMs: 250,
      sourceClockId: 'provider-session',
      sourceSequence: 99,
      sourceResetId: 'reset-2',
      projectedMediaStartMs: 310,
      projectedMediaEndMs: 360,
      timelineProjectionStatus: 'mapped',
      timelineProjectionAnchorId: 'anchor-1',
      timelineProjectionReason: 'start',
      isFinal: true
    }, {
      results: [{ text: 'سلام دنیا' }],
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      isFinal: true
    }, {
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      sourceTimelineType: 'provider',
      sourceStartMs: 100,
      sourceEndMs: 250,
      sourceClockId: 'provider-session',
      sourceSequence: 99,
      sourceResetId: 'reset-2',
      projectedMediaStartMs: 310,
      projectedMediaEndMs: 360,
      timelineProjectionStatus: 'mapped',
      timelineProjectionAnchorId: 'anchor-1',
      timelineProjectionReason: 'start'
    });

    expect(caption).toEqual({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 100,
      segmentEndMs: 250,
      sourceTimelineType: 'provider',
      sourceStartMs: 100,
      sourceEndMs: 250,
      sourceClockId: 'provider-session',
      sourceSequence: 99,
      sourceResetId: 'reset-2',
      projectedMediaStartMs: 310,
      projectedMediaEndMs: 360,
      timelineProjectionStatus: 'mapped',
      timelineProjectionAnchorId: 'anchor-1',
      timelineProjectionReason: 'start',
      originalText: 'Hello world',
      translatedText: 'سلام دنیا',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'google',
      isFinal: true
    });
  });

  it('normalizes translation failures with session context and provider info', () => {
    const error = normalizeLiveCaptionTranslationError({
      error: {
        code: 'provider_error',
        message: 'Provider failed',
        provider: 'google',
        providerId: 'google',
        retryable: true
      }
    }, {
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 100,
      segmentEndMs: 250,
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'google'
    });

    expect(error).toMatchObject({
      code: 'provider_error',
      type: expect.any(String),
      message: 'Provider failed',
      provider: 'google',
      providerId: 'google',
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 100,
      segmentEndMs: 250,
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      retryable: true
    });
  });

  it('preserves mediaStartMs and mediaEndMs properties in transcript segment normalization', () => {
    const segment = normalizeLiveCaptionTranscriptSegment({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 100,
      segmentEndMs: 250,
      mediaStartMs: 5100,
      mediaEndMs: 5250,
      originalText: 'Hello'
    });

    expect(segment.mediaStartMs).toBe(5100);
    expect(segment.mediaEndMs).toBe(5250);
  });
});
