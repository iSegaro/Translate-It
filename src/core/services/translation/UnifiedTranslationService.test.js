import { vi } from 'vitest';

// Mock backgroundService early
globalThis.backgroundService = {
  translationEngine: {
    cancelTranslation: vi.fn()
  }
};

// 1. Mocks first
vi.mock('./TranslationRequestTracker.js', () => ({
  translationRequestTracker: {
    getRequest: vi.fn(),
    isRequestActive: vi.fn(),
    createRequest: vi.fn(),
    updateRequest: vi.fn(),
    completeRequest: vi.fn(),
    failRequest: vi.fn(),
    cancelRequest: vi.fn(),
    markTimeout: vi.fn(),
    cleanup: vi.fn()
  },
  RequestStatus: {
    COMPLETED: 'completed',
    FAILED: 'failed'
  }
}));

vi.mock('./UnifiedResultDispatcher.js', () => ({
  UnifiedResultDispatcher: vi.fn().mockImplementation(function() {
    this.dispatchResult = vi.fn();
    this.dispatchStreamingUpdate = vi.fn();
    this.dispatchCancellation = vi.fn();
  })
}));

vi.mock('./UnifiedModeCoordinator.js', () => ({
  UnifiedModeCoordinator: vi.fn().mockImplementation(function() {
    return {
      processRequest: vi.fn()
    };
  })
}));

vi.mock('../../../features/translation/utils/translationModeHelper.js', () => ({
  isEligibleForDictionaryUpgrade: vi.fn().mockResolvedValue(false)
}));

vi.mock('../../../shared/config/config.js', () => ({
  TranslationMode: {
    Field: 'field',
    Selection: 'selection',
    Select_Element: 'select-element',
    Page: 'page',
    PDF: 'pdf-translation'
  },
  getModeProvidersAsync: vi.fn().mockResolvedValue({}),
  getTranslationApiAsync: vi.fn().mockResolvedValue('google'),
  getPopupMaxCharsAsync: vi.fn().mockResolvedValue(5000),
  getSidepanelMaxCharsAsync: vi.fn().mockResolvedValue(10000),
  getSelectionMaxCharsAsync: vi.fn().mockResolvedValue(5000),
  getSelectElementMaxCharsAsync: vi.fn().mockResolvedValue(20000)
}));

vi.mock('../../../shared/messaging/core/MessagingCore.js', () => ({
  MessageFormat: {
    validate: vi.fn().mockReturnValue(true),
    createErrorResponse: vi.fn((err) => ({ success: false, error: err.message || err }))
  },
  MessageContexts: {
    POPUP: 'popup',
    SIDEPANEL: 'sidepanel',
    SELECT_ELEMENT: 'select-element',
    PDF_TRANSLATION: 'pdf-translation',
    PAGE_TRANSLATION_BATCH: 'page-translation-batch',
    CONTENT: 'content',
    MOBILE_TRANSLATE: 'mobile-translate',
    SELECTION_MANAGER: 'selection-manager'
  }
}));

vi.mock('../../../features/translation/core/TranslationStatsManager.js', () => ({
  statsManager: {
    printSummary: vi.fn()
  }
}));

vi.mock('../../../shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('../../../shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: {
    TRANSLATION: 'translation'
  }
}));

// 2. Imports second
import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedTranslationService } from './UnifiedTranslationService.js';
import { ErrorTypes } from '../../../shared/error-management/ErrorTypes.js';
import { translationRequestTracker } from './TranslationRequestTracker.js';

describe('UnifiedTranslationService', () => {
  let service;
  let mockEngine;
  let mockBackground;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UnifiedTranslationService();
    mockEngine = { cancelTranslation: vi.fn() };
    mockBackground = { translationEngine: mockEngine };
    service.initialize({ translationEngine: mockEngine, backgroundService: mockBackground });
    translationRequestTracker.completeRequest.mockReturnValue({ accepted: true, status: 'completed' });
    translationRequestTracker.failRequest.mockReturnValue({ accepted: true, status: 'failed' });
    translationRequestTracker.cancelRequest.mockReturnValue({ accepted: true, status: 'cancelled' });
    translationRequestTracker.markTimeout.mockReturnValue({ accepted: true, status: 'timeout' });
  });

  describe('handleTranslationRequest', () => {
    it('creates isolated result dispatchers for separate services', () => {
      const secondService = new UnifiedTranslationService();

      expect(service.resultDispatcher).not.toBe(secondService.resultDispatcher);
    });

    it('should block requests exceeding character limits', async () => {
      const message = {
        messageId: 'm1',
        data: { text: 'a'.repeat(6000), mode: 'selection' },
        context: 'popup'
      };

      const result = await service.handleTranslationRequest(message);

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.TEXT_TOO_LONG);
    });

    it('should use context-specific character limits (Sidepanel)', async () => {
      const message = {
        messageId: 'm1',
        data: { text: 'a'.repeat(12000), mode: 'selection' },
        context: 'sidepanel'
      };
      const result = await service.handleTranslationRequest(message);
      expect(result.success).toBe(false); // Max is 10000
    });

    it('should process a valid request successfully', async () => {
      const message = {
        messageId: 'm1',
        data: { text: 'hello', mode: 'selection' },
        context: 'content'
      };

      const mockRequest = { messageId: 'm1', data: message.data };
      translationRequestTracker.createRequest.mockReturnValue(mockRequest);
      
      service.modeCoordinator.processRequest.mockResolvedValue({ success: true, translatedText: 'bonjour' });

      const result = await service.handleTranslationRequest(message);

      expect(result.success).toBe(true);
      expect(result.translatedText).toBe('bonjour');
      expect(service.resultDispatcher.dispatchResult).toHaveBeenCalled();
    });

    it('suppresses a late success result when cancellation already won', async () => {
      const message = { messageId: 'm-cancelled', data: { text: 'hello', mode: 'selection' }, context: 'content' };
      const request = { messageId: 'm-cancelled', data: message.data, mode: 'selection' };
      translationRequestTracker.createRequest.mockReturnValue(request);
      translationRequestTracker.completeRequest.mockReturnValue({ accepted: false, status: 'cancelled', reason: 'already_terminal' });
      service.modeCoordinator.processRequest.mockResolvedValue({ success: true, translatedText: 'bonjour' });

      const result = await service.handleTranslationRequest(message);

      expect(result).toMatchObject({ success: false, cancelled: true });
      expect(service.resultDispatcher.dispatchResult).not.toHaveBeenCalled();
    });

    it('returns a delivery failure without changing accepted completion', async () => {
      const message = { messageId: 'm-dispatch', data: { text: 'hello', mode: 'selection' }, context: 'content' };
      translationRequestTracker.createRequest.mockReturnValue({ messageId: 'm-dispatch', data: message.data, mode: 'selection' });
      service.modeCoordinator.processRequest.mockResolvedValue({ success: true, translatedText: 'bonjour' });
      service.resultDispatcher.dispatchResult.mockRejectedValue(new Error('delivery failed'));

      const result = await service.handleTranslationRequest(message);

      expect(result).toMatchObject({ success: false, error: 'delivery failed' });
      expect(translationRequestTracker.failRequest).not.toHaveBeenCalled();
      expect(translationRequestTracker.completeRequest).toHaveBeenCalledTimes(1);
    });

    it('does not fail a request when registration itself throws', async () => {
      const message = { messageId: 'm-setup', data: { text: 'hello', mode: 'selection' }, context: 'content' };
      translationRequestTracker.createRequest.mockImplementation(() => { throw new Error('setup failed') });

      const result = await service.handleTranslationRequest(message);

      expect(result).toMatchObject({ success: false, error: 'setup failed' });
      expect(translationRequestTracker.failRequest).not.toHaveBeenCalled();
    });

    it('fails an active tracked request when post-registration setup fails before execution', async () => {
      const message = { messageId: 'm-tracked-setup', data: { text: 'hello', mode: 'selection' }, context: 'content' };
      translationRequestTracker.createRequest.mockReturnValue({});
      translationRequestTracker.isRequestActive.mockReturnValue(true);

      const result = await service.handleTranslationRequest(message);

      expect(result).toMatchObject({ success: false, error: 'Translation request registration failed' });
      expect(translationRequestTracker.failRequest).toHaveBeenCalledTimes(1);
      expect(service.modeCoordinator.processRequest).not.toHaveBeenCalled();
    });

    it('suppresses a late failure when cancellation already won', async () => {
      const message = { messageId: 'm-cancelled', data: { text: 'hello', mode: 'selection' }, context: 'content' };
      translationRequestTracker.createRequest.mockReturnValue({ messageId: 'm-cancelled', data: message.data, mode: 'selection' });
      translationRequestTracker.failRequest.mockReturnValue({ accepted: false, status: 'cancelled', reason: 'already_terminal' });
      service.modeCoordinator.processRequest.mockRejectedValue(new Error('late failure'));

      const result = await service.handleTranslationRequest(message);

      expect(result).toMatchObject({ success: false, cancelled: true });
      expect(service.resultDispatcher.dispatchResult).not.toHaveBeenCalled();
    });

    it('preserves timeout when late completion is rejected', async () => {
      const message = { messageId: 'm-timeout', data: { text: 'hello', mode: 'selection' }, context: 'content' };
      translationRequestTracker.createRequest.mockReturnValue({ messageId: 'm-timeout', data: message.data, mode: 'selection' });
      translationRequestTracker.completeRequest.mockReturnValue({ accepted: false, status: 'timeout', reason: 'already_terminal' });
      service.modeCoordinator.processRequest.mockResolvedValue({ success: true });

      const result = await service.handleTranslationRequest(message);

      expect(result).toMatchObject({ success: false, timedOut: true });
      expect(result.error.type).not.toBe(ErrorTypes.USER_CANCELLED);
      expect(service.resultDispatcher.dispatchResult).not.toHaveBeenCalled();
    });

    it('suppresses duplicate and missing terminal completion without fabricating cancellation', async () => {
      const message = { messageId: 'm-duplicate', data: { text: 'hello', mode: 'selection' }, context: 'content' };
      translationRequestTracker.createRequest.mockReturnValue({ messageId: 'm-duplicate', data: message.data, mode: 'selection' });
      translationRequestTracker.completeRequest.mockReturnValueOnce({ accepted: false, status: 'completed', reason: 'already_terminal' });
      service.modeCoordinator.processRequest.mockResolvedValue({ success: true });

      const duplicate = await service.handleTranslationRequest(message);
      expect(duplicate).toMatchObject({ success: false, suppressed: true, status: 'completed' });

      translationRequestTracker.completeRequest.mockReturnValueOnce({ accepted: false, status: null, reason: 'not_found' });
      const missing = await service.handleTranslationRequest(message);
      expect(missing).toMatchObject({ success: false, suppressed: true, status: null });
    });

    it('should handle Field mode with direct return', async () => {
      const message = {
        messageId: 'm-field',
        data: { text: 'test', mode: 'field' },
        context: 'content'
      };

      const mockRequest = { messageId: 'm-field', data: message.data, mode: 'field' };
      translationRequestTracker.createRequest.mockReturnValue(mockRequest);
      
      const expectedResult = { success: true, translatedText: 'TEST' };
      service.modeCoordinator.processRequest.mockResolvedValue(expectedResult);

      const result = await service.handleTranslationRequest(message);

      expect(result).toBe(expectedResult);
      expect(service.resultDispatcher.dispatchResult).not.toHaveBeenCalled();
    });

    it('should block duplicate active requests', async () => {
      const message = { messageId: 'm1', data: { text: 'hi' } };
      translationRequestTracker.getRequest.mockReturnValue({ messageId: 'm1' });
      translationRequestTracker.isRequestActive.mockReturnValue(true);

      const result = await service.handleTranslationRequest(message);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Request already processing');
    });

    it('should fallback to globalThis.backgroundService if not initialized', async () => {
      const s2 = new UnifiedTranslationService();
      translationRequestTracker.getRequest.mockReturnValue(null);
      translationRequestTracker.createRequest.mockReturnValue({ mode: 'selection' });
      s2.modeCoordinator.processRequest.mockResolvedValue({ success: true });

      await s2.handleTranslationRequest({ messageId: 'm1', data: { text: 'hi' } });
      expect(s2.translationEngine).toBe(globalThis.backgroundService.translationEngine);
    });

    it('should log session stats for successful non-field requests', async () => {
      const { statsManager } = await import('../../../features/translation/core/TranslationStatsManager.js');
      const message = { messageId: 'm1', data: { text: 'hi', mode: 'selection' }, context: 'content' };
      translationRequestTracker.createRequest.mockReturnValue({ messageId: 'm1', mode: 'selection' });
      service.modeCoordinator.processRequest.mockResolvedValue({ success: true });

      await service.handleTranslationRequest(message);
      expect(statsManager.printSummary).toHaveBeenCalledWith('m1', expect.objectContaining({ status: 'Session' }));
    });

    it('should log batch stats for Page mode', async () => {
      const { statsManager } = await import('../../../features/translation/core/TranslationStatsManager.js');
      const message = { messageId: 'm1', data: { text: 'hi', mode: 'page' }, context: 'content' };
      translationRequestTracker.createRequest.mockReturnValue({ messageId: 'm1', mode: 'page' });
      service.modeCoordinator.processRequest.mockResolvedValue({ success: true, actualCharCount: 10 });

      await service.handleTranslationRequest(message);
      expect(statsManager.printSummary).toHaveBeenCalledWith('m1', expect.objectContaining({ status: 'Batch' }));
    });

    it('should treat PDF mode as a dedicated structured translation mode', async () => {
      const message = {
        messageId: 'm-pdf',
        data: { text: JSON.stringify([{ blockId: 'b1', text: 'hello' }]), mode: 'pdf-translation' },
        context: 'pdf-translation'
      };

      const mockRequest = { messageId: 'm-pdf', data: message.data, mode: 'pdf-translation' };
      translationRequestTracker.createRequest.mockReturnValue(mockRequest);
      service.modeCoordinator.processRequest.mockResolvedValue({ success: true, translatedText: '[]' });

      const result = await service.handleTranslationRequest(message);

      expect(result.success).toBe(true);
      expect(service.modeCoordinator.processRequest).toHaveBeenCalledWith(mockRequest, expect.any(Object));
    });
  });

  describe('_resolveEffectiveProvider', () => {
    it('should use provider from data if in UI context', async () => {
      const provider = await service._resolveEffectiveProvider({ provider: 'p1' }, 'popup');
      expect(provider).toBe('p1');
    });

    it('should use mode-specific provider if defined', async () => {
      const { getModeProvidersAsync } = await import('../../../shared/config/config.js');
      getModeProvidersAsync.mockResolvedValue({ selection: 'p-sel' });
      
      const provider = await service._resolveEffectiveProvider({ mode: 'selection' }, 'content');
      expect(provider).toBe('p-sel');
    });

    it('should fallback to default provider if mode-specific is "default"', async () => {
      const { getModeProvidersAsync, getTranslationApiAsync } = await import('../../../shared/config/config.js');
      getModeProvidersAsync.mockResolvedValue({ selection: 'default' });
      getTranslationApiAsync.mockResolvedValue('p-global');
      
      const provider = await service._resolveEffectiveProvider({ mode: 'selection' }, 'content');
      expect(provider).toBe('p-global');
    });
  });

  describe('cancelRequest', () => {
    it('should cancel active request', async () => {
      const mockRequest = { messageId: 'm1' };
      translationRequestTracker.getRequest.mockReturnValue(mockRequest);

      const result = await service.cancelRequest('m1');

      expect(result.success).toBe(true);
      expect(mockEngine.cancelTranslation).toHaveBeenCalledWith('m1');
      expect(translationRequestTracker.cancelRequest).toHaveBeenCalledWith('m1');
      expect(service.resultDispatcher.dispatchCancellation).toHaveBeenCalled();
    });

    it('should return error if request not found', async () => {
      translationRequestTracker.getRequest.mockReturnValue(null);

      const result = await service.cancelRequest('unknown');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Request not found');
    });
  });

  describe('handleStreamingUpdate', () => {
    it('should forward update to dispatcher', async () => {
      const message = { messageId: 'm1', data: { chunk: '...' } };
      await service.handleStreamingUpdate(message);

      expect(service.resultDispatcher.dispatchStreamingUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'm1', data: message.data })
      );
    });
  });

  describe('cleanup', () => {
    it('should call tracker cleanup', () => {
      translationRequestTracker.cleanup.mockReturnValue(5);
      service.cleanup();
      expect(translationRequestTracker.cleanup).toHaveBeenCalled();
    });
  });
});
