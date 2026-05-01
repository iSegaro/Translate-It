import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn().mockReturnValue({
      handle: vi.fn().mockResolvedValue(undefined)
    })
  }
}));

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
import { pageEventBus } from '@/core/PageEventBus.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

describe('PageTranslationManager', () => {
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure helper returns true by default for all tests
    PageTranslationHelper.isSuitableForTranslation.mockReturnValue(true);
    
    manager = new PageTranslationManager();
    // Setup standard DOM elements
    document.head.innerHTML = '';
    document.body.innerHTML = '<div>Original Content</div>';
  });

  afterEach(() => {
    manager.cleanup();
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
  });

  describe('Error Handling', () => {
    it('should handle fatal errors by stopping translation', () => {
      const error = new Error('Fatal failure');
      manager._handleFatalError(error, 'TEST_ERROR');
      
      expect(manager.isTranslating).toBe(false);
      expect(manager.isAutoTranslating).toBe(false);
      expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_PROGRESS, expect.objectContaining({ status: 'idle' }));
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
});
