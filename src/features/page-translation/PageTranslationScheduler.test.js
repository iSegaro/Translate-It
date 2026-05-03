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
import ExtensionContextManager from '@/core/extensionContext.js';
import { PageTranslationQueueFilter } from './utils/PageTranslationQueueFilter.js';
import { PageTranslationFluidFilter } from './utils/PageTranslationFluidFilter.js';

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

vi.mock('@/config.js', () => ({
  getTranslationApiAsync: vi.fn(async () => 'google'),
  getTargetLanguageAsync: vi.fn(async () => 'fa')
}));

describe('PageTranslationScheduler', () => {
  let scheduler;

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

      ExtensionContextManager.safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify(['سلام'])
      });

      await scheduler.flush();

      expect(ExtensionContextManager.safeSendMessage).toHaveBeenCalled();
      expect(mockItem.resolve).toHaveBeenCalledWith('سلام');
      expect(scheduler.translatedCount).toBe(1);
    });

    it('should handle batch errors and fallback to original text', async () => {
      const mockItem = { text: 'Failed Text', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);

      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [mockItem], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });

      ExtensionContextManager.safeSendMessage.mockResolvedValue({
        success: false,
        error: 'Rate limit'
      });

      await scheduler.flush();

      expect(mockItem.resolve).toHaveBeenCalledWith('Failed Text');
      expect(scheduler.translatedCount).toBe(0);
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
      ExtensionContextManager.safeSendMessage.mockResolvedValue({
        success: true,
        translatedText: JSON.stringify(['صف'])
      });

      await scheduler.flush();

      expect(PageTranslationQueueFilter.process).toHaveBeenCalled();
      expect(mockItem.resolve).toHaveBeenCalledWith('صف');
    });
  });

  describe('Fault Tolerance & Integrity', () => {
    it('should stop and mark fatal error', async () => {
      const mockItem = { text: 'Fatal', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);
      
      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [mockItem], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });
      
      ExtensionContextManager.safeSendMessage.mockResolvedValue({
        success: false,
        error: 'Fatal',
        isFatal: true,
        errorType: 'EXTENSION_CONTEXT_INVALIDATED'
      });

      await scheduler.flush();

      expect(scheduler.fatalErrorOccurred).toBe(true);
      expect(mockItem.resolve).toHaveBeenCalledWith('Fatal');
    });

    it('should discard and resolve original if context changes during request', async () => {
      const initialContext = { id: 'ctx1' };
      scheduler.setTranslationState(true, 'tid', initialContext);

      const mockItem = { text: 'Old Context', resolve: vi.fn(), score: 1 };
      scheduler.queue.push(mockItem);
      
      PageTranslationFluidFilter.process.mockReturnValue({ batchItems: [mockItem], remainingItems: [] });
      vi.spyOn(scheduler, '_getBatchConfig').mockResolvedValue({ providerRegistryId: 'google', targetLanguage: 'fa' });

      ExtensionContextManager.safeSendMessage.mockImplementation(async () => {
        scheduler.sessionContext = { id: 'ctx2' };
        return { success: true, translatedText: JSON.stringify(['جدید']) };
      });

      await scheduler.flush();

      expect(mockItem.resolve).toHaveBeenCalledWith('Old Context');
      expect(scheduler.translatedCount).toBe(0);
    });
  });
});
