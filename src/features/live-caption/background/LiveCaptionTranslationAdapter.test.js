import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleTranslationRequest: vi.fn(),
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })),
  sttFactory: vi.fn(),
  offscreenBridge: vi.fn(),
  cacheFacade: vi.fn()
}));

vi.mock('@/core/services/translation/UnifiedTranslationService.js', () => ({
  unifiedTranslationService: {
    handleTranslationRequest: mocks.handleTranslationRequest
  },
  UnifiedTranslationService: vi.fn()
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: mocks.getScopedLogger
}));

vi.mock('@/features/live-caption/stt/STTProviderFactory.js', () => ({
  STTProviderFactory: mocks.sttFactory
}));

vi.mock('@/features/live-caption/background/LiveCaptionOffscreenBridge.js', () => ({
  LiveCaptionOffscreenBridge: mocks.offscreenBridge
}));

vi.mock('@/features/live-caption/cache/LiveCaptionCache.js', () => ({
  LiveCaptionCache: mocks.cacheFacade
}));

import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js';
import { TranslationMode } from '@/shared/config/config.js';
import {
  LiveCaptionTranslationAdapter
} from './LiveCaptionTranslationAdapter.js';

describe('LiveCaptionTranslationAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates finalized transcript segments to the existing translation flow', async () => {
    const targetLanguageResolver = vi.fn().mockResolvedValue('fa');
    const adapter = new LiveCaptionTranslationAdapter({
      targetLanguageResolver
    });

    mocks.handleTranslationRequest.mockResolvedValue({
      success: true,
      translatedText: 'سلام دنیا',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'google'
    });

    const result = await adapter.translateFinalizedSegment({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 100,
      segmentEndMs: 250,
      originalText: 'Hello world',
      sourceLanguage: 'en',
      isFinal: true
    }, {
      sender: { id: 'sender-1' }
    });

    expect(targetLanguageResolver).toHaveBeenCalledTimes(1);
    expect(mocks.handleTranslationRequest).toHaveBeenCalledTimes(1);
    const [request, sender] = mocks.handleTranslationRequest.mock.calls[0];

    expect(sender).toEqual({ id: 'sender-1' });
    expect(request.action).toBe(MessageActions.TRANSLATE);
    expect(request.context).toBe(MessageContexts.LIVE_CAPTION);
    expect(request.data).toMatchObject({
      text: 'Hello world',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      mode: TranslationMode.Selection,
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 100,
      segmentEndMs: 250
    });
    expect(request.data.provider).toBeUndefined();

    expect(result).toEqual({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 100,
      segmentEndMs: 250,
      originalText: 'Hello world',
      translatedText: 'سلام دنیا',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'google',
      isFinal: true
    });
  });

  it('normalizes translated caption output from provider results metadata', async () => {
    const adapter = new LiveCaptionTranslationAdapter({
      targetLanguageResolver: vi.fn().mockResolvedValue('fa')
    });

    mocks.handleTranslationRequest.mockResolvedValue({
      success: true,
      results: [{ text: 'سلام دنیا' }],
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'google'
    });

    const result = await adapter.translateFinalizedSegment({
      sessionId: 'session-2',
      videoFingerprint: 'video-b',
      segmentStartMs: 500,
      segmentEndMs: 900,
      originalText: 'Hello world',
      sourceLanguage: 'en',
      isFinal: true
    });

    expect(result.translatedText).toBe('سلام دنیا');
    expect(result.provider).toBe('google');
    expect(result.sourceLanguage).toBe('en');
    expect(result.targetLanguage).toBe('fa');
  });

  it('normalizes translation failures with deterministic session context', async () => {
    const adapter = new LiveCaptionTranslationAdapter({
      targetLanguageResolver: vi.fn().mockResolvedValue('fa')
    });

    mocks.handleTranslationRequest.mockResolvedValue({
      success: false,
      error: {
        code: 'provider_error',
        message: 'Provider failed',
        provider: 'google',
        retryable: true
      }
    });

    await expect(adapter.translateFinalizedSegment({
      sessionId: 'session-3',
      videoFingerprint: 'video-c',
      segmentStartMs: 1000,
      segmentEndMs: 1400,
      originalText: 'Hello world',
      sourceLanguage: 'en',
      isFinal: true
    })).rejects.toMatchObject({
      code: 'provider_error',
      message: 'Provider failed',
      provider: 'google',
      retryable: true,
      sessionId: 'session-3',
      videoFingerprint: 'video-c',
      segmentStartMs: 1000,
      segmentEndMs: 1400,
      targetLanguage: 'fa'
    });
  });

  it('normalizes thrown translation errors without introducing fallback behavior', async () => {
    const adapter = new LiveCaptionTranslationAdapter({
      targetLanguageResolver: vi.fn().mockResolvedValue('fa')
    });

    mocks.handleTranslationRequest.mockRejectedValue(new Error('network down'));

    await expect(adapter.translateFinalizedSegment({
      sessionId: 'session-4',
      videoFingerprint: 'video-d',
      segmentStartMs: 2000,
      segmentEndMs: 2600,
      originalText: 'Hello world',
      sourceLanguage: 'en',
      isFinal: true
    })).rejects.toMatchObject({
      message: 'network down',
      sessionId: 'session-4',
      videoFingerprint: 'video-d',
      segmentStartMs: 2000,
      segmentEndMs: 2600,
      targetLanguage: 'fa'
    });
  });

  it('does not touch STT, capture, or cache modules', async () => {
    const adapter = new LiveCaptionTranslationAdapter({
      targetLanguageResolver: vi.fn().mockResolvedValue('fa')
    });

    mocks.handleTranslationRequest.mockResolvedValue({
      success: true,
      translatedText: 'سلام',
      provider: 'google'
    });

    await adapter.translateFinalizedSegment({
      sessionId: 'session-5',
      videoFingerprint: 'video-e',
      segmentStartMs: 10,
      segmentEndMs: 20,
      originalText: 'Hi',
      sourceLanguage: 'en',
      isFinal: true
    });

    expect(mocks.sttFactory).not.toHaveBeenCalled();
    expect(mocks.offscreenBridge).not.toHaveBeenCalled();
    expect(mocks.cacheFacade).not.toHaveBeenCalled();
    expect(mocks.handleTranslationRequest).toHaveBeenCalledTimes(1);
  });

  it('handles contract compatibility with startMs/endMs segment format', async () => {
    const adapter = new LiveCaptionTranslationAdapter({
      targetLanguageResolver: vi.fn().mockResolvedValue('fa')
    });

    mocks.handleTranslationRequest.mockResolvedValue({
      success: true,
      translatedText: 'سلام دنیا',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'google'
    });

    const result = await adapter.translateFinalizedSegment({
      sessionId: 'session-compat',
      videoFingerprint: 'video-compat',
      startMs: 100,
      endMs: 250,
      text: 'Hello world',
      sourceLanguage: 'en',
      isFinal: true
    });

    expect(result.segmentStartMs).toBe(100);
    expect(result.segmentEndMs).toBe(250);
    expect(result.originalText).toBe('Hello world');
    expect(result.translatedText).toBe('سلام دنیا');
  });

  it('aborts translation pre-flight if signal is already aborted', async () => {
    const adapter = new LiveCaptionTranslationAdapter({
      targetLanguageResolver: vi.fn().mockResolvedValue('fa')
    });

    const controller = new AbortController();
    controller.abort();

    await expect(adapter.translateFinalizedSegment({
      sessionId: 'session-abort-pre',
      videoFingerprint: 'video-abort-pre',
      startMs: 100,
      endMs: 250,
      text: 'Hello world',
      sourceLanguage: 'en',
      isFinal: true
    }, {
      signal: controller.signal
    })).rejects.toMatchObject({
      type: 'USER_CANCELLED',
      message: 'Aborted'
    });

    expect(mocks.handleTranslationRequest).not.toHaveBeenCalled();
  });

  it('aborts translation in-flight, calls cancelTranslation, and emits no segment', async () => {
    const cancelMock = vi.fn().mockResolvedValue();
    const mockEngine = {
      cancelTranslation: cancelMock
    };
    const mockTranslationService = {
      handleTranslationRequest: vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.resolve({ success: true, translatedText: 'سلام' });
      }),
      translationEngine: mockEngine
    };

    const adapter = new LiveCaptionTranslationAdapter({
      translationService: mockTranslationService,
      targetLanguageResolver: vi.fn().mockResolvedValue('fa')
    });

    const controller = new AbortController();

    await expect(adapter.translateFinalizedSegment({
      sessionId: 'session-abort-mid',
      videoFingerprint: 'video-abort-mid',
      startMs: 100,
      endMs: 250,
      text: 'Hello world',
      sourceLanguage: 'en',
      isFinal: true
    }, {
      signal: controller.signal
    })).rejects.toMatchObject({
      type: 'USER_CANCELLED',
      message: 'Aborted'
    });

    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(mockTranslationService.handleTranslationRequest).toHaveBeenCalledTimes(1);
  });
});
