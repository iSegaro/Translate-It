import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/features/translation/providers/ProviderManifest.js', () => ({
  findProviderById: vi.fn().mockReturnValue({ displayName: 'Google', consumesTokens: false })
}));

// 1. Mock webextension-polyfill FIRST
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { 
      sendMessage: vi.fn(), 
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() } 
    },
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

// 3. Mock internal components
vi.mock('./PageTranslationHelper.js', () => ({
  PageTranslationHelper: {
    isSuitableForTranslation: vi.fn(() => true),
    deepCleanDOM: vi.fn(),
    isSuitableForElement: vi.fn(() => true)
  }
}));

vi.mock('./PageTranslationScheduler.js', () => ({
  PageTranslationScheduler: class {
    constructor() {
      this.reset = vi.fn();
      this.setSettings = vi.fn();
      this.setTranslationState = vi.fn();
      this.enqueue = vi.fn();
      this.translatedCount = 0;
      this.signalScrollStop = vi.fn();
      this.signalScrollStart = vi.fn();
    }
  }
}));

vi.mock('./PageTranslationBridge.js', () => ({
  PageTranslationBridge: class {
    constructor() {
      this.initialize = vi.fn().mockResolvedValue(undefined);
      this.translate = vi.fn();
      this.restore = vi.fn();
      this.cleanup = vi.fn();
      this.stopPersistence = vi.fn();
    }
  }
}));

vi.mock('./utils/PageTranslationScrollTracker.js', () => ({
  PageTranslationScrollTracker: class {
    constructor() {
      this.start = vi.fn();
      this.stop = vi.fn();
      this.destroy = vi.fn();
      this.notifyActivity = vi.fn();
    }
  }
}));

vi.mock('./utils/PageTranslationSettingsLoader.js', () => ({
  PageTranslationSettingsLoader: {
    load: vi.fn().mockResolvedValue({
      targetLanguage: 'fa',
      translationApi: 'google',
      showOriginalOnHover: true,
      autoTranslateOnDOMChanges: false
    })
  }
}));

vi.mock('./utils/PageTranslationEventManager.js', () => ({
  PageTranslationEventManager: class {
    constructor() {
      this.initialize = vi.fn();
      this.destroy = vi.fn();
    }
  }
}));

// 4. Mock UI & Messaging components
vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendRegularMessage: vi.fn().mockResolvedValue({ success: true })
}));

vi.mock('@/shared/toast/ToastIntegration.js', () => ({
  ToastIntegration: class {
    constructor() {
      this.initialize = vi.fn().mockResolvedValue(undefined);
      this.shutdown = vi.fn();
    }
  }
}));

vi.mock('@/core/managers/core/NotificationManager.js', () => ({
  default: class {
    constructor() {
      this.show = vi.fn();
    }
  }
}));

vi.mock('@/shared/error-management/ErrorHandler.js');

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}));

vi.mock('@/utils/i18n/i18n.js', () => ({
  getTranslationString: vi.fn().mockResolvedValue('Translated String')
}));

vi.mock('@/shared/utils/warning-manager.js', () => ({
  shouldShowProviderWarning: vi.fn().mockResolvedValue(false)
}));

vi.mock('@/features/shared/hover-preview/HoverPreviewManager.js', () => ({
  hoverPreviewManager: {
    initialize: vi.fn(),
    destroy: vi.fn()
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

// Mock window.location
vi.stubGlobal('location', {
  ...window.location,
  href: 'https://example.com'
});

import { PageTranslationManager } from './PageTranslationManager.js';
import { PageTranslationHelper } from './PageTranslationHelper.js';
import { PageTranslationSettingsLoader } from './utils/PageTranslationSettingsLoader.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

describe('PageTranslationManager', () => {
  let manager;

  const createDeferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    return { promise, resolve, reject };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure helper returns true by default for all tests
    PageTranslationHelper.isSuitableForTranslation.mockReturnValue(true);
    
    manager = new PageTranslationManager();
    // Setup standard DOM elements
    document.head.innerHTML = '';
    document.body.innerHTML = '<div>Original Content</div>';
  });

  afterEach(async () => {
    await manager.cleanup();
  });

  describe('Activation', () => {
    it('should activate and load settings', async () => {
      const success = await manager.activate();
      expect(success).toBe(true);
      expect(manager.isActive).toBe(true);
      expect(manager.settings).toBeDefined();
    });
  });

  describe('Translation Lifecycle', () => {
    it('should start translation successfully', async () => {
      await manager.activate();
      const result = await manager.translatePage();

      expect(result.success).toBe(true);
      expect(manager.isTranslating).toBe(true);
      expect(manager.bridge.initialize).toHaveBeenCalled();
      expect(manager.bridge.translate).toHaveBeenCalledWith(document.body);
      expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_START, expect.any(Object));
      
      // Check for layout fix injection
      expect(document.getElementById('ti-translation-layout-fix')).not.toBeNull();
      expect(document.documentElement.classList.contains('ti-translation-active')).toBe(true);
    });

    it('should not translate if already translating', async () => {
      manager.currentUrl = window.location.href; // Prevent reset due to URL mismatch
      manager.isTranslating = true;
      const result = await manager.translatePage();
      expect(result.success).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should not translate if page is not suitable', async () => {
      manager.currentUrl = window.location.href;
      PageTranslationHelper.isSuitableForTranslation.mockReturnValue(false);
      const result = await manager.translatePage();
      expect(result.success).toBe(false);
    });

    it('should restore page correctly', async () => {
      await manager.activate();
      await manager.translatePage();
      
      const result = await manager.restorePage();
      
      expect(result.success).toBe(true);
      expect(manager.isTranslated).toBe(false);
      expect(manager.bridge.restore).toHaveBeenCalled();
      expect(PageTranslationHelper.deepCleanDOM).toHaveBeenCalled();
      
      // Check layout fix removal
      expect(document.getElementById('ti-translation-layout-fix')).toBeNull();
      expect(document.documentElement.classList.contains('ti-translation-active')).toBe(false);
    });

    it('should stop auto-translation without full restore', async () => {
      manager.isAutoTranslating = true;
      manager.isTranslating = true;
      
      const result = await manager.stopAutoTranslation();
      
      expect(result.success).toBe(true);
      expect(manager.isAutoTranslating).toBe(false);
      expect(manager.bridge.stopPersistence).toHaveBeenCalled();
      expect(manager.scheduler.setTranslationState).toHaveBeenCalledWith(false);
    });

    it('should link bridge callback to scheduler enqueue', async () => {
      await manager.activate();
      manager.currentUrl = window.location.href;
      await manager.translatePage();
      
      // Get the callback passed to bridge.initialize
      const initCall = manager.bridge.initialize.mock.calls[0];
      const callback = initCall[1];
      
      const mockNode = document.createElement('div');
      await callback('Hello', { id: 'ctx' }, 1, mockNode);
      
      expect(manager.scheduler.enqueue).toHaveBeenCalledWith('Hello', { id: 'ctx' }, 1, mockNode);
    });

    it('settles silently when bridge initialization fails after START', async () => {
      const error = Object.assign(new Error('context lost'), { type: ErrorTypes.CONTEXT });
      manager.bridge.initialize.mockRejectedValueOnce(error);

      await manager.activate();
      const result = await manager.translatePage();

      expect(result).toEqual({ success: false, reason: 'silent_error' });
      expect(manager.isTranslating).toBe(false);
      expect(manager.isAutoTranslating).toBe(false);
      expect(manager.scheduler.setTranslationState).toHaveBeenCalledWith(false);
      expect(manager.scrollTracker.stop).toHaveBeenCalled();
      expect(manager.bridge.stopPersistence).toHaveBeenCalled();
      expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_IDLE, expect.objectContaining({
        translatedCount: 0,
        failedCount: 0,
        totalCount: 0,
        isTranslated: false,
        isTranslating: false,
        isAutoTranslating: false
      }));
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_ERROR, expect.anything());
      expect(ErrorHandler.getInstance().handle).not.toHaveBeenCalled();
    });

    it('does not emit IDLE for silent failure before START', async () => {
      await manager.activate();
      PageTranslationSettingsLoader.load.mockRejectedValueOnce(
        Object.assign(new Error('context lost'), { type: ErrorTypes.CONTEXT })
      );
      const result = await manager.translatePage();

      expect(result).toEqual({ success: false, reason: 'silent_error' });
      expect(manager.isTranslating).toBe(false);
      expect(manager.abortController).toBeNull();
      expect(manager.translationMessageId).toBeNull();
      expect(manager.sessionContext).toBeNull();
      expect(document.documentElement.classList.contains('ti-translation-active')).toBe(false);
      expect(document.getElementById('ti-translation-layout-fix')).toBeNull();
      expect(sendRegularMessage.mock.calls.some(([message]) => (
        message.action === MessageActions.CANCEL_SESSION
      ))).toBe(false);
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_START, expect.anything());
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_IDLE, expect.anything());
    });

    it('cleans provisional resources on non-silent settings failure', async () => {
      const error = Object.assign(new Error('settings failure'), { type: ErrorTypes.API_ERROR });
      await manager.activate();
      PageTranslationSettingsLoader.load.mockRejectedValueOnce(error);

      await expect(manager.translatePage()).rejects.toBe(error);

      expect(manager.abortController).toBeNull();
      expect(manager.translationMessageId).toBeNull();
      expect(manager.sessionContext).toBeNull();
      expect(document.documentElement.classList.contains('ti-translation-active')).toBe(false);
      expect(document.getElementById('ti-translation-layout-fix')).toBeNull();
      expect(sendRegularMessage.mock.calls.some(([message]) => (
        message.action === MessageActions.CANCEL_SESSION
      ))).toBe(false);
      expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_ERROR, expect.objectContaining({
        error: error.message,
      }));
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_START, expect.anything());
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_IDLE, expect.anything());
    });

    it('does not leak a prior START into a later pre-START silent failure', async () => {
      await manager.activate();
      await manager.translatePage();
      manager.isTranslating = false;
      manager.isTranslated = true;

      PageTranslationSettingsLoader.load.mockRejectedValueOnce(
        Object.assign(new Error('context lost'), { type: ErrorTypes.CONTEXT })
      );
      const emittedBeforeSecondAttempt = pageEventBus.emit.mock.calls.length;

      const result = await manager.translatePage({ isAuto: true });
      const secondAttemptEvents = pageEventBus.emit.mock.calls.slice(emittedBeforeSecondAttempt);

      expect(result).toEqual({ success: false, reason: 'silent_error' });
      expect(secondAttemptEvents).not.toContainEqual([MessageActions.PAGE_TRANSLATE_START, expect.anything()]);
      expect(secondAttemptEvents).not.toContainEqual([MessageActions.PAGE_TRANSLATE_IDLE, expect.anything()]);
      expect(manager.isTranslating).toBe(false);
    });

    it('settles silently when bridge translation fails after initialization', async () => {
      const error = Object.assign(new Error('context lost'), { type: ErrorTypes.EXTENSION_CONTEXT_INVALIDATED });
      manager.bridge.translate.mockImplementationOnce(() => { throw error; });

      await manager.activate();
      const result = await manager.translatePage();

      expect(result).toEqual({ success: false, reason: 'silent_error' });
      expect(manager.isTranslating).toBe(false);
      expect(manager.scheduler.setTranslationState).toHaveBeenCalledWith(false);
      expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_IDLE, expect.objectContaining({
        translatedCount: 0,
        isTranslated: false
      }));
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_ERROR, expect.anything());
    });

    it('preserves partial counts and DOM state during silent settlement', async () => {
      manager.scheduler.translatedCount = 2;
      manager.scheduler.failedCount = 1;
      manager.scheduler.totalTasks = 3;
      manager.bridge.translate.mockImplementationOnce(() => {
        throw Object.assign(new Error('context lost'), { type: ErrorTypes.CONTEXT });
      });

      await manager.activate();
      const result = await manager.translatePage();

      expect(result.reason).toBe('silent_error');
      expect(manager.isTranslated).toBe(true);
      expect(manager.bridge.restore).not.toHaveBeenCalled();
      expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_IDLE, expect.objectContaining({
        translatedCount: 2,
        failedCount: 1,
        totalCount: 3,
        isTranslated: true,
        isTranslating: false,
        isAutoTranslating: false
      }));
    });

    it('settles non-lazy zero-work translation without error presentation', async () => {
      manager.scheduler.totalTasks = 0;

      await manager.activate();
      const result = await manager.translatePage();

      expect(result.success).toBe(true);
      expect(manager.isTranslating).toBe(false);
      expect(manager.isTranslated).toBe(false);
      expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_IDLE, expect.objectContaining({
        translatedCount: 0,
        failedCount: 0,
        totalCount: 0,
        isTranslated: false
      }));
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_ERROR, expect.anything());
    });

    it('keeps non-silent setup failures on the existing error path', async () => {
      const error = Object.assign(new Error('provider failure'), { type: ErrorTypes.API_ERROR });
      manager.bridge.initialize.mockRejectedValueOnce(error);

      await manager.activate();
      await expect(manager.translatePage()).rejects.toBe(error);

      expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_ERROR, expect.objectContaining({
        error: error.message
      }));
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_IDLE, expect.anything());
    });

    it('keeps explicit cancellation on restore lifecycle', async () => {
      await manager.activate();
      await manager.translatePage();

      manager.cancelTranslation();

      expect(manager.bridge.restore).toHaveBeenCalled();
      expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_CANCELLED, expect.any(Object));
      await vi.waitFor(() => expect(pageEventBus.emit).toHaveBeenCalledWith(
        MessageActions.PAGE_RESTORE_COMPLETE,
        expect.any(Object)
      ));
    });

    it('sends CANCEL_SESSION for admitted session restore', async () => {
      const sessionId = 'admitted-session';
      manager.translationMessageId = sessionId;
      manager.scheduler.translationSessionId = sessionId;
      sendRegularMessage.mockClear();

      await manager.restorePage();

      expect(sendRegularMessage.mock.calls.filter(([message]) => (
        message.action === MessageActions.CANCEL_SESSION
      ))).toEqual([
        [expect.objectContaining({
          action: MessageActions.CANCEL_SESSION,
          data: { sessionId },
        })]
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should handle fatal errors by stopping translation and presenting safely', async () => {
      const error = new Error('Fatal failure');
      Object.assign(error, {
        type: ErrorTypes.API_ERROR,
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        cause: 'private',
        arbitrary: { ignored: true }
      });
      manager._handleFatalError(error, ErrorTypes.API_ERROR);
      
      expect(manager.isTranslating).toBe(false);
      expect(manager.isAutoTranslating).toBe(false);
      expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_PROGRESS, expect.objectContaining({ status: 'idle' }));
      expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_ERROR, expect.objectContaining({
        error: 'Fatal failure',
         errorType: ErrorTypes.API_ERROR,
        isFatal: true,
        errorDetails: expect.objectContaining({
          message: 'Fatal failure',
           type: ErrorTypes.API_ERROR,
          originalType: 'HTTP_ERROR',
          statusCode: 503,
          providerName: 'Provider',
          providerId: 'provider-id',
          code: 'UPSTREAM_FAILURE',
          errorCode: 'E_UPSTREAM'
        })
      }));
      const errorEvent = pageEventBus.emit.mock.calls.find(([action]) => action === MessageActions.PAGE_TRANSLATE_ERROR)[1];
      expect(errorEvent.errorDetails).not.toHaveProperty('cause');
      expect(errorEvent.errorDetails).not.toHaveProperty('arbitrary');

      await vi.waitFor(() => expect(ErrorHandler.getInstance().handle).toHaveBeenCalledTimes(1));
      const handledError = ErrorHandler.getInstance().handle.mock.calls[0][0];
      expect(handledError.message).not.toContain('Fatal failure');
      expect(handledError.message).not.toContain('private');
      expect(ErrorHandler.getInstance().handle.mock.calls[0][1]).toMatchObject({
        type: ErrorTypes.API_ERROR,
        context: 'page-translation-fatal',
        showToast: true,
      });
    });

    it('preserves translated state and publishes committed count after fatal partial termination', async () => {
      manager.scheduler.translatedCount = 1;
      manager.isTranslating = true;
      const error = Object.assign(new Error('Fatal failure'), {
        type: ErrorTypes.NETWORK_ERROR,
      });

      manager._handleFatalError(error, ErrorTypes.NETWORK_ERROR);

      expect(manager.isTranslated).toBe(true);
      expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_ERROR, expect.objectContaining({
        translatedCount: 1,
        isFatal: true,
      }));
    });

    it('does not present cancellation or context fatal errors', async () => {
      manager._handleFatalError(Object.assign(new Error('cancelled'), {
        type: ErrorTypes.USER_CANCELLED,
      }), ErrorTypes.USER_CANCELLED);
      manager._handleFatalError(Object.assign(new Error('context lost'), {
        type: ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
      }), ErrorTypes.EXTENSION_CONTEXT_INVALIDATED);

      await Promise.resolve();
      expect(ErrorHandler.getInstance().handle).not.toHaveBeenCalled();
    });

    it('preserves local restore failure behavior outside translation presentation', async () => {
      const error = new Error('local restore failure');
      manager.bridge.restore.mockImplementationOnce(() => { throw error; });

      await expect(manager.restorePage()).rejects.toBe(error);
      expect(ErrorHandler.getInstance().handle).not.toHaveBeenCalled();
      expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_RESTORE_ERROR, {
        error: error.message,
        errorDetails: expect.objectContaining({ message: error.message }),
      });
    });
  });

  describe('Session Context', () => {
    it('should create a unique session context for each translation', async () => {
      manager.currentUrl = window.location.href;
      const res1 = await manager.translatePage();
      expect(res1.success).toBe(true);
      const ctx1 = manager.sessionContext;
      
      manager.isTranslating = false; // Manually reset for test
      manager.isTranslated = false;
      
      const res2 = await manager.translatePage();
      expect(res2.success).toBe(true);
      const ctx2 = manager.sessionContext;
      
      expect(ctx1).not.toBeNull();
      expect(ctx2).not.toBeNull();
      expect(ctx1).not.toBe(ctx2);
    });
  });

  describe('Auto Translation Rules Override', () => {
    it('should set userRestoredOverride to true on manual restore', async () => {
      await manager.activate();
      expect(manager.userRestoredOverride).toBe(false);
      await manager.restorePage({ manual: true });
      expect(manager.userRestoredOverride).toBe(true);
    });

    it('should not set userRestoredOverride to true on non-manual/internal restore', async () => {
      await manager.activate();
      expect(manager.userRestoredOverride).toBe(false);
      await manager.restorePage();
      expect(manager.userRestoredOverride).toBe(false);

      await manager.restorePage({ manual: false });
      expect(manager.userRestoredOverride).toBe(false);
    });

    it('should reset userRestoredOverride when URL changes', async () => {
      await manager.activate();
      manager.userRestoredOverride = true;
      manager.currentUrl = 'https://old.com';
      
      // Simulate URL change trigger via translatePage
      vi.stubGlobal('location', { href: 'https://new.com' });
      await manager.translatePage();
      expect(manager.userRestoredOverride).toBe(false);
    });

    it('should add URL to autoStartCancelledUrls when token warning is declined on auto-start', async () => {
      const { findProviderById } = await import('@/features/translation/providers/ProviderManifest.js');
      findProviderById.mockReturnValueOnce({ displayName: 'AI Provider', consumesTokens: true });

      // Mock _confirmTokenUsage to return false (user cancelled)
      manager._confirmTokenUsage = vi.fn().mockResolvedValue(false);

      await manager.activate();
      manager.currentUrl = window.location.href;

      const result = await manager.translatePage({ isAuto: true });
      expect(result.success).toBe(false);
      expect(manager.autoStartCancelledUrls.has(window.location.href)).toBe(true);
      expect(manager.abortController).toBeNull();
      expect(manager.translationMessageId).toBeNull();
      expect(manager.sessionContext).toBeNull();
      expect(document.documentElement.classList.contains('ti-translation-active')).toBe(false);
      expect(document.getElementById('ti-translation-layout-fix')).toBeNull();
      expect(sendRegularMessage.mock.calls.some(([message]) => (
        message.action === MessageActions.CANCEL_SESSION
      ))).toBe(false);
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_START, expect.anything());
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_IDLE, expect.anything());
    });

    it('should not add URL to autoStartCancelledUrls when token warning is declined on manual start', async () => {
      const { findProviderById } = await import('@/features/translation/providers/ProviderManifest.js');
      findProviderById.mockReturnValueOnce({ displayName: 'AI Provider', consumesTokens: true });

      // Mock _confirmTokenUsage to return false (user cancelled)
      manager._confirmTokenUsage = vi.fn().mockResolvedValue(false);

      await manager.activate();
      manager.currentUrl = window.location.href;

      const result = await manager.translatePage({ isAuto: false });
      expect(result.success).toBe(false);
      expect(manager.autoStartCancelledUrls.has(window.location.href)).toBe(false);
    });

    it('settles token-warning setup rejection instead of hanging', async () => {
      const { findProviderById } = await import('@/features/translation/providers/ProviderManifest.js');
      const { getTranslationString } = await import('@/utils/i18n/i18n.js');
      const error = new Error('localization setup failed');
      findProviderById.mockReturnValueOnce({ displayName: 'AI Provider', consumesTokens: true });
      getTranslationString.mockRejectedValueOnce(error);

      await manager.activate();
      await expect(manager.translatePage()).rejects.toBe(error);

      expect(manager.abortController).toBeNull();
      expect(manager.translationMessageId).toBeNull();
      expect(manager.sessionContext).toBeNull();
      expect(document.getElementById('ti-translation-layout-fix')).toBeNull();
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_START, expect.anything());
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_IDLE, expect.anything());
    });

    it('preserves accepted same-URL auto state when new admission fails', async () => {
      const previousContext = Symbol('previous-session');
      const previousController = new AbortController();
      await manager.activate();
      manager.currentUrl = window.location.href;
      manager.isTranslated = true;
      manager.isAutoTranslating = true;
      manager.abortController = previousController;
      manager.translationMessageId = 'previous-message';
      manager.sessionContext = previousContext;
      manager.scheduler.translatedCount = 4;
      manager.scheduler.failedCount = 1;
      manager.scheduler.totalTasks = 5;
      manager.scheduler.translationSessionId = 'previous-session';
      manager.scheduler.sessionContext = previousContext;
      manager.bridge.session = { active: true };
      manager._injectLayoutFix();
      manager.scheduler.reset.mockClear();
      manager.bridge.cleanup.mockClear();
      PageTranslationSettingsLoader.load.mockRejectedValueOnce(
        Object.assign(new Error('context lost'), { type: ErrorTypes.CONTEXT })
      );

      const result = await manager.translatePage({ isAuto: true });

      expect(result).toEqual({ success: false, reason: 'silent_error' });
      expect(manager.isTranslated).toBe(true);
      expect(manager.isTranslating).toBe(false);
      expect(manager.isAutoTranslating).toBe(true);
      expect(manager.scheduler.reset).not.toHaveBeenCalled();
      expect(manager.scheduler.translatedCount).toBe(4);
      expect(manager.scheduler.failedCount).toBe(1);
      expect(manager.scheduler.totalTasks).toBe(5);
      expect(manager.scheduler.translationSessionId).toBe('previous-session');
      expect(manager.scheduler.sessionContext).toBe(previousContext);
      expect(manager.bridge.cleanup).not.toHaveBeenCalled();
      expect(manager.bridge.session).toEqual({ active: true });
      expect(manager.abortController).toBe(previousController);
      expect(manager.translationMessageId).toBe('previous-message');
      expect(manager.sessionContext).toBe(previousContext);
      expect(document.documentElement.classList.contains('ti-translation-active')).toBe(true);
      expect(document.getElementById('ti-translation-layout-fix')).not.toBeNull();
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_START, expect.anything());
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_IDLE, expect.anything());
    });

    it('resets scheduler only after START admission', async () => {
      await manager.activate();
      manager.currentUrl = window.location.href;
      manager.scheduler.reset.mockClear();
      pageEventBus.emit.mockClear();

      const result = await manager.translatePage();
      const startCall = pageEventBus.emit.mock.invocationCallOrder.find((callOrder, index) => (
        pageEventBus.emit.mock.calls[index][0] === MessageActions.PAGE_TRANSLATE_START
          ? callOrder
          : false
      ));

      expect(result.success).toBe(true);
      expect(startCall).toBeDefined();
      expect(manager.scheduler.reset).toHaveBeenCalledOnce();
      expect(manager.scheduler.reset.mock.invocationCallOrder[0]).toBeGreaterThan(startCall);
    });

    it('does not admit a settings continuation after cancellation', async () => {
      await manager.activate();
      manager.currentUrl = window.location.href;
      const settings = createDeferred();
      PageTranslationSettingsLoader.load.mockImplementationOnce(() => settings.promise);
      const pending = manager.translatePage();

      await vi.waitFor(() => expect(manager.abortController).not.toBeNull());
      const provisionalMessageId = manager.translationMessageId;
      expect(provisionalMessageId).not.toBe(manager.scheduler.translationSessionId);
      manager.cancelTranslation();
      settings.resolve({
        translationApi: 'google',
        targetLanguage: 'fa',
        lazyLoading: false,
        autoTranslateOnDOMChanges: false,
        showOriginalOnHover: true,
        tokenWarningHidden: true,
      });

      const result = await pending;

      expect(result).toEqual({ success: false, reason: 'silent_error' });
      expect(manager.bridge.initialize).not.toHaveBeenCalled();
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_START, expect.anything());
      expect(sendRegularMessage.mock.calls.some(([message]) => (
        message.action === MessageActions.CANCEL_SESSION
      ))).toBe(false);
      await vi.waitFor(() => expect(pageEventBus.emit).toHaveBeenCalledWith(
        MessageActions.PAGE_RESTORE_COMPLETE,
        expect.any(Object)
      ));
    });

    it('does not admit a token confirmation after cancellation', async () => {
      const { findProviderById } = await import('@/features/translation/providers/ProviderManifest.js');
      const confirmation = createDeferred();
      findProviderById.mockReturnValueOnce({ displayName: 'AI Provider', consumesTokens: true });
      await manager.activate();
      manager.currentUrl = window.location.href;
      manager._confirmTokenUsage = vi.fn(() => confirmation.promise);
      const pending = manager.translatePage();

      await vi.waitFor(() => expect(manager._confirmTokenUsage).toHaveBeenCalled());
      manager.cancelTranslation();
      confirmation.resolve(true);

      const result = await pending;

      expect(result).toEqual({ success: false, reason: 'silent_error' });
      expect(manager.bridge.initialize).not.toHaveBeenCalled();
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_START, expect.anything());
      expect(sendRegularMessage.mock.calls.some(([message]) => (
        message.action === MessageActions.CANCEL_SESSION
      ))).toBe(false);
      await vi.waitFor(() => expect(pageEventBus.emit).toHaveBeenCalledWith(
        MessageActions.PAGE_RESTORE_COMPLETE,
        expect.any(Object)
      ));
    });

    it('does not admit a settings continuation after navigation', async () => {
      await manager.activate();
      manager.currentUrl = window.location.href;
      const settings = createDeferred();
      PageTranslationSettingsLoader.load.mockImplementationOnce(() => settings.promise);
      const pending = manager.translatePage();

      await vi.waitFor(() => expect(manager.abortController).not.toBeNull());
      vi.stubGlobal('location', { ...window.location, href: 'https://new.example.com' });
      settings.resolve({
        translationApi: 'google',
        targetLanguage: 'fa',
        lazyLoading: false,
        autoTranslateOnDOMChanges: false,
        showOriginalOnHover: true,
        tokenWarningHidden: true,
      });

      const result = await pending;

      expect(result).toEqual({ success: false, reason: 'silent_error' });
      expect(manager.abortController).toBeNull();
      expect(manager.translationMessageId).toBeNull();
      expect(manager.sessionContext).toBeNull();
      expect(document.getElementById('ti-translation-layout-fix')).toBeNull();
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_START, expect.anything());
    });

    it('admits a clean second attempt after pre-START failure', async () => {
      await manager.activate();
      manager.currentUrl = window.location.href;
      PageTranslationSettingsLoader.load.mockRejectedValueOnce(
        Object.assign(new Error('context lost'), { type: ErrorTypes.CONTEXT })
      );
      await manager.translatePage();

      pageEventBus.emit.mockClear();
      PageTranslationSettingsLoader.load.mockResolvedValueOnce({
        translationApi: 'google',
        targetLanguage: 'fa',
        lazyLoading: false,
        autoTranslateOnDOMChanges: false,
        showOriginalOnHover: true,
        tokenWarningHidden: true,
      });

      const result = await manager.translatePage();

      expect(result.success).toBe(true);
      expect(pageEventBus.emit.mock.calls.filter(([action]) => (
        action === MessageActions.PAGE_TRANSLATE_START
      ))).toHaveLength(1);
      expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_ERROR, expect.anything());
    });

    it('should support comma and newline parsing for auto translate rules', () => {
      const parseRules = (v) => v.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
      const input = "example.com\n  google.com,   github.com  \n,apple.com";
      const result = parseRules(input);
      expect(result).toEqual(['example.com', 'google.com', 'github.com', 'apple.com']);
    });
  });
});
