import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Mock webextension-polyfill FIRST
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { sendMessage: vi.fn(), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
    storage: { local: { get: vi.fn(), set: vi.fn() } },
  }
}));

// 2. Mock ExtensionContextManager BEFORE other imports
vi.mock('@/core/extensionContext.js', () => {
  const Mock = {
    safeSendMessage: vi.fn(),
    isValidSync: vi.fn(() => true),
    isContextError: vi.fn(() => false),
    handleContextError: vi.fn(),
  };
  return {
    default: Mock,
    ExtensionContextManager: Mock,
    isExtensionContextValid: vi.fn(() => true),
    isContextError: vi.fn(() => false)
  };
});

import { PageTranslationScheduler } from './PageTranslationScheduler.js';
import { isFatalError, matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { PageTranslationQueueFilter } from './utils/PageTranslationQueueFilter.js';
import { PageTranslationFluidFilter } from './utils/PageTranslationFluidFilter.js';
import { safeSendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

// 3. Mock other dependencies
vi.mock('./utils/PageTranslationQueueFilter.js', () => ({
  PageTranslationQueueFilter: { process: vi.fn() }
}));

vi.mock('./utils/PageTranslationFluidFilter.js', () => ({
  PageTranslationFluidFilter: { process: vi.fn() }
}));

vi.mock('./PageTranslationHelper.js', () => ({
  PageTranslationHelper: {
    shouldTranslate: vi.fn(() => true),
    getNearestSemanticContainer: vi.fn(() => null)
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    init: vi.fn(),
    debugLazy: vi.fn()
  }))
}));

vi.mock('@/shared/error-management/ErrorMatcher.js');

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  safeSendMessage: vi.fn(() => Promise.resolve({ success: true })),
  sendRegularMessage: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('@/config.js', () => ({
  getTranslationApiAsync: vi.fn(async () => 'google'),
  getTargetLanguageAsync: vi.fn(async () => 'fa')
}));

describe('PageTranslationScheduler', () => {
  let scheduler;

  const getSettlement = (resolver) => resolver.mock.calls.at(-1)[0];
  const expectSettlement = (resolver, text) => {
    expect(getSettlement(resolver)).toEqual(expect.objectContaining({
      __pageTranslationSettlement: true,
      text,
    }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock behavior for ErrorMatcher
    matchErrorToType.mockImplementation((err) => {
      if (err?.type) return err.type;
      if (err?.errorType) return err.errorType;
      return 'UNKNOWN';
    });
    isFatalError.mockImplementation((type) => {
      return type === 'EXTENSION_CONTEXT_INVALIDATED';
    });

    scheduler = new PageTranslationScheduler();
    scheduler.setTranslationState(true, 'test-session-123', { pageTitle: 'Test Page' });
    
    // Default mock behavior for filters
    const defaultResult = {
      batchItems: [],
      remainingItems: [],
      purgedCount: 0,
      ejectedItems: []
    };
    PageTranslationQueueFilter.process.mockReturnValue({ ...defaultResult });
    PageTranslationFluidFilter.process.mockReturnValue({ ...defaultResult });
  });

  afterEach(() => {
    scheduler.stop();
    scheduler.reset();
  });

  describe('Initialization & State', () => {
    it('should initialize with correct default state', () => {
      expect(scheduler.isTranslated).toBe(true);
      expect(scheduler.queue).toHaveLength(0);
      expect(scheduler.translationSessionId).toBe('test-session-123');
    });

    it('should reset state correctly', () => {
      scheduler.translatedCount = 10;
      scheduler.totalTasks = 20;
      scheduler.reset();
      expect(scheduler.translatedCount).toBe(0);
      expect(scheduler.totalTasks).toBe(0);
      expect(scheduler.isTranslated).toBe(false);
    });
  });

  describe('Queue Management', () => {
    it('should track high priority items correctly', () => {
      scheduler.enqueue('Normal priority', null, 0.5);
      expect(scheduler.highPriorityCount).toBe(0);
      
      scheduler.enqueue('High priority', null, 2); // score 2 > threshold 1
      expect(scheduler.highPriorityCount).toBe(1);
    });
  });

  describe('Batch Execution (Fluid Mode)', () => {
    it('defers success accounting until settlement acceptance', async () => {
      const mockItem = { text: 'Hello', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);
      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [mockItem], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });
      safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify(['سلام'])
      });

      await scheduler.flush();

      const settlement = getSettlement(mockItem.resolve);
      expect(settlement.state).toBe('pending');
      expect(scheduler.translatedCount).toBe(0);
      settlement.settle('stale');
      expect(scheduler.translatedCount).toBe(0);
      expect(scheduler.failedCount).toBe(1);
    });

    it('cancels pending settlements without manufacturing failure counts', async () => {
      const mockItem = { text: 'Hello', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);
      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [mockItem], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });
      safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify(['سلام'])
      });

      await scheduler.flush();

      const settlement = getSettlement(mockItem.resolve);
      scheduler.stop();
      expect(settlement.state).toBe('cancelled');
      expect(scheduler.translatedCount).toBe(0);
      expect(scheduler.failedCount).toBe(0);
      expect(settlement.settle('accepted')).toBe(false);
    });

    it('emits completion once after stale settlement', async () => {
      vi.useFakeTimers();
      try {
        const emitSpy = vi.spyOn(pageEventBus, 'emit');
        const mockItem = { text: 'Hello', resolve: vi.fn(), score: 1 };
        scheduler.queue.push(mockItem);
        scheduler.totalTasks = 1;
        PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [mockItem], remainingItems: [] });
        vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });
        safeSendMessage.mockResolvedValue({
          success: true,
          translatedText: JSON.stringify(['سلام'])
        });

        await scheduler.flush();
        getSettlement(mockItem.resolve).settle('stale');
        await vi.advanceTimersByTimeAsync(600);

        expect(emitSpy.mock.calls.filter(([event]) => event === MessageActions.PAGE_TRANSLATE_COMPLETE))
          .toHaveLength(1);
        emitSpy.mockRestore();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should process a successful batch translation', async () => {
      const mockItem = { text: 'Hello', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);
      
      PageTranslationFluidFilter.process.mockReturnValue({
        batchItems: [mockItem],
        remainingItems: [],
        purgedCount: 0,
        ejectedItems: []
      });

      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({
        providerRegistryId: 'google',
        targetLanguage: 'fa'
      });

      safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify(['سلام'])
      });

      await scheduler.flush();

      expect(safeSendMessage).toHaveBeenCalled();
       expectSettlement(mockItem.resolve, 'سلام');
       getSettlement(mockItem.resolve).settle('accepted');
       expect(scheduler.translatedCount).toBe(1);
    });

    it.each(['', '   ', '\n\t'])('should preserve original and count blank result as failed: %j', async (blankText) => {
      const mockItem = { text: 'Original', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);

      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [mockItem], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });
      safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify([blankText])
      });

      await scheduler.flush();

       expectSettlement(mockItem.resolve, 'Original');
      expect(scheduler.translatedCount).toBe(0);
      expect(scheduler.failedCount).toBe(1);
    });

    it('should preserve original and count null result as failed', async () => {
      const mockItem = { text: 'Original', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);

      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [mockItem], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });
      safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify([null])
      });

      await scheduler.flush();

       expectSettlement(mockItem.resolve, 'Original');
      expect(scheduler.translatedCount).toBe(0);
      expect(scheduler.failedCount).toBe(1);
    });

    it('should continue valid siblings around a blank result', async () => {
      const itemA = { text: 'A', resolve: vi.fn(), score: 1 };
      const itemB = { text: 'B', resolve: vi.fn(), score: 1 };
      const itemC = { text: 'C', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(itemA, itemB, itemC);

      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [itemA, itemB, itemC], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });
      safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify(['A2', '', 'C2'])
      });

      await scheduler.flush();

       expectSettlement(itemA.resolve, 'A2');
       expectSettlement(itemB.resolve, 'B');
       expectSettlement(itemC.resolve, 'C2');
       getSettlement(itemA.resolve).settle('accepted');
       getSettlement(itemC.resolve).settle('accepted');
      expect(scheduler.translatedCount).toBe(2);
      expect(scheduler.failedCount).toBe(1);
    });

    it('should complete all-blank batches through failed accounting', async () => {
      const itemA = { text: 'A', resolve: vi.fn(), score: 1 };
      const itemB = { text: 'B', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(itemA, itemB);
      scheduler.totalTasks = 2;

      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [itemA, itemB], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });
      safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify(['', '   '])
      });

      await scheduler.flush();

       expectSettlement(itemA.resolve, 'A');
       expectSettlement(itemB.resolve, 'B');
      expect(scheduler.translatedCount).toBe(0);
      expect(scheduler.failedCount).toBe(2);
      expect(scheduler.translatedCount + scheduler.failedCount).toBe(scheduler.totalTasks);
      expect(scheduler.activeFlushes).toBe(0);
      expect(scheduler.queue).toHaveLength(0);
    });

    it('should count blank and explicit skipped results once each', async () => {
      const itemA = { text: 'A', resolve: vi.fn(), score: 1 };
      const itemB = { text: 'B', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(itemA, itemB);

      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [itemA, itemB], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });
      safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify(['', { text: 'B', isSkipped: true }])
      });

      await scheduler.flush();

      expect(itemA.resolve).toHaveBeenCalledTimes(1);
       expectSettlement(itemA.resolve, 'A');
      expect(itemB.resolve).toHaveBeenCalledTimes(1);
       expectSettlement(itemB.resolve, 'B');
      expect(scheduler.translatedCount).toBe(0);
      expect(scheduler.failedCount).toBe(2);
    });

    it('should honor isSkipped items in a mixed partial result', async () => {
      const itemA = { text: 'A', resolve: vi.fn(), score: 1 };
      const itemB = { text: 'B', resolve: vi.fn(), score: 1 };
      const itemC = { text: 'C', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(itemA, itemB, itemC);

      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [itemA, itemB, itemC], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });

      safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify(['A2', { text: 'B', isSkipped: true }, 'C2'])
      });

      await scheduler.flush();

       expectSettlement(itemA.resolve, 'A2');
       expectSettlement(itemB.resolve, 'B');
       expectSettlement(itemC.resolve, 'C2');
       getSettlement(itemA.resolve).settle('accepted');
       getSettlement(itemC.resolve).settle('accepted');
      expect(scheduler.translatedCount).toBe(2);
      expect(scheduler.failedCount).toBe(1);
    });

    it('should preserve originals without counting translated when all items are skipped', async () => {
      const itemA = { text: 'A', resolve: vi.fn(), score: 1 };
      const itemB = { text: 'B', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(itemA, itemB);

      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [itemA, itemB], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });

      safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify([{ text: 'A', isSkipped: true }, { text: 'B', isSkipped: true }])
      });

      await scheduler.flush();

       expectSettlement(itemA.resolve, 'A');
       expectSettlement(itemB.resolve, 'B');
      expect(scheduler.translatedCount).toBe(0);
      expect(scheduler.failedCount).toBe(2);
    });

    it('should not treat identity translations as skipped', async () => {
      const mockItem = { text: 'URL', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);

      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [mockItem], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });

      safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify(['URL'])
      });

      await scheduler.flush();

       expectSettlement(mockItem.resolve, 'URL');
       getSettlement(mockItem.resolve).settle('accepted');
       expect(scheduler.translatedCount).toBe(1);
      expect(scheduler.failedCount).toBe(0);
    });

    it('should handle batch errors and fallback to original text', async () => {
      const mockItem = { text: 'Failed Text', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);

      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [mockItem], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });

      safeSendMessage.mockResolvedValue({
        success: false,
        error: 'Rate limit',
        errorType: 'SERVER_ERROR'
      });
      const emitSpy = vi.spyOn(pageEventBus, 'emit');

      await scheduler.flush();

       expectSettlement(mockItem.resolve, 'Failed Text');
      expect(scheduler.translatedCount).toBe(0);
      const internalError = emitSpy.mock.calls.find(([event]) => event === 'page-translation-internal-error')?.[1];
      expect(internalError.error.type).toBe('SERVER_ERROR');
      expect(internalError.errorType).toBe('SERVER_ERROR');
      expect(internalError.isFatal).toBe(true);
      emitSpy.mockRestore();
    });

    it('reconstructs canonical Page batch error identity from transport DTO', async () => {
      const mockItem = { text: 'Failed Text', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);
      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [mockItem], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });

      const errorDetails = {
        message: 'Provider failed',
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'page-batch',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true },
        cause: 'private',
        arbitrary: { ignored: true }
      };
      safeSendMessage.mockResolvedValue({
        success: false,
        translatedText: JSON.stringify([{ text: 'Failed Text' }]),
        hasError: true,
        error: 'Provider failed',
        errorType: 'SERVER_ERROR',
        errorDetails,
        isFatal: false
      });
      const emitSpy = vi.spyOn(pageEventBus, 'emit');

      await scheduler.flush();

      const internalError = emitSpy.mock.calls.find(([event]) => event === 'page-translation-internal-error')?.[1];
      expect(internalError.error).toMatchObject({
        message: 'Provider failed',
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'page-batch',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true }
      });
      expect(internalError.error).not.toHaveProperty('cause');
      expect(internalError.error).not.toHaveProperty('arbitrary');
      expect(internalError.errorType).toBe('SERVER_ERROR');
      expect(internalError.isFatal).toBe(true);
      expect(scheduler.fatalErrorOccurred).toBe(true);
       expectSettlement(mockItem.resolve, 'Failed Text');
      emitSpy.mockRestore();
    });
  });

  describe('Batch Execution (On Stop Mode)', () => {
    it('should use QueueFilter when translateAfterScrollStop is enabled', async () => {
      scheduler.settings.translateAfterScrollStop = true;
      const mockItem = { text: 'Queue', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);
      
      PageTranslationQueueFilter.process.mockReturnValue({
        batchItems: [mockItem],
        remainingItems: []
      });

      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });
      safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify(['صف'])
      });

      await scheduler.flush();

      expect(PageTranslationQueueFilter.process).toHaveBeenCalled();
       expectSettlement(mockItem.resolve, 'صف');
    });
  });

  describe('Fault Tolerance & Integrity', () => {
    it('should stop and mark fatal error', async () => {
      const mockItem = { text: 'Fatal', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);
      
      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [mockItem], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });
      
      safeSendMessage.mockResolvedValue({
        success: false,
        error: 'Fatal',
        isFatal: true,
        errorType: 'EXTENSION_CONTEXT_INVALIDATED'
      });

      await scheduler.flush();

      expect(scheduler.fatalErrorOccurred).toBe(true);
       expectSettlement(mockItem.resolve, 'Fatal');
    });

    it('should discard and resolve original if context changes during request', async () => {
      const initialContext = { id: 'ctx1' };
      scheduler.setTranslationState(true, 'tid', initialContext);

      const mockItem = { text: 'Old Context', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);
      
      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [mockItem], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });

      safeSendMessage.mockImplementation(async () => {
        scheduler.sessionContext = { id: 'ctx2' };
        return { success: true, translatedText: JSON.stringify(['جدید']) };
      });

      await scheduler.flush();

       expectSettlement(mockItem.resolve, 'Old Context');
      expect(scheduler.translatedCount).toBe(0);
    });

    it('does not let a stopped flush decrement a newer session counter', async () => {
      const oldResponse = {};
      const newResponse = {};
      let resolveOld;
      let resolveNew;
      const oldRequest = new Promise(resolve => { resolveOld = resolve; });
      const newRequest = new Promise(resolve => { resolveNew = resolve; });
      const oldItem = { text: 'Old', resolve: vi.fn(), score: 1 };
      const newItem = { text: 'New', resolve: vi.fn(), score: 1 };

      scheduler.queue.push(oldItem);
      scheduler.totalTasks = 1;
      PageTranslationFluidFilter.process.mockImplementation(queue => ({
        batchItems: [queue[0]],
        remainingItems: queue.slice(1),
      }));
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({
        providerRegistryId: 'google',
        targetLanguage: 'fa',
      });
      safeSendMessage
        .mockImplementationOnce(() => oldRequest)
        .mockImplementationOnce(() => newRequest);

      const oldFlush = scheduler.flush();
      await vi.waitFor(() => expect(safeSendMessage).toHaveBeenCalledTimes(1));
      expect(scheduler.activeFlushes).toBe(1);
      const completionSpy = vi.spyOn(scheduler, '_checkCompletion');

      scheduler.stop();
      scheduler.setTranslationState(true, 'new-session', { session: 'new' });
      scheduler.queue.push(newItem);
      scheduler.totalTasks = 1;

      const newFlush = scheduler.flush();
      await vi.waitFor(() => expect(safeSendMessage).toHaveBeenCalledTimes(2));
      expect(scheduler.activeFlushes).toBe(1);

      resolveOld(oldResponse);
      await oldFlush;
      expect(scheduler.activeFlushes).toBe(1);
      expect(completionSpy).not.toHaveBeenCalled();
      expect(newItem.resolve).not.toHaveBeenCalled();

      resolveNew(newResponse);
      await newFlush;
      expect(scheduler.activeFlushes).toBe(0);
    });

    it('ignores multiple stopped flush finalizers while preserving current-session accounting', async () => {
      const oldRequests = [];
      const resolveOld = [];
      const rejectOld = [];
      const newResponse = {};
      let resolveNew;
      const newRequest = new Promise(resolve => { resolveNew = resolve; });
      const oldItems = [
        { text: 'Old A', resolve: vi.fn(), score: 1 },
        { text: 'Old B', resolve: vi.fn(), score: 1 },
      ];
      const newItem = { text: 'New', resolve: vi.fn(), score: 1 };

      oldItems.forEach(item => scheduler.queue.push(item));
      scheduler.totalTasks = oldItems.length;
      scheduler.settings.maxConcurrentFlushes = 2;
      PageTranslationFluidFilter.process.mockImplementation(queue => ({
        batchItems: [queue[0]],
        remainingItems: queue.slice(1),
      }));
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({
        providerRegistryId: 'google',
        targetLanguage: 'fa',
      });
      oldItems.forEach(() => {
        oldRequests.push(new Promise((resolve, reject) => {
          resolveOld.push(resolve);
          rejectOld.push(reject);
        }));
      });
      safeSendMessage
        .mockImplementationOnce(() => oldRequests[0])
        .mockImplementationOnce(() => oldRequests[1])
        .mockImplementationOnce(() => newRequest);

      const oldFlushes = [scheduler.flush(), scheduler.flush()];
      await vi.waitFor(() => expect(safeSendMessage).toHaveBeenCalledTimes(2));
      expect(scheduler.activeFlushes).toBe(2);

      scheduler.stop();
      scheduler.setTranslationState(true, 'new-session', { session: 'new' });
      scheduler.queue.push(newItem);
      scheduler.totalTasks = 1;
      const newFlush = scheduler.flush();
      await vi.waitFor(() => expect(safeSendMessage).toHaveBeenCalledTimes(3));
      expect(scheduler.activeFlushes).toBe(1);

      resolveOld[0]({});
      rejectOld[1](new Error('old-session failure'));
      await Promise.all(oldFlushes);
      expect(scheduler.activeFlushes).toBe(1);

      resolveNew(newResponse);
      await newFlush;
      expect(scheduler.activeFlushes).toBe(0);
    });

    it('decrements active flushes for current-session success and failure', async () => {
      const requests = [];
      const resolvers = [];
      const items = [
        { text: 'A', resolve: vi.fn(), score: 1 },
        { text: 'B', resolve: vi.fn(), score: 1 },
      ];

      items.forEach(item => scheduler.queue.push(item));
      scheduler.totalTasks = items.length;
      scheduler.settings.maxConcurrentFlushes = 2;
      PageTranslationFluidFilter.process.mockImplementation(queue => ({
        batchItems: [queue[0]],
        remainingItems: queue.slice(1),
      }));
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({
        providerRegistryId: 'google',
        targetLanguage: 'fa',
      });
      items.forEach(() => {
        requests.push(new Promise((resolve, reject) => resolvers.push({ resolve, reject })));
      });
      safeSendMessage
        .mockImplementationOnce(() => requests[0])
        .mockImplementationOnce(() => requests[1]);

      const flushes = [scheduler.flush(), scheduler.flush()];
      await vi.waitFor(() => expect(safeSendMessage).toHaveBeenCalledTimes(2));
      expect(scheduler.activeFlushes).toBe(2);

      resolvers[0].resolve({});
      await flushes[0];
      expect(scheduler.activeFlushes).toBe(1);

      resolvers[1].reject(new Error('current-session failure'));
      await flushes[1];
      expect(scheduler.activeFlushes).toBe(0);
    });
  });
});
