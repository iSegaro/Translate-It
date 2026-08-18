import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      sendMessage: vi.fn().mockResolvedValue({})
    }
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  })
}));

vi.mock('@/features/translation/core/TranslationStatsManager.js', () => ({
  statsManager: {
    printSummary: vi.fn()
  }
}));

// Mock ResourceTracker since it's a base class with some side effects
vi.mock('@/core/memory/ResourceTracker.js', () => {
  return {
    default: class ResourceTracker {
      constructor() {
        this.groupId = 'test-group';
      }
      trackInterval() {}
      cleanup() {}
    }
  };
});

vi.mock('@/features/translation/providers/utils/TraditionalTextProcessor.js', () => ({
  getTextInfo: vi.fn((item) => {
    if (typeof item === 'string') return { text: item, length: item.length };
    const text = item?.t || item?.text || '';
    return { text: String(text), length: String(text).length };
  })
}));

describe('StreamingManager', () => {
  let streamingManager;
  let MessageActions;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
    
    // Import modules dynamically to ensure mocks are applied
    const mod = await import('./StreamingManager.js');
    streamingManager = mod.streamingManager;
    
    const msgMod = await import('@/shared/messaging/core/MessageActions.js');
    MessageActions = msgMod.MessageActions;

    // Reset singleton state
    streamingManager.cleanup();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initializeStream', () => {
    it('should correctly initialize a new streaming session', () => {
      const messageId = 'test-message-id';
      const sender = { tab: { id: 1 }, frameId: 0, url: 'https://example.com' };
      const provider = { providerName: 'GoogleTranslate' };
      const segments = ['text1', 'text2'];

      const streamInfo = streamingManager.initializeStream(messageId, sender, provider, segments);

      expect(streamInfo).toBeDefined();
      expect(streamInfo.messageId).toBe(messageId);
      expect(streamInfo.providerName).toBe('GoogleTranslate');
      expect(streamInfo.totalSegments).toBe(2);
      expect(streamInfo.status).toBe('active');
      
      expect(streamingManager.activeStreams.has(messageId)).toBe(true);
      expect(streamingManager.senderInfo.has(messageId)).toBe(true);
      expect(streamingManager.streamingResults.get(messageId)).toEqual([]);
      
      expect(streamingManager.stats.totalSessions).toBe(1);
      expect(streamingManager.stats.activeSessions).toBe(1);
    });

    it('should return existing session if messageId is already active', () => {
      const messageId = 'test-message-id';
      const provider = { providerName: 'GoogleTranslate' };
      const segments = ['text1'];

      const info1 = streamingManager.initializeStream(messageId, null, provider, segments);
      const info2 = streamingManager.initializeStream(messageId, null, provider, segments);

      expect(info1).toBe(info2);
      expect(streamingManager.stats.totalSessions).toBe(1);
    });
  });

  describe('shouldUseStreaming', () => {
    it('should return false if provider does not support streaming', () => {
      const provider = { constructor: { supportsStreaming: false } };
      const segments = ['a', 'b'];
      expect(streamingManager.shouldUseStreaming(provider, segments, 'id')).toBe(false);
    });

    it('should return false if messageId is missing', () => {
      const provider = { constructor: { supportsStreaming: true } };
      const segments = ['a', 'b'];
      expect(streamingManager.shouldUseStreaming(provider, segments, null)).toBe(false);
    });

    it('should return true for multiple segments', () => {
      const provider = { constructor: { supportsStreaming: true } };
      const segments = ['a', 'b'];
      expect(streamingManager.shouldUseStreaming(provider, segments, 'id')).toBe(true);
    });

    it('should return true for high complexity single segment', () => {
      const provider = { constructor: { supportsStreaming: true } };
      const longText = 'a'.repeat(300); // Complexity will be > 100
      expect(streamingManager.shouldUseStreaming(provider, [longText], 'id')).toBe(true);
    });

    it('should return false for simple single segment', () => {
      const provider = { constructor: { supportsStreaming: true } };
      expect(streamingManager.shouldUseStreaming(provider, ['small'], 'id')).toBe(false);
    });
  });

  describe('streamBatchResults', () => {
    it('should send TRANSLATION_STREAM_UPDATE message and update results', async () => {
      const { default: browser } = await import('webextension-polyfill');
      const { statsManager } = await import('@/features/translation/core/TranslationStatsManager.js');
      
      const messageId = 'msg-123';
      const sender = { tab: { id: 999 } };
      const provider = { providerName: 'TestProvider' };
      const segments = ['s1', 's2'];

      streamingManager.initializeStream(messageId, sender, provider, segments);
      
      const batchResults = ['res1'];
      const originalBatch = ['s1'];
      
      await streamingManager.streamBatchResults(messageId, batchResults, originalBatch, 0);

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(999, expect.objectContaining({
        action: MessageActions.TRANSLATION_STREAM_UPDATE,
        data: expect.objectContaining({
          success: true,
          data: batchResults,
          batchIndex: 0
        }),
        messageId: messageId
      }));

      expect(streamingManager.getStreamResults(messageId)).toEqual(['res1']);
      expect(statsManager.printSummary).toHaveBeenCalled();
    });

    it('should handle missing sender info gracefully', async () => {
      const { default: browser } = await import('webextension-polyfill');
      const messageId = 'msg-123';
      
      streamingManager.initializeStream(messageId, null, { providerName: 'P' }, ['s1']);
      await streamingManager.streamBatchResults(messageId, ['res'], ['s1'], 0);
      
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('should target the originating iframe when sender has frameId', async () => {
      const { default: browser } = await import('webextension-polyfill');
      const messageId = 'msg-frame';
      streamingManager.initializeStream(messageId, { tab: { id: 999 }, frameId: 3 }, { providerName: 'P' }, ['s1']);

      await streamingManager.streamBatchResults(messageId, ['res'], ['s1'], 0);

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(999, expect.objectContaining({
        action: MessageActions.TRANSLATION_STREAM_UPDATE,
        messageId: messageId
      }), { frameId: 3 });
    });
  });

  describe('streamBatchError', () => {
    it('should send error update message', async () => {
      const { default: browser } = await import('webextension-polyfill');
      const messageId = 'msg-error';
      const sender = { tab: { id: 123 } };
      
      streamingManager.initializeStream(messageId, sender, { providerName: 'P' }, ['s1']);
      
      const error = new Error('Network timeout');
      error.type = 'NETWORK_ERROR';
      error.originalType = 'HTTP_ERROR';
      error.statusCode = 503;
      error.context = 'provider-request';
      error.providerName = 'Source Provider';
      error.providerId = 'source-provider';
      error.code = 'NETWORK_TIMEOUT';
      error.errorCode = 'E_NETWORK';
      error.translationOutcome = { partial: true };
      error.cause = new Error('private cause');
      error.arbitrary = { unsupported: true };
      
      await streamingManager.streamBatchError(messageId, error, 0);

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, expect.objectContaining({
        action: MessageActions.TRANSLATION_STREAM_UPDATE,
        data: expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Network timeout',
            type: 'NETWORK_ERROR',
            originalType: 'HTTP_ERROR',
            statusCode: 503,
            context: 'provider-request',
            providerName: 'Source Provider',
            providerId: 'source-provider',
            code: 'NETWORK_TIMEOUT',
            errorCode: 'E_NETWORK',
            translationOutcome: { partial: true }
          })
        })
      }));

      const streamedData = browser.tabs.sendMessage.mock.calls[0][1].data;
      expect(streamedData.timestamp).toEqual(expect.any(Number));
      const streamedError = streamedData.error;
      expect(streamedError).not.toHaveProperty('cause');
      expect(streamedError).not.toHaveProperty('arbitrary');
      expect(streamedError).not.toHaveProperty('timestamp');
    });

    it('should target the originating iframe on error', async () => {
      const { default: browser } = await import('webextension-polyfill');
      const messageId = 'msg-frame-err';
      streamingManager.initializeStream(messageId, { tab: { id: 123 }, frameId: 3 }, { providerName: 'P' }, ['s1']);

      await streamingManager.streamBatchError(messageId, new Error('boom'), 0);

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, expect.objectContaining({
        action: MessageActions.TRANSLATION_STREAM_UPDATE,
        data: expect.objectContaining({ success: false })
      }), { frameId: 3 });
    });
  });

  describe('completeStream', () => {
    it('should finalize the session and send TRANSLATION_STREAM_END', async () => {
      const { default: browser } = await import('webextension-polyfill');
      const { statsManager } = await import('@/features/translation/core/TranslationStatsManager.js');
      
      const messageId = 'msg-complete';
      const sender = { tab: { id: 123 } };
      
      streamingManager.initializeStream(messageId, sender, { providerName: 'P' }, ['s1']);
      
      await streamingManager.completeStream(messageId, true);

      const info = streamingManager.getStreamInfo(messageId);
      expect(info.status).toBe('completed');
      expect(streamingManager.stats.completedSessions).toBe(1);
      expect(streamingManager.stats.activeSessions).toBe(0);

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, expect.objectContaining({
        action: MessageActions.TRANSLATION_STREAM_END,
        data: expect.objectContaining({
          success: true,
          completed: true
        })
      }));

      expect(statsManager.printSummary).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        status: 'Streaming',
        success: true
      }));
    });

    it('should not re-complete an already completed session', async () => {
      const messageId = 'msg-complete';
      streamingManager.initializeStream(messageId, { tab: { id: 1 } }, { providerName: 'P' }, ['s1']);
      
      await streamingManager.completeStream(messageId, true);
      const statsAfterFirst = { ...streamingManager.stats };
      
      await streamingManager.completeStream(messageId, true);
      expect(streamingManager.stats).toEqual(statsAfterFirst);
    });

    it('should target the top frame with frameId 0', async () => {
      const { default: browser } = await import('webextension-polyfill');
      const messageId = 'msg-topframe';
      streamingManager.initializeStream(messageId, { tab: { id: 123 }, frameId: 0 }, { providerName: 'P' }, ['s1']);

      await streamingManager.completeStream(messageId, true);

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, expect.objectContaining({
        action: MessageActions.TRANSLATION_STREAM_END,
        data: expect.objectContaining({ success: true })
      }), { frameId: 0 });
    });
  });

  describe('handleStreamError', () => {
    it('should log error and complete stream with failure', async () => {
      const messageId = 'msg-fail';
      streamingManager.initializeStream(messageId, { tab: { id: 1 } }, { providerName: 'P' }, ['s1']);
      
      const completeSpy = vi.spyOn(streamingManager, 'completeStream');
      const error = new Error('Fatal provider error');
      error.type = 'PROVIDER_ERROR';
      error.originalType = 'HTTP_ERROR';
      error.statusCode = 502;
      error.providerName = 'Provider';
      error.providerId = 'provider-id';
      error.code = 'UPSTREAM_FAILURE';
      error.errorCode = 'E_UPSTREAM';

      await streamingManager.handleStreamError(messageId, error);

      expect(streamingManager.stats.errorSessions).toBe(1);
      expect(completeSpy).toHaveBeenCalledWith(messageId, false, expect.any(Object));
      expect(completeSpy.mock.calls[0][2].error).toMatchObject({
        message: 'Fatal provider error',
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 502,
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM'
      });
      expect(completeSpy.mock.calls[0][2].error.timestamp).toEqual(expect.any(Number));
    });
  });

  describe('cancelStream', () => {
    it('should complete a timed-out stream without marking it cancelled', async () => {
      const { default: browser } = await import('webextension-polyfill');
      const messageId = 'msg-timeout';
      streamingManager.initializeStream(messageId, { tab: { id: 1 } }, { providerName: 'P' }, ['s1']);

      await streamingManager.cancelStream(messageId, 'Translation timed out', true, 'PROGRESS_TIMEOUT');

      expect(streamingManager.getStreamInfo(messageId).status).toBe('error');
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({
        action: MessageActions.TRANSLATION_STREAM_END,
        data: expect.objectContaining({
          timedOut: true,
          cancelled: false,
          type: 'TRANSLATION_TIMEOUT',
          timeoutType: 'PROGRESS_TIMEOUT',
          error: {
            type: 'TRANSLATION_TIMEOUT',
            message: 'Translation timed out'
          }
        })
      }));
    });

    it.each(['FINAL_TIMEOUT', undefined])('preserves timeout reason for %s subtype', async (timeoutType) => {
      const { default: browser } = await import('webextension-polyfill');
      const messageId = `msg-timeout-${timeoutType || 'unknown'}`;
      streamingManager.initializeStream(messageId, { tab: { id: 1 } }, { providerName: 'P' }, ['s1']);

      await streamingManager.cancelStream(messageId, 'Streaming translation timed out', true, timeoutType);

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({
        action: MessageActions.TRANSLATION_STREAM_END,
        data: expect.objectContaining({
          timedOut: true,
          cancelled: false,
          type: 'TRANSLATION_TIMEOUT',
          timeoutType,
          error: {
            type: 'TRANSLATION_TIMEOUT',
            message: 'Streaming translation timed out'
          }
        })
      }));
    });

    it('keeps timeout completion targeted at the originating frame', async () => {
      const { default: browser } = await import('webextension-polyfill');
      const messageId = 'msg-timeout-frame';
      streamingManager.initializeStream(messageId, { tab: { id: 1 }, frameId: 3 }, { providerName: 'P' }, ['s1']);

      await streamingManager.cancelStream(messageId, 'Translation timed out', true, 'PROGRESS_TIMEOUT');

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({
        action: MessageActions.TRANSLATION_STREAM_END,
        data: expect.objectContaining({ timedOut: true })
      }), { frameId: 3 });
    });

    it('should mark stream as cancelled and complete it', async () => {
      const messageId = 'msg-cancel';
      streamingManager.initializeStream(messageId, { tab: { id: 1 } }, { providerName: 'P' }, ['s1']);
      
      const completeSpy = vi.spyOn(streamingManager, 'completeStream');
      
      await streamingManager.cancelStream(messageId, 'User clicked stop');
      
      const info = streamingManager.getStreamInfo(messageId);
      expect(info.status).toBe('cancelled');
      expect(info.cancellationReason).toBe('User clicked stop');
      expect(completeSpy).toHaveBeenCalledWith(messageId, false, expect.objectContaining({
         cancelled: true,
         reason: 'User clicked stop'
       }), true);
     });

    it('preserves cancellation when a late provider completion arrives', async () => {
      const messageId = 'msg-cancel-late-complete';
      streamingManager.initializeStream(messageId, { tab: { id: 1 } }, { providerName: 'P' }, ['s1']);

      await streamingManager.cancelStream(messageId);
      await streamingManager.completeStream(messageId, true);

      expect(streamingManager.getStreamInfo(messageId).status).toBe('cancelled');
    });

    it('does not deliver late stream chunks after cancellation', async () => {
      const { default: browser } = await import('webextension-polyfill');
      const messageId = 'msg-cancel-late-chunk';
      streamingManager.initializeStream(messageId, { tab: { id: 1 } }, { providerName: 'P' }, ['s1']);

      await streamingManager.cancelStream(messageId);
      await streamingManager.streamBatchResults(messageId, ['late'], ['s1'], 0);

      const messages = browser.tabs.sendMessage.mock.calls.map(([, message]) => message);
      expect(messages).toEqual([expect.objectContaining({
        action: MessageActions.TRANSLATION_STREAM_END,
        data: expect.objectContaining({ cancelled: true })
      })]);
      expect(messages).not.toContainEqual(expect.objectContaining({
        action: MessageActions.TRANSLATION_STREAM_UPDATE
      }));
      expect(streamingManager.getStreamResults(messageId)).toEqual([]);
    });

    it('preserves error when a late provider completion arrives', async () => {
      const messageId = 'msg-error-late-complete';
      streamingManager.initializeStream(messageId, { tab: { id: 1 } }, { providerName: 'P' }, ['s1']);

      await streamingManager.completeStream(messageId, false);
      await streamingManager.completeStream(messageId, true);

      expect(streamingManager.getStreamInfo(messageId).status).toBe('error');
    });

    it('keeps cancellation idempotent and schedules delayed cleanup', async () => {
      const { default: browser } = await import('webextension-polyfill');
      const messageId = 'msg-cancel-cleanup';
      streamingManager.initializeStream(messageId, { tab: { id: 1 } }, { providerName: 'P' }, ['s1']);

      await streamingManager.cancelStream(messageId);
      await streamingManager.cancelStream(messageId);

      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(1);
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({
        action: MessageActions.TRANSLATION_STREAM_END,
        data: expect.objectContaining({ cancelled: true })
      }));
      expect(streamingManager.stats).toMatchObject({ activeSessions: 0, errorSessions: 1 });
      expect(vi.getTimerCount()).toBe(1);

      vi.advanceTimersByTime(30000);

      expect(streamingManager.activeStreams.has(messageId)).toBe(false);
    });
  });

  describe('Cleanup Logic', () => {
    it('_cleanupStream should remove session data after delay', async () => {
      const messageId = 'msg-delay-cleanup';
      streamingManager.initializeStream(messageId, null, { providerName: 'P' }, ['s1']);
      
      // Trigger internal cleanup via completeStream or manual call
      streamingManager.completeStream(messageId);
      
      expect(streamingManager.activeStreams.has(messageId)).toBe(true);
      
      // Advance timers by 30 seconds (internal delay)
      vi.advanceTimersByTime(30000);
      
      expect(streamingManager.activeStreams.has(messageId)).toBe(false);
      expect(streamingManager.senderInfo.has(messageId)).toBe(false);
    });

    it('cleanupOldStreams should remove stale sessions', () => {
      const messageId = 'stale-msg';
      const info = streamingManager.initializeStream(messageId, null, { providerName: 'P' }, ['s1']);
      
      // Mark as completed in the past
      info.status = 'completed';
      info.endTime = Date.now() - (11 * 60 * 1000); // 11 mins ago
      
      streamingManager.cleanupOldStreams();
      
      // Since it calls _cleanupStream which has a setTimeout, we need to advance timers
      vi.advanceTimersByTime(30000);
      
      expect(streamingManager.activeStreams.has(messageId)).toBe(false);
    });

    it('cleanup should immediately reset everything', () => {
      streamingManager.initializeStream('m1', null, { providerName: 'G' }, ['s1']);
      streamingManager.stats.totalSessions = 10;
      
      streamingManager.cleanup();
      
      expect(streamingManager.activeStreams.size).toBe(0);
      expect(streamingManager.stats.totalSessions).toBe(0);
    });
  });
});
