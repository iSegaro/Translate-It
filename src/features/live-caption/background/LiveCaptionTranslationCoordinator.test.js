import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCaptionTranslationCoordinator } from './LiveCaptionTranslationCoordinator.js';
import { LiveCaptionSessionManager } from '../core/LiveCaptionSessionManager.js';
import { LiveCaptionCaptureCoordinator } from './LiveCaptionCaptureCoordinator.js';
import { VideoCaptionSession } from '../core/VideoCaptionSession.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

function createCanonicalTranscriptSegment(overrides = {}) {
  return {
    sessionId: 'session-1',
    tabId: 7,
    videoFingerprint: 'video-a',
    segmentId: 'segment-1',
    revision: 1,
    startMs: 0,
    endMs: 3000,
    text: 'Hello',
    ...overrides
  };
}

describe('LiveCaptionTranslationCoordinator', () => {
  let sessionManager;
  let captureCoordinator;
  let mockAdapter;
  let mockCache;
  let mockBrowserApi;
  let coordinator;

  beforeEach(() => {
    sessionManager = new LiveCaptionSessionManager();
    captureCoordinator = new LiveCaptionCaptureCoordinator();

    mockAdapter = {
      translateFinalizedSegment: vi.fn().mockImplementation((segment) => {
        return Promise.resolve({
          sessionId: segment.sessionId,
          videoFingerprint: segment.videoFingerprint,
          segmentStartMs: segment.segmentStartMs ?? segment.startMs,
          segmentEndMs: segment.segmentEndMs ?? segment.endMs,
          originalText: segment.originalText ?? segment.text,
          translatedText: 'Translated: ' + (segment.originalText ?? segment.text),
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          provider: 'google',
          isFinal: true
        });
      })
    };

    mockCache = {
      appendTranslatedCaptionSegment: vi.fn().mockResolvedValue({}),
      upsertTranslatedCaptionSegmentByIdentity: vi.fn().mockResolvedValue({})
    };

    mockBrowserApi = {
      tabs: {
        sendMessage: vi.fn().mockResolvedValue(undefined)
      }
    };

    coordinator = new LiveCaptionTranslationCoordinator({
      sessionManager,
      captureCoordinator,
      translationAdapter: mockAdapter,
      cache: mockCache,
      browserApi: mockBrowserApi
    });
  });

  it('ignores segments for inactive or invalid sessions', async () => {
    const segment = {
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      startMs: 0,
      endMs: 3000,
      text: 'Hello'
    };

    await coordinator.handleTranscriptSegment(segment, { tabId: 7 });
    expect(mockAdapter.translateFinalizedSegment).not.toHaveBeenCalled();

    // Create page session, but no active video session
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    await coordinator.handleTranscriptSegment(segment, { tabId: 7 });
    expect(mockAdapter.translateFinalizedSegment).not.toHaveBeenCalled();
  });

  it('queues segments and processes them sequentially (FIFO) preserving order', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranslatedCaptionSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;

    // Control translation resolver to force queue accumulation
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    mockAdapter.translateFinalizedSegment = vi.fn()
      .mockImplementationOnce(() => firstPromise.then(() => ({
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        segmentStartMs: 0,
        segmentEndMs: 3000,
        originalText: 'First',
        translatedText: 'Translated First',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        provider: 'google',
        isFinal: true
      })))
      .mockImplementationOnce(() => Promise.resolve({
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        segmentStartMs: 3000,
        segmentEndMs: 6000,
        originalText: 'Second',
        translatedText: 'Translated Second',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        provider: 'google',
        isFinal: true
      }));

    const segment1 = {
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      startMs: 0,
      endMs: 3000,
      text: 'First'
    };

    const segment2 = {
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      startMs: 3000,
      endMs: 6000,
      text: 'Second'
    };

    await coordinator.handleTranscriptSegment(segment1, { tabId: 7 });
    expect(mockAdapter.translateFinalizedSegment).toHaveBeenCalledTimes(1);

    // Enqueue second segment while first is in-flight
    await coordinator.handleTranscriptSegment(segment2, { tabId: 7 });
    expect(mockAdapter.translateFinalizedSegment).toHaveBeenCalledTimes(1);

    // Resolve first request
    resolveFirst();

    // Allow queue to run microtasks
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockAdapter.translateFinalizedSegment).toHaveBeenCalledTimes(2);
    expect(mockVideoSession.addTranslatedCaptionSegment).toHaveBeenCalledTimes(2);

    expect(mockVideoSession.addTranslatedCaptionSegment).toHaveBeenNthCalledWith(1, expect.objectContaining({
      translatedText: 'Translated First',
      segmentStartMs: 0,
      segmentEndMs: 3000
    }));

    expect(mockVideoSession.addTranslatedCaptionSegment).toHaveBeenNthCalledWith(2, expect.objectContaining({
      translatedText: 'Translated Second',
      segmentStartMs: 3000,
      segmentEndMs: 6000
    }));

    expect(mockCache.appendTranslatedCaptionSegment).toHaveBeenCalledTimes(2);
    expect(mockCache.appendTranslatedCaptionSegment).toHaveBeenCalledWith(expect.objectContaining({
      translatedText: 'Translated First',
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      isIncognito: false
    }));
  });

  it('does not enqueue duplicate canonical finals with the same revision twice', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const videoSession = new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: 'video-a',
      sessionId: 'video-1'
    });
    pageSession.activeVideoSession = videoSession;
    const upsertTranslatedSpy = vi.spyOn(videoSession, 'upsertTranslatedCaptionSegment');
    const addTranslatedSpy = vi.spyOn(videoSession, 'addTranslatedCaptionSegment');
    videoSession.upsertTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 1,
      text: 'Hello'
    }));

    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    mockAdapter.translateFinalizedSegment = vi.fn().mockImplementation(() => firstPromise.then(() => ({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 0,
      segmentEndMs: 3000,
      originalText: 'Hello',
      translatedText: 'Translated Hello',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'google',
      isFinal: true
    })));

    const duplicateSegment = createCanonicalTranscriptSegment({
      revision: 1,
      text: 'Hello'
    });

    await coordinator.handleTranscriptSegment(duplicateSegment, { tabId: 7 });
    await coordinator.handleTranscriptSegment(duplicateSegment, { tabId: 7 });

    const queue = coordinator.getOrCreateQueue('session-1');
    expect(queue.segments.length).toBe(1);
    expect(mockAdapter.translateFinalizedSegment).toHaveBeenCalledTimes(1);

    resolveFirst();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockAdapter.translateFinalizedSegment).toHaveBeenCalledTimes(1);
    expect(addTranslatedSpy).toHaveBeenCalledTimes(0);
    expect(upsertTranslatedSpy).toHaveBeenCalledTimes(1);
    expect(mockCache.upsertTranslatedCaptionSegmentByIdentity).toHaveBeenCalledTimes(1);
    expect(captureCoordinator.status).not.toBe('error');
    expect(pageSession.lifecycleState).not.toBe('error');
  });

  it('drops stale queued canonical revisions before translation', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const videoSession = new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: 'video-a',
      sessionId: 'video-1'
    });
    pageSession.activeVideoSession = videoSession;
    const upsertTranslatedSpy = vi.spyOn(videoSession, 'upsertTranslatedCaptionSegment');
    videoSession.upsertTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 2,
      text: 'Hello corrected'
    }));

    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    const translatedSegments = [];
    mockAdapter.translateFinalizedSegment = vi.fn().mockImplementation((segment) => {
      translatedSegments.push(segment);
      if (segment.revision === 2) {
        return firstPromise.then(() => ({
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          segmentStartMs: segment.startMs,
          segmentEndMs: segment.endMs,
          originalText: segment.text,
          translatedText: 'Translated current',
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          provider: 'google',
          isFinal: true
        }));
      }

      return Promise.resolve({
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        segmentStartMs: segment.startMs,
        segmentEndMs: segment.endMs,
        originalText: segment.text,
        translatedText: 'Translated stale',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        provider: 'google',
        isFinal: true
      });
    });

    await coordinator.handleTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 2,
      text: 'Hello corrected'
    }), { tabId: 7 });

    await coordinator.handleTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 1,
      text: 'Hello'
    }), { tabId: 7 });

    expect(mockAdapter.translateFinalizedSegment).toHaveBeenCalledTimes(1);

    resolveFirst();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(translatedSegments.map((segment) => segment.revision)).toEqual([2]);
    expect(mockAdapter.translateFinalizedSegment).toHaveBeenCalledTimes(1);
    expect(upsertTranslatedSpy).toHaveBeenCalledTimes(1);
    expect(upsertTranslatedSpy).toHaveBeenCalledWith(expect.objectContaining({
      revision: 2,
      translatedText: 'Translated current'
    }), expect.objectContaining({
      compareRevision: false
    }));
    expect(mockCache.upsertTranslatedCaptionSegmentByIdentity).toHaveBeenCalledTimes(1);
    expect(mockCache.appendTranslatedCaptionSegment).not.toHaveBeenCalled();
    expect(pageSession.lifecycleState).not.toBe('error');
    expect(captureCoordinator.status).not.toBe('error');
  });

  it('drops oldest queued segments on overflow instead of failing closed', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranslatedCaptionSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;
    captureCoordinator.setSessionContext({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const translatedSegments = [];
    mockAdapter.translateFinalizedSegment = vi.fn().mockImplementation((segment) => {
      translatedSegments.push(segment);
      if (segment.startMs === 0) {
        return firstPromise.then(() => ({
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          segmentStartMs: segment.startMs,
          segmentEndMs: segment.endMs,
          originalText: segment.text,
          translatedText: 'Translated 0',
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          provider: 'google',
          isFinal: true
        }));
      }

      return Promise.resolve({
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        segmentStartMs: segment.startMs,
        segmentEndMs: segment.endMs,
        originalText: segment.text,
        translatedText: `Translated ${segment.startMs}`,
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        provider: 'google',
        isFinal: true
      });
    });

    const createSegment = (startMs) => ({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      startMs,
      endMs: startMs + 3000,
      text: 'Text'
    });

    for (let i = 0; i < 5; i++) {
      await coordinator.handleTranscriptSegment(createSegment(i * 3000), { tabId: 7 });
    }

    const queue = coordinator.getOrCreateQueue('session-1');
    expect(queue.segments.length).toBe(5);

    await coordinator.handleTranscriptSegment(createSegment(15000), { tabId: 7 });

    expect(pageSession.lifecycleState).not.toBe('error');
    expect(captureCoordinator.status).not.toBe('error');
    expect(coordinator.sessionQueues.has('session-1')).toBe(true);
    expect(queue.segments.length).toBe(5);

    resolveFirst();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(translatedSegments.map((segment) => segment.startMs)).toEqual([0, 6000, 9000, 12000, 15000]);
    expect(mockAdapter.translateFinalizedSegment).toHaveBeenCalledTimes(5);
  });

  it('preserves the in-flight head segment when overflow evicts queued work', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranslatedCaptionSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;
    captureCoordinator.setSessionContext({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    const translatedSegments = [];
    mockAdapter.translateFinalizedSegment = vi.fn().mockImplementation((segment) => {
      translatedSegments.push(segment);
      if (segment.startMs === 0) {
        return firstPromise.then(() => ({
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          segmentStartMs: segment.startMs,
          segmentEndMs: segment.endMs,
          originalText: segment.text,
          translatedText: 'Translated 0',
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          provider: 'google',
          isFinal: true
        }));
      }

      return Promise.resolve({
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        segmentStartMs: segment.startMs,
        segmentEndMs: segment.endMs,
        originalText: segment.text,
        translatedText: `Translated ${segment.startMs}`,
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        provider: 'google',
        isFinal: true
      });
    });

    const createSegment = (startMs) => ({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      startMs,
      endMs: startMs + 3000,
      text: `Text ${startMs}`
    });

    await coordinator.handleTranscriptSegment(createSegment(0), { tabId: 7 });

    const queue = coordinator.getOrCreateQueue('session-1');
    expect(queue.processing).toBe(true);
    expect(queue.segments.map((segment) => segment.startMs)).toEqual([0]);

    await coordinator.handleTranscriptSegment(createSegment(3000), { tabId: 7 });
    await coordinator.handleTranscriptSegment(createSegment(6000), { tabId: 7 });
    await coordinator.handleTranscriptSegment(createSegment(9000), { tabId: 7 });
    await coordinator.handleTranscriptSegment(createSegment(12000), { tabId: 7 });
    await coordinator.handleTranscriptSegment(createSegment(15000), { tabId: 7 });

    expect(queue.segments.map((segment) => segment.startMs)).toEqual([0, 6000, 9000, 12000, 15000]);
    expect(queue.segments.some((segment) => segment.startMs === 3000)).toBe(false);
    expect(queue.processing).toBe(true);
    expect(mockAdapter.translateFinalizedSegment).toHaveBeenCalledTimes(1);
    expect(translatedSegments.map((segment) => segment.startMs)).toEqual([0]);

    resolveFirst();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockAdapter.translateFinalizedSegment).toHaveBeenCalledTimes(5);
    expect(translatedSegments.map((segment) => segment.startMs)).toEqual([0, 6000, 9000, 12000, 15000]);
    expect(mockVideoSession.addTranslatedCaptionSegment).toHaveBeenCalledTimes(5);
    expect(mockVideoSession.addTranslatedCaptionSegment).toHaveBeenNthCalledWith(1, expect.objectContaining({
      translatedText: 'Translated 0',
      segmentStartMs: 0,
      segmentEndMs: 3000
    }));
    expect(pageSession.lifecycleState).not.toBe('error');
    expect(captureCoordinator.status).not.toBe('error');
  });

  it('aborts active translation and clears queue on stop', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranslatedCaptionSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;

    let aborted = false;
    mockAdapter.translateFinalizedSegment = vi.fn().mockImplementation((segment, options) => {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    await coordinator.handleTranscriptSegment({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      startMs: 0,
      endMs: 3000,
      text: 'Hi'
    }, { tabId: 7 });

    coordinator.stopSession('session-1');

    expect(aborted).toBe(true);
    expect(coordinator.sessionQueues.has('session-1')).toBe(false);
  });

  it('aborts active translation and clears queue on pause', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranslatedCaptionSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;

    let aborted = false;
    mockAdapter.translateFinalizedSegment = vi.fn().mockImplementation((segment, options) => {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    await coordinator.handleTranscriptSegment({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      startMs: 0,
      endMs: 3000,
      text: 'Hi'
    }, { tabId: 7 });

    coordinator.pauseSession('session-1');

    expect(aborted).toBe(true);
    expect(coordinator.sessionQueues.has('session-1')).toBe(false);
  });

  it('handles provider failures and transitions to error state (fail closed)', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranslatedCaptionSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;
    captureCoordinator.setSessionContext({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    const error = new Error('Translation failed');
    error.code = 'translation_failed';
    mockAdapter.translateFinalizedSegment = vi.fn().mockRejectedValue(error);

    await coordinator.handleTranscriptSegment({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      startMs: 0,
      endMs: 3000,
      text: 'Hi'
    }, { tabId: 7 });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(pageSession.lifecycleState).toBe('error');
    expect(captureCoordinator.status).toBe('error');
    expect(coordinator.sessionQueues.has('session-1')).toBe(false);
  });

  it('rejects invalid segments and fails closed', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranslatedCaptionSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;
    captureCoordinator.setSessionContext({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    // Segment missing startMs
    const invalidSegment = {
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      text: 'Hello'
    };

    await expect(coordinator.handleTranscriptSegment(invalidSegment, { tabId: 7 }))
      .rejects.toThrow();

    expect(pageSession.lifecycleState).toBe('error');
    expect(captureCoordinator.status).toBe('error');
  });

  it('persists translated segments to cache', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranslatedCaptionSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;

    await coordinator.handleTranscriptSegment({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      startMs: 0,
      endMs: 3000,
      text: 'Hi'
    }, { tabId: 7 });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockAdapter.translateFinalizedSegment).toHaveBeenCalledTimes(1);
    expect(mockVideoSession.addTranslatedCaptionSegment).toHaveBeenCalledTimes(1);
    expect(mockCache.appendTranslatedCaptionSegment).toHaveBeenCalledTimes(1);
    expect(mockCache.appendTranslatedCaptionSegment).toHaveBeenCalledWith(expect.objectContaining({
      originalText: 'Hi',
      translatedText: 'Translated: Hi'
    }));
  });

  it('preserves optional provider identity metadata fields during translation', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const mockVideoSession = {
      sessionId: 'video-1',
      videoFingerprint: 'video-a',
      addTranslatedCaptionSegment: vi.fn()
    };
    pageSession.activeVideoSession = mockVideoSession;

    await coordinator.handleTranscriptSegment({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      startMs: 0,
      endMs: 3000,
      text: 'Hi',
      providerUtteranceId: 'utt-123',
      providerSequence: 12,
      providerRevision: 3,
      providerStreamId: 'stream-xyz',
      providerChannel: 2
    }, { tabId: 7 });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockAdapter.translateFinalizedSegment).toHaveBeenCalledTimes(1);
    expect(mockVideoSession.addTranslatedCaptionSegment).toHaveBeenCalledTimes(1);
    expect(mockVideoSession.addTranslatedCaptionSegment).toHaveBeenCalledWith(expect.objectContaining({
      providerUtteranceId: 'utt-123',
      providerSequence: 12,
      providerRevision: 3,
      providerStreamId: 'stream-xyz',
      providerChannel: 2
    }));
    expect(mockCache.appendTranslatedCaptionSegment).toHaveBeenCalledTimes(1);
    expect(mockCache.appendTranslatedCaptionSegment).toHaveBeenCalledWith(expect.objectContaining({
      providerUtteranceId: 'utt-123',
      providerSequence: 12,
      providerRevision: 3,
      providerStreamId: 'stream-xyz',
      providerChannel: 2
    }));
  });

  it('retranslates the latest canonical correction revision and prunes stale queued work', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const videoSession = new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: 'video-a',
      sessionId: 'video-1'
    });
    pageSession.activeVideoSession = videoSession;
    const upsertTranslatedSpy = vi.spyOn(videoSession, 'upsertTranslatedCaptionSegment');
    videoSession.upsertTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 1,
      text: 'Hello'
    }));

    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    const translatedSegments = [];
    mockAdapter.translateFinalizedSegment = vi.fn().mockImplementation((segment) => {
      translatedSegments.push(segment);
      if (segment.revision === 1) {
        return firstPromise.then(() => ({
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          segmentStartMs: segment.startMs,
          segmentEndMs: segment.endMs,
          originalText: segment.text,
          translatedText: 'Translated stale',
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          provider: 'google',
          isFinal: true
        }));
      }

      return Promise.resolve({
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        segmentStartMs: segment.startMs,
        segmentEndMs: segment.endMs,
        originalText: segment.text,
        translatedText: 'Translated correction',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        provider: 'google',
        isFinal: true
      });
    });

    await coordinator.handleTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 1,
      text: 'Hello'
    }), { tabId: 7 });

    await coordinator.handleTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 2,
      text: 'Hello corrected'
    }), { tabId: 7 });

    videoSession.upsertTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 2,
      text: 'Hello corrected'
    }));

    resolveFirst();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(translatedSegments.map((segment) => segment.revision)).toEqual([1, 2]);
    expect(upsertTranslatedSpy).toHaveBeenCalledTimes(1);
    expect(upsertTranslatedSpy).toHaveBeenCalledWith(expect.objectContaining({
      revision: 2,
      translatedText: 'Translated correction'
    }), expect.objectContaining({
      compareRevision: false
    }));
    expect(mockCache.upsertTranslatedCaptionSegmentByIdentity).toHaveBeenCalledTimes(1);
    expect(pageSession.lifecycleState).not.toBe('error');
    expect(captureCoordinator.status).not.toBe('error');
  });

  it('commits canonical translated captions when the current transcript revision matches', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const videoSession = new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: 'video-a',
      sessionId: 'video-1'
    });
    pageSession.activeVideoSession = videoSession;
    videoSession.upsertTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 1,
      text: 'Hello'
    }));

    mockAdapter.translateFinalizedSegment = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 0,
      segmentEndMs: 3000,
      originalText: 'Hello',
      translatedText: 'سلام',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'google',
      isFinal: true
    });

    await coordinator.handleTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 1,
      text: 'Hello'
    }), { tabId: 7 });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(videoSession.translatedCaptionSegments).toHaveLength(1);
    expect(videoSession.getTranslatedCaptionSegmentByIdentity({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      segmentId: 'segment-1'
    })).toMatchObject({
      originalText: 'Hello',
      translatedText: 'سلام',
      segmentId: 'segment-1',
      revision: 1
    });
    expect(mockCache.upsertTranslatedCaptionSegmentByIdentity).toHaveBeenCalledTimes(1);
    expect(mockCache.upsertTranslatedCaptionSegmentByIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        tabId: 7,
        videoFingerprint: 'video-a',
        segmentId: 'segment-1',
        revision: 1,
        originalText: 'Hello',
        translatedText: 'سلام'
      }),
      { compareRevision: false }
    );
    expect(mockCache.appendTranslatedCaptionSegment).not.toHaveBeenCalled();
    expect(mockBrowserApi.tabs.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('allows equal canonical transcript revisions to commit and replace translated captions by identity', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const videoSession = new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: 'video-a',
      sessionId: 'video-1'
    });
    pageSession.activeVideoSession = videoSession;
    const upsertTranslatedSpy = vi.spyOn(videoSession, 'upsertTranslatedCaptionSegment');
    videoSession.upsertTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 1,
      text: 'Hello'
    }));

    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockAdapter.translateFinalizedSegment = vi.fn().mockImplementation((segment) => {
      if (segment.revision === 1 && segment.startMs === 0) {
        return firstPromise.then(() => ({
          sessionId: 'session-1',
          videoFingerprint: 'video-a',
          segmentStartMs: 0,
          segmentEndMs: 3000,
          originalText: 'Hello',
          translatedText: 'سلام',
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          provider: 'google',
          isFinal: true
        }));
      }

      return Promise.resolve({
        sessionId: 'session-1',
        videoFingerprint: 'video-a',
        segmentStartMs: 0,
        segmentEndMs: 3000,
        originalText: 'Hello',
        translatedText: 'سلام',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        provider: 'google',
        isFinal: true
      });
    });

    await coordinator.handleTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 1,
      text: 'Hello'
    }), { tabId: 7 });

    resolveFirst();
    await new Promise((resolve) => setTimeout(resolve, 10));

    await coordinator.handleTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 1,
      text: 'Hello'
    }), { tabId: 7 });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(videoSession.translatedCaptionSegments).toHaveLength(1);
    expect(videoSession.getTranslatedCaptionSegmentByIdentity({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      segmentId: 'segment-1'
    })).toMatchObject({
      originalText: 'Hello',
      translatedText: 'سلام',
      segmentId: 'segment-1',
      revision: 1
    });
    expect(mockCache.upsertTranslatedCaptionSegmentByIdentity).toHaveBeenCalledTimes(2);
    expect(mockCache.appendTranslatedCaptionSegment).not.toHaveBeenCalled();
    expect(mockBrowserApi.tabs.sendMessage).toHaveBeenCalledTimes(2);
    expect(upsertTranslatedSpy).toHaveBeenCalledTimes(2);
  });

  it('suppresses stale canonical translated captions when the active transcript revision is newer', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    const videoSession = new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: 'video-a',
      sessionId: 'video-1'
    });
    pageSession.activeVideoSession = videoSession;
    videoSession.upsertTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 1,
      text: 'Hello'
    }));

    let resolveTranslation;
    mockAdapter.translateFinalizedSegment = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveTranslation = resolve;
    }));

    const translatePromise = coordinator.handleTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 1,
      text: 'Hello'
    }), { tabId: 7 });

    await new Promise((resolve) => setTimeout(resolve, 0));
    videoSession.upsertTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 2,
      text: 'Hello corrected'
    }));

    resolveTranslation({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 0,
      segmentEndMs: 3000,
      originalText: 'Hello',
      translatedText: 'سلام',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'google',
      isFinal: true
    });

    await translatePromise;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(videoSession.translatedCaptionSegments).toHaveLength(0);
    expect(mockCache.upsertTranslatedCaptionSegmentByIdentity).not.toHaveBeenCalled();
    expect(mockCache.appendTranslatedCaptionSegment).not.toHaveBeenCalled();
    expect(mockBrowserApi.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('suppresses canonical translated captions when the current transcript is missing', async () => {
    const pageSession = sessionManager.getOrCreateSession(7);
    pageSession.sessionId = 'session-1';
    pageSession.activeVideoSession = new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: 'video-a',
      sessionId: 'video-1'
    });

    mockAdapter.translateFinalizedSegment = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      segmentStartMs: 0,
      segmentEndMs: 3000,
      originalText: 'Hello',
      translatedText: 'سلام',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'google',
      isFinal: true
    });

    await coordinator.handleTranscriptSegment(createCanonicalTranscriptSegment({
      revision: 1,
      text: 'Hello'
    }), { tabId: 7 });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(pageSession.activeVideoSession.translatedCaptionSegments).toHaveLength(0);
    expect(mockCache.upsertTranslatedCaptionSegmentByIdentity).not.toHaveBeenCalled();
    expect(mockCache.appendTranslatedCaptionSegment).not.toHaveBeenCalled();
    expect(mockBrowserApi.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
