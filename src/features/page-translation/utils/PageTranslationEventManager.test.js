import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PageTranslationEventManager } from './PageTranslationEventManager.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';

// Mock storageManager
vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    on: vi.fn(),
    off: vi.fn()
  }
}));

// Mock UnifiedMessaging
vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendRegularMessage: vi.fn(() => Promise.resolve())
}));

// Mock ExtensionContextManager
vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: vi.fn(() => false)
  }
}));

// Mock ErrorHandler
vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => ({
      handle: vi.fn(() => Promise.resolve())
    }))
  }
}));

describe('PageTranslationEventManager', () => {
  let mockManager;
  let mockBus;
  let eventManager;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset global state
    delete window._translateItPageTranslationListenersSet;
    
    mockBus = {
      on: vi.fn(),
      emit: vi.fn()
    };
    window.pageEventBus = mockBus;

    mockManager = {
      logger: {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
      },
      settings: {
        scrollStopDelay: 500,
        translateAfterScrollStop: false
      },
      scrollTracker: {
        updateDelay: vi.fn(),
        start: vi.fn()
      },
      resetError: vi.fn(),
      translatePage: vi.fn(() => Promise.resolve()),
      restorePage: vi.fn(() => Promise.resolve()),
      cancelTranslation: vi.fn(),
      stopAutoTranslation: vi.fn(() => Promise.resolve()),
      _handleFatalError: vi.fn(),
      _broadcastEvent: vi.fn()
    };

    eventManager = new PageTranslationEventManager(mockManager);
  });

  describe('Storage Listeners', () => {
    it('should register storage listeners on init', () => {
      expect(storageManager.on).toHaveBeenCalledWith('change:TRANSLATION_API', expect.any(Function));
      expect(storageManager.on).toHaveBeenCalledWith('change:MODE_PROVIDERS', expect.any(Function));
      expect(storageManager.on).toHaveBeenCalledWith('change:WHOLE_PAGE_SCROLL_STOP_DELAY', expect.any(Function));
    });

    it('should reset error when TRANSLATION_API changes', () => {
      const callback = storageManager.on.mock.calls.find(c => c[0] === 'change:TRANSLATION_API')[1];
      callback({ newValue: 'gemini', oldValue: 'google' });
      expect(mockManager.resetError).toHaveBeenCalled();
    });

    it('should update scrollStopDelay when WHOLE_PAGE_SCROLL_STOP_DELAY changes', () => {
      const callback = storageManager.on.mock.calls.find(c => c[0] === 'change:WHOLE_PAGE_SCROLL_STOP_DELAY')[1];
      callback({ newValue: 1000 });
      expect(mockManager.settings.scrollStopDelay).toBe(1000);
      expect(mockManager.scrollTracker.updateDelay).toHaveBeenCalledWith(1000);
    });
  });

  describe('PageEventBus Listeners', () => {
    it('should register event bus listeners', () => {
      expect(mockBus.on).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE, expect.any(Function));
      expect(mockBus.on).toHaveBeenCalledWith(MessageActions.PAGE_RESTORE, expect.any(Function));
      expect(mockBus.on).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_CANCELLED, expect.any(Function));
    });

    it('should call translatePage when PAGE_TRANSLATE is received', () => {
      const callback = mockBus.on.mock.calls.find(c => c[0] === MessageActions.PAGE_TRANSLATE)[1];
      const options = { targetLanguage: 'en' };
      callback(options);
      expect(mockManager.translatePage).toHaveBeenCalledWith(options);
    });

    it('should call restorePage when PAGE_RESTORE is received', () => {
      const callback = mockBus.on.mock.calls.find(c => c[0] === MessageActions.PAGE_RESTORE)[1];
      callback();
      expect(mockManager.restorePage).toHaveBeenCalled();
    });

    it('should forward progress events to background', () => {
      const callback = mockBus.on.mock.calls.find(c => c[0] === MessageActions.PAGE_TRANSLATE_PROGRESS)[1];
      const data = { progress: 50 };
      callback(data);
      expect(sendRegularMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: MessageActions.PAGE_TRANSLATE_PROGRESS, data }),
        { silent: true }
      );
    });

    it('should handle fatal errors from bus', () => {
      const callback = mockBus.on.mock.calls.find(c => c[0] === 'page-translation-fatal-error')[1];
      const errorData = { error: 'Failed', errorType: 'network' };
      callback(errorData);
      expect(mockManager._handleFatalError).toHaveBeenCalledWith('Failed', 'network', undefined);
    });

    it('should handle STOP_CONFLICTING_FEATURES', () => {
      mockManager.isTranslating = true;
      const callback = mockBus.on.mock.calls.find(c => c[0] === 'STOP_CONFLICTING_FEATURES')[1];
      callback({ source: 'select-element' });
      expect(mockManager.restorePage).toHaveBeenCalled();
    });
  });
});
