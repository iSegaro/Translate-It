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
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import ExtensionContextManager from '@/core/extensionContext.js';

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
    vi.spyOn(pageEventBus, 'emit');
    
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

    it('continues after a non-fatal batch failure and completes once', async () => {
      const failedItem = { text: 'Failed', resolve: vi.fn(), score: 1 };
      const translatedItem = { text: 'Translated', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(failedItem, translatedItem);
      scheduler.totalTasks = 2;

      PageTranslationFluidFilter.process
        .mockReturnValueOnce({ batchItems: [failedItem], remainingItems: [translatedItem] })
        .mockReturnValueOnce({ batchItems: [translatedItem], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });
      safeSendMessage
        .mockResolvedValueOnce({ success: false, error: 'Temporary provider failure', errorType: 'UNKNOWN' })
        .mockResolvedValueOnce({ success: true, translatedText: JSON.stringify(['translated']) });
      const emitSpy = vi.spyOn(pageEventBus, 'emit');

      await scheduler.flush();

      expect(safeSendMessage).toHaveBeenCalledTimes(2);
      expect(scheduler.fatalErrorOccurred).toBe(false);
      expectSettlement(failedItem.resolve, 'Failed');
      expectSettlement(translatedItem.resolve, 'translated');
      getSettlement(failedItem.resolve).settle('failed');
      getSettlement(translatedItem.resolve).settle('accepted');
      await new Promise(resolve => setTimeout(resolve, 600));

      expect(scheduler.failedCount).toBe(1);
      expect(scheduler.translatedCount).toBe(1);
      expect(emitSpy.mock.calls.filter(([event]) => event === MessageActions.PAGE_TRANSLATE_COMPLETE)).toHaveLength(1);
      emitSpy.mockRestore();
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

    it('settles queued items and escalates once when batch config fails', async () => {
      const item = { text: 'Config failure', resolve: vi.fn(), score: 1 };
      const error = new Error('config unavailable');
      scheduler.queue.push(item);
      scheduler.totalTasks = 1;
      vi.spyOn(scheduler, '_getBatchConfig').mockRejectedValueOnce(error);

      await scheduler.flush();

      expect(getSettlement(item.resolve).state).toBe('failed');
      expect(scheduler.queue).toHaveLength(0);
      expect(scheduler.isTranslated).toBe(false);
      expect(scheduler.activeFlushes).toBe(0);
      expect(pageEventBus.emit.mock.calls.filter(([event]) => event === 'page-translation-fatal-error'))
        .toHaveLength(1);
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_COMPLETE, expect.anything());
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_IDLE, expect.anything());
    });

    it('cancels owned items silently when batch config loses context', async () => {
      const item = { text: 'Context failure', resolve: vi.fn(), score: 1 };
      const error = Object.assign(new Error('context invalidated'), { type: 'EXTENSION_CONTEXT_INVALIDATED' });
      scheduler.queue.push(item);
      scheduler.totalTasks = 1;
      ExtensionContextManager.isContextError.mockReturnValueOnce(true);
      vi.spyOn(scheduler, '_getBatchConfig').mockRejectedValueOnce(error);

      await scheduler.flush();

      expect(getSettlement(item.resolve).state).toBe('cancelled');
      expect(scheduler.failedCount).toBe(0);
      expect(pageEventBus.emit.mock.calls.filter(([event]) => event === 'page-translation-fatal-error'))
        .toHaveLength(1);
    });

    it.each([
      ['fluid', false, PageTranslationFluidFilter],
      ['queue', true, PageTranslationQueueFilter],
    ])('settles items when %s filter throws', async (_name, translateAfterScrollStop, filter) => {
      const item = { text: 'Filter failure', resolve: vi.fn(), score: 1 };
      const error = new Error('filter invariant failed');
      scheduler.settings.translateAfterScrollStop = translateAfterScrollStop;
      scheduler.queue.push(item);
      scheduler.totalTasks = 1;
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({
        providerRegistryId: 'google',
        targetLanguage: 'fa',
      });
      filter.process.mockImplementationOnce(() => { throw error; });

      await scheduler.flush();

      expect(getSettlement(item.resolve).state).toBe('failed');
      expect(scheduler.queue).toHaveLength(0);
      expect(scheduler.activeFlushes).toBe(0);
    });

    it('settles items when a filter returns malformed ownership data', async () => {
      const item = { text: 'Malformed result', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(item);
      scheduler.totalTasks = 1;
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({
        providerRegistryId: 'google',
        targetLanguage: 'fa',
      });
      PageTranslationFluidFilter.process.mockReturnValueOnce({ batchItems: [item] });

      await scheduler.flush();

      expect(getSettlement(item.resolve).state).toBe('failed');
      expect(scheduler.queue).toHaveLength(0);
      expect(pageEventBus.emit.mock.calls.filter(([event]) => event === 'page-translation-fatal-error'))
        .toHaveLength(1);
    });

    it('settles a batch after it leaves queue ownership and execution fails outside its handler', async () => {
      const item = { text: 'Owned batch', resolve: vi.fn(), score: 1 };
      const error = new Error('batch boundary failure');
      scheduler.queue.push(item);
      scheduler.totalTasks = 1;
      PageTranslationFluidFilter.process.mockReturnValueOnce({ batchItems: [item], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({
        providerRegistryId: 'google',
        targetLanguage: 'fa',
      });
      vi.spyOn(scheduler, '_executeBatchRequest').mockRejectedValueOnce(error);

      await scheduler.flush();

      expect(getSettlement(item.resolve).state).toBe('failed');
      expect(scheduler.activeBatches.size).toBe(0);
      expect(pageEventBus.emit.mock.calls.filter(([event]) => event === 'page-translation-fatal-error'))
        .toHaveLength(1);
    });

    it('settles a batch when MessageFormat fails before batch error handling', async () => {
      const item = { text: 'Message failure', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(item);
      scheduler.totalTasks = 1;
      PageTranslationFluidFilter.process.mockReturnValueOnce({ batchItems: [item], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({
        providerRegistryId: 'google',
        targetLanguage: 'fa',
      });
      vi.spyOn(MessageFormat, 'create').mockImplementationOnce(() => {
        throw new Error('message construction failure');
      });

      await scheduler.flush();

      expect(getSettlement(item.resolve).state).toBe('failed');
      expect(scheduler.activeBatches.size).toBe(0);
      expect(pageEventBus.emit.mock.calls.filter(([event]) => event === 'page-translation-fatal-error'))
        .toHaveLength(1);
    });

    it('preserves partial accounting during outer failure', async () => {
      const item = { text: 'Remaining work', resolve: vi.fn(), score: 1 };
      scheduler.translatedCount = 2;
      scheduler.failedCount = 1;
      scheduler.totalTasks = 4;
      scheduler.queue.push(item);
      vi.spyOn(scheduler, '_getBatchConfig').mockRejectedValueOnce(new Error('infrastructure failure'));

      await scheduler.flush();

      expect(scheduler.translatedCount).toBe(2);
      expect(scheduler.failedCount).toBe(2);
      expect(scheduler.totalTasks).toBe(4);
      expect(getSettlement(item.resolve).state).toBe('failed');
    });

    it('terminates concurrent session flushes with one fatal escalation', async () => {
      const itemA = { text: 'A', resolve: vi.fn(), score: 1 };
      const itemB = { text: 'B', resolve: vi.fn(), score: 1 };
      let releaseSecond;
      const secondRequest = new Promise(resolve => { releaseSecond = resolve; });
      scheduler.settings.maxConcurrentFlushes = 2;
      scheduler.queue.push(itemA, itemB);
      scheduler.totalTasks = 2;
      PageTranslationFluidFilter.process.mockImplementation(queue => ({
        batchItems: [queue[0]],
        remainingItems: queue.slice(1),
      }));
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({
        providerRegistryId: 'google',
        targetLanguage: 'fa',
      });
      vi.spyOn(scheduler, '_executeBatchRequest')
        .mockRejectedValueOnce(new Error('shared infrastructure failure'))
        .mockImplementationOnce(() => secondRequest);

      const firstFlush = scheduler.flush();
      const secondFlush = scheduler.flush();
      await vi.waitFor(() => expect(pageEventBus.emit.mock.calls.filter(([event]) => event === 'page-translation-fatal-error')).toHaveLength(1));

      expect(getSettlement(itemA.resolve).state).toBe('failed');
      expect(getSettlement(itemB.resolve).state).toBe('failed');
      expect(scheduler.activeFlushes).toBe(0);
      releaseSecond({});
      await Promise.all([firstFlush, secondFlush]);
      expect(pageEventBus.emit.mock.calls.filter(([event]) => event === 'page-translation-fatal-error'))
        .toHaveLength(1);
    });

    it('does not let an old flush touch a newer session after config resolves', async () => {
      const oldItem = { text: 'Old', resolve: vi.fn(), score: 1 };
      let resolveConfig;
      const config = new Promise(resolve => { resolveConfig = resolve; });
      scheduler.queue.push(oldItem);
      scheduler.totalTasks = 1;
      vi.spyOn(scheduler, '_getBatchConfig').mockReturnValueOnce(config);
      const filterSpy = vi.spyOn(PageTranslationFluidFilter, 'process');

      const oldFlush = scheduler.flush();
      await vi.waitFor(() => expect(scheduler._getBatchConfig).toHaveBeenCalled());

      scheduler.stop();
      scheduler.setTranslationState(true, 'new-session', { session: 'new' });
      const newItem = { text: 'New', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(newItem);
      scheduler.totalTasks = 1;

      resolveConfig({ providerRegistryId: 'google', targetLanguage: 'fa' });
      await oldFlush;

      expect(filterSpy).not.toHaveBeenCalled();
      expect(scheduler.queue).toEqual([newItem]);
      expect(newItem.resolve).not.toHaveBeenCalled();
      expect(scheduler.activeFlushes).toBe(0);
      expect(pageEventBus.emit.mock.calls.filter(([event]) => event === 'page-translation-fatal-error'))
        .toHaveLength(0);
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

    it('keeps independent batch results attached to their own items when completion reverses', async () => {
      const itemA = { text: 'A1', resolve: vi.fn(), score: 1 };
      const itemB = { text: 'B1', resolve: vi.fn(), score: 1 };
      const resolveA = {};
      const resolveB = {};
      const responseA = new Promise(resolve => { resolveA.resolve = resolve; });
      const responseB = new Promise(resolve => { resolveB.resolve = resolve; });

      scheduler.settings.maxConcurrentFlushes = 2;
      scheduler.queue.push(itemA, itemB);
      PageTranslationFluidFilter.process.mockImplementation(queue => ({
        batchItems: [queue[0]],
        remainingItems: queue.slice(1),
      }));
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({
        providerRegistryId: 'google',
        targetLanguage: 'fa',
      });
      safeSendMessage
        .mockImplementationOnce(() => responseA)
        .mockImplementationOnce(() => responseB);

      const flushA = scheduler.flush();
      const flushB = scheduler.flush();
      await vi.waitFor(() => expect(safeSendMessage).toHaveBeenCalledTimes(2));

      resolveB.resolve({ success: true, translatedText: JSON.stringify(['TB1']) });
      await flushB;
      expectSettlement(itemB.resolve, 'TB1');
      expect(itemA.resolve).not.toHaveBeenCalled();

      resolveA.resolve({ success: true, translatedText: JSON.stringify(['TA1']) });
      await flushA;
      expectSettlement(itemA.resolve, 'TA1');
    });

    it('applies same-batch positional results to corresponding scheduler items', async () => {
      const items = [
        { text: 'A', resolve: vi.fn(), score: 1 },
        { text: 'B', resolve: vi.fn(), score: 1 },
        { text: 'C', resolve: vi.fn(), score: 1 },
      ];
      scheduler.queue.push(...items);
      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: items, remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({
        providerRegistryId: 'google',
        targetLanguage: 'fa',
      });
      safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify(['TA', 'TC', 'TB']),
      });

      await scheduler.flush();

      expectSettlement(items[0].resolve, 'TA');
      expectSettlement(items[1].resolve, 'TC');
      expectSettlement(items[2].resolve, 'TB');
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
