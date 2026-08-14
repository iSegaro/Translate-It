import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: {
    ELEMENT_SELECTION: 'ElementSelection'
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    operation: vi.fn()
  }))
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    on: vi.fn(),
    emit: vi.fn(),
    off: vi.fn()
  },
  WINDOWS_MANAGER_EVENTS: {
    SHOW_WINDOW: 'SHOW_WINDOW'
  }
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendMessage: vi.fn(() => Promise.resolve()),
  sendRegularMessage: vi.fn(() => Promise.resolve())
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isTabActive: vi.fn(() => true),
    isValidSync: vi.fn(() => true),
    isContextError: vi.fn(() => false)
  }
}));
vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn()
  }
}));

vi.mock('@/shared/error-management/ErrorMatcher.js', () => ({
  isFatalError: vi.fn(() => false),
  isCancellationError: vi.fn(() => false)
}));

vi.mock('@/shared/constants/ui.js', () => ({
  NOTIFICATION_TIME: {
    WARNING_PROVIDER: 3000
  }
}));

vi.mock('@/shared/constants/translation.js', () => ({
  TRANSLATION_STATUS: {
    TRANSLATING: 'translating',
    COMPLETED: 'completed',
    ERROR: 'error'
  }
}));

vi.mock('@/shared/config/config.js', () => ({
  getSettingsAsync: vi.fn(() => Promise.resolve({})),
  getSelectElementShowOriginalOnHoverAsync: vi.fn(() => Promise.resolve(true)),
  getSourceLanguageAsync: vi.fn(() => Promise.resolve('en')),
  getTargetLanguageAsync: vi.fn(() => Promise.resolve('fa')),
  getTranslationApiAsync: vi.fn(() => Promise.resolve('google')),
  getEffectiveProviderAsync: vi.fn(() => Promise.resolve('google')),
  getAIContextTranslationEnabledAsync: vi.fn(() => Promise.resolve(true)),
  TranslationMode: {
    Select_Element: 'select_element'
  }
}));

vi.mock('@/shared/config/constants.js', () => ({
  NOTIFICATION_TIME: {
    WARNING_PROVIDER: 3000
  },
  TRANSLATION_STATUS: {
    TRANSLATING: 'translating',
    COMPLETED: 'completed',
    ERROR: 'error'
  },
  UI_HOST_IDS: {
    MAIN: 'translate-it-ui-host'
  }
}));

vi.mock('@/utils/i18n/i18n.js', () => ({
  getTranslationString: vi.fn((key) => key)
}));

vi.mock('@/shared/utils/warning-manager.js', () => ({
  shouldShowProviderWarning: vi.fn(() => Promise.resolve(false))
}));

vi.mock('@/features/shared/hover-preview/HoverPreviewManager.js', () => ({
  hoverPreviewManager: {
    initialize: vi.fn(),
    deactivate: vi.fn()
  }
}));

vi.mock('./SelectElement.scss?inline', () => ({
  default: '.mock-styles {}'
}));

vi.mock('./core/DomTranslatorAdapter.js', () => ({
  DomTranslatorAdapter: class {
    initialize = vi.fn(() => Promise.resolve());
    translateElement = vi.fn(() => Promise.resolve({ success: true }));
    cleanup = vi.fn();
    cancelTranslation = vi.fn();
  }
}));

vi.mock('./core/ElementSelector.js', () => ({
  ElementSelector: class {
    initialize = vi.fn(() => Promise.resolve());
    activate = vi.fn();
    deactivate = vi.fn();
    cleanup = vi.fn();
    handleMouseOver = vi.fn();
    handleMouseOut = vi.fn();
    clearHighlight = vi.fn();
    getHighlightedElement = vi.fn();
    isOurElement = vi.fn(() => false);
  }
}));

vi.mock('./utils/elementHelpers.js', () => ({
  extractTextFromElement: vi.fn(() => 'test text'),
  isValidTextElement: vi.fn(() => true)
}));

vi.mock('./SelectElementNotificationManager.js', () => ({
  getSelectElementNotificationManager: vi.fn(() => Promise.resolve({
    showActivationNotification: vi.fn(),
    showProgress: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    hide: vi.fn(),
    cleanup: vi.fn()
  }))
}));

vi.mock('@/core/managers/core/NotificationManager.js', () => ({
  default: class NotificationManager {
    constructor() {}
  }
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    constructor() {
      this.resources = new Set();
    }
    trackResource() {}
    cleanup() {}
    addEventListener(target, event, handler) {
      if (target && target.on) {
        target.on(event, handler);
      } else if (target && target.addEventListener) {
        target.addEventListener(event, handler);
      }
    }
    removeEventListener() {}
  }
}));

vi.mock('@/features/translation/providers/ProviderConstants.js', () => ({
  ProviderRegistryIds: {
    GOOGLE: 'google',
    GOOGLE_V2: 'googlev2'
  },
  ProviderNames: {
    GOOGLE_TRANSLATE: 'GoogleTranslate',
    GOOGLE_TRANSLATE_V2: 'GoogleTranslateV2'
  },
  ProviderTypes: {
    TRANSLATE: 'translate'
  }
}));

vi.mock('@/utils/browser/compatibility.js', () => ({
  deviceDetector: {
    isMobile: vi.fn(() => false)
  }
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    ACTIVATE_SELECT_ELEMENT_MODE: 'ACTIVATE_SELECT_ELEMENT_MODE',
    TRANSLATE: 'TRANSLATE'
  }
}));

let SelectElementManager;

describe('SelectElementManager', () => {
  let manager;
  let errorHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    if (!SelectElementManager) {
      const module = await import('./SelectElementManager.js');
      SelectElementManager = module.SelectElementManager;
    }
    manager = new SelectElementManager();
    const { ErrorHandler } = await import('@/shared/error-management/ErrorHandler.js');
    errorHandler = { handle: vi.fn(() => Promise.resolve()) };
    ErrorHandler.getInstance.mockReturnValue(errorHandler);
  });

  it('should be instantiable', () => {
    expect(manager).toBeDefined();
    expect(manager.isActive).toBe(false);
  });

  it('should initialize services', async () => {
    await manager.initialize();
    expect(manager.isInitialized).toBe(true);
    expect(manager.domTranslatorAdapter.initialize).toHaveBeenCalled();
    expect(manager.elementSelector.initialize).toHaveBeenCalled();
  });

  it('should activate select element mode', async () => {
    await manager.initialize();
    await manager.activateSelectElementMode();
    
    const { pageEventBus } = await import('@/core/PageEventBus.js');
    
    expect(manager.isActive).toBe(true);
    expect(manager.elementSelector.activate).toHaveBeenCalled();
    expect(pageEventBus.emit).toHaveBeenCalledWith('show-select-element-notification', expect.any(Object));
  });

  it('should deactivate select element mode', async () => {
    await manager.initialize();
    await manager.activateSelectElementMode();
    manager.deactivate();
    
    const { pageEventBus } = await import('@/core/PageEventBus.js');
    
    expect(manager.isActive).toBe(false);
    expect(manager.elementSelector.deactivate).toHaveBeenCalled();
    expect(pageEventBus.emit).toHaveBeenCalledWith('dismiss-select-element-notification', expect.any(Object));
  });

  it('should handle click on element to translate', async () => {
    await manager.initialize();
    await manager.activateSelectElementMode();
    manager.activationTime = 0; // Bypass cooldown
    
    const mockElement = document.createElement('div');
    mockElement.textContent = 'test text';
    manager.elementSelector.getHighlightedElement.mockReturnValue(mockElement);
    
    // Simulate click
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.body.appendChild(mockElement);
    
    await manager.handleClick(event);
    
    expect(manager.domTranslatorAdapter.translateElement).toHaveBeenCalledWith(mockElement, expect.any(Object));
    expect(manager.isActive).toBe(false); // Should deactivate after translation
    expect(document.documentElement.getAttribute('data-translate-it-select-mode')).toBeNull();
  });

  describe('translation failure classification', () => {
    let cleanupSpy;

    beforeEach(() => {
      manager.isActive = true;
      cleanupSpy = vi.spyOn(manager, 'performPostTranslationCleanup').mockImplementation(() => {});
    });

    it('shows validation failures as visible errors', async () => {
      const error = Object.assign(new Error('V3 marker contract violation'), { type: 'VALIDATION' });
      manager.domTranslatorAdapter.translateElement.mockRejectedValue(error);

      await manager.startTranslation(document.createElement('div'));

      expect(errorHandler.handle).toHaveBeenCalledWith(error, {
        context: 'select-element',
        showToast: true
      });
      expect(cleanupSpy).toHaveBeenCalledWith({ reason: 'error' });
      expect(manager.logger.warn).toHaveBeenCalledWith('Select Element translation failed:', error);
    });

    it('shows V3 empty interval failures as visible errors', async () => {
      const error = Object.assign(new Error('V3_EMPTY_TRANSLATED_INTERVAL'), { type: 'VALIDATION' });
      manager.domTranslatorAdapter.translateElement.mockRejectedValue(error);

      await manager.startTranslation(document.createElement('div'));

      expect(errorHandler.handle).toHaveBeenCalledWith(error, expect.objectContaining({ showToast: true }));
      expect(cleanupSpy).toHaveBeenCalledWith({ reason: 'error' });
    });

    it('keeps explicit no-content failures silent', async () => {
      const error = new Error('No translatable text found');
      manager.domTranslatorAdapter.translateElement.mockRejectedValue(error);

      await manager.startTranslation(document.createElement('div'));

      expect(errorHandler.handle).not.toHaveBeenCalled();
      expect(cleanupSpy).toHaveBeenCalledWith({ reason: 'cancel' });
      expect(manager.logger.debug).toHaveBeenCalledWith('Select Element translation skipped:', error.message);
    });

    it('keeps user cancellation silent', async () => {
      const { isCancellationError } = await import('@/shared/error-management/ErrorMatcher.js');
      isCancellationError.mockReturnValueOnce(true);
      const error = Object.assign(new Error('cancelled'), { type: 'USER_CANCELLED' });
      manager.domTranslatorAdapter.translateElement.mockRejectedValue(error);

      await manager.startTranslation(document.createElement('div'));

      expect(errorHandler.handle).not.toHaveBeenCalled();
      expect(cleanupSpy).toHaveBeenCalledWith({ reason: 'cancel' });
    });

    it('keeps stale cancellation results silent', async () => {
      const deactivateSpy = vi.spyOn(manager, 'deactivate').mockImplementation(() => {});
      manager.domTranslatorAdapter.translateElement.mockResolvedValue({ success: false, cancelled: true });

      await manager.startTranslation(document.createElement('div'));

      expect(errorHandler.handle).not.toHaveBeenCalled();
      expect(deactivateSpy).toHaveBeenCalledWith({ reason: 'cancel', silent: true });
    });

    it('keeps provider failures visible', async () => {
      const error = Object.assign(new Error('Network failed'), { type: 'NETWORK_ERROR' });
      manager.domTranslatorAdapter.translateElement.mockRejectedValue(error);

      await manager.startTranslation(document.createElement('div'));

      expect(errorHandler.handle).toHaveBeenCalledWith(error, expect.objectContaining({ showToast: true }));
      expect(cleanupSpy).toHaveBeenCalledWith({ reason: 'error' });
    });

    it.each([
      ['V3 failure', Object.assign(new Error('V3 marker contract violation'), { type: 'VALIDATION' })],
      ['timeout', Object.assign(new Error('Batch translation timed out'), { type: 'TRANSLATION_TIMEOUT' })],
      ['provider failure', Object.assign(new Error('Network failed'), { type: 'NETWORK_ERROR' })],
    ])('uses generic partial-failure display for %s', async (_label, error) => {
      error.translationOutcome = { committedParentCount: 1, totalParentCount: 2, cancelled: false };
      manager.domTranslatorAdapter.translateElement.mockRejectedValue(error);

      await manager.startTranslation(document.createElement('div'));

      expect(errorHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Translation failed',
          type: 'TRANSLATION_FAILED',
          cause: error,
        }),
        expect.objectContaining({ context: 'select-element', showToast: true })
      );
      expect(errorHandler.handle.mock.calls[0][0].message).not.toContain('V3');
      expect(cleanupSpy).toHaveBeenCalledWith({ reason: 'error' });
    });

    it('keeps committed translations and suppresses partial error on cancellation', async () => {
      const error = Object.assign(new Error('cancelled'), { type: 'USER_CANCELLED' });
      error.translationOutcome = { committedParentCount: 1, totalParentCount: 2, cancelled: true };
      manager.domTranslatorAdapter.translateElement.mockRejectedValue(error);

      await manager.startTranslation(document.createElement('div'));

      expect(errorHandler.handle).not.toHaveBeenCalled();
      expect(cleanupSpy).toHaveBeenCalledWith({ reason: 'cancel' });
    });

    it('keeps successful translation cleanup unchanged', async () => {
      manager.domTranslatorAdapter.translateElement.mockResolvedValue({ success: true });

      await manager.startTranslation(document.createElement('div'));

      expect(errorHandler.handle).not.toHaveBeenCalled();
      expect(cleanupSpy).toHaveBeenCalledWith({ reason: 'success' });
    });

    it.each([
      undefined,
      {},
      { success: false, error: Object.assign(new Error('No translation results were accepted'), {
        type: 'NO_ACCEPTED_TRANSLATION_RESULTS'
      }) }
    ])('classifies resolved non-success result as visible failure: %o', async (result) => {
      manager.domTranslatorAdapter.translateElement.mockResolvedValue(result);

      await manager.startTranslation(document.createElement('div'));

      expect(errorHandler.handle).toHaveBeenCalledWith(
        result?.error || expect.any(Error),
        expect.objectContaining({ context: 'select-element', showToast: true })
      );
      expect(cleanupSpy).toHaveBeenCalledWith({ reason: 'error' });
    });

    it('preserves partial translations after successful partial commit', async () => {
      manager.domTranslatorAdapter.translateElement.mockResolvedValue({
        success: true,
        committedParentCount: 1
      });

      await manager.startTranslation(document.createElement('div'));

      expect(errorHandler.handle).not.toHaveBeenCalled();
      expect(cleanupSpy).toHaveBeenCalledWith({ reason: 'success' });
    });
  });

  describe('event handling', () => {
    beforeEach(async () => {
      await manager.initialize();
      await manager.activateSelectElementMode();
      manager.activationTime = 0; // Bypass cooldown
    });

    it('should handle ESC key to deactivate', () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      manager.handleKeyDown(event);
      expect(manager.isActive).toBe(false);
    });

    it('should handle mouseover to highlight element', () => {
      const mockElement = document.createElement('div');
      const event = new MouseEvent('mouseover', { clientX: 100, clientY: 100 });
      Object.defineProperty(event, 'target', { value: mockElement });
      
      // First movement
      manager.handleMouseOver(event);
      // Second movement to trigger highlight
      const event2 = new MouseEvent('mouseover', { clientX: 110, clientY: 110 });
      Object.defineProperty(event2, 'target', { value: mockElement });
      manager.handleMouseOver(event2);

      expect(manager.elementSelector.handleMouseOver).toHaveBeenCalledWith(mockElement);
    });

    it('should handle touch events', () => {
      const mockElement = document.createElement('div');
      const touch = { clientX: 100, clientY: 100, target: mockElement };
      const event = new TouchEvent('touchstart', { touches: [touch] });
      
      manager.handleTouchStart(event);
      expect(manager.isActive).toBe(true);

      const moveEvent = new TouchEvent('touchmove', { touches: [touch] });
      // Mock document.elementFromPoint
      document.elementFromPoint = vi.fn(() => mockElement);
      
      manager.handleTouchMove(moveEvent);
      expect(manager.elementSelector.handleMouseOver).toHaveBeenCalledWith(mockElement);
    });

    it('should block auxclick (middle-click) interaction', () => {
      const event = new MouseEvent('auxclick', { bubbles: true, cancelable: true });
      vi.spyOn(event, 'preventDefault');
      vi.spyOn(event, 'stopImmediatePropagation');
      
      manager.handleInteraction(event);
      
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopImmediatePropagation).toHaveBeenCalled();
    });

    it('should block interactions on highlighted elements', () => {
      const mockElement = document.createElement('div');
      mockElement.setAttribute('data-translate-highlighted', 'true');
      
      // Mock isOurElement to return false for highlighted elements (the fix)
      manager.elementSelector.isOurElement.mockReturnValue(false);
      
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      vi.spyOn(event, 'preventDefault');
      vi.spyOn(event, 'stopImmediatePropagation');
      
      manager.handleInteraction(event);
      
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopImmediatePropagation).toHaveBeenCalled();
    });

    it('should NOT block interactions on extension UI elements', () => {
      const mockElement = document.createElement('div');
      manager.elementSelector.isOurElement.mockImplementation((el) => el === mockElement);
      
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'target', { value: mockElement, writable: false });
      event.composedPath = vi.fn(() => [mockElement]);
      
      vi.spyOn(event, 'preventDefault');
      
      manager.handleInteraction(event);
      
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('cross-frame and notifications', () => {
    it('should show notification in top frame', async () => {
      manager.isTopFrame = true;
      await manager.initialize();
      await manager.activateSelectElementMode();
      
      const { pageEventBus } = await import('@/core/PageEventBus.js');
      expect(pageEventBus.emit).toHaveBeenCalledWith('show-select-element-notification', expect.any(Object));
    });

    it('should listen to global deactivation message', async () => {
      await manager.initialize();
      await manager.activateSelectElementMode();
      
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'DEACTIVATE_ALL_SELECT_MANAGERS' }
      }));
      
      expect(manager.isActive).toBe(false);
    });
  });

  describe('emergency cleanup', () => {
    it('should perform emergency cleanup if context becomes invalid', async () => {
      vi.useFakeTimers();
      await manager.initialize();
      await manager.activateSelectElementMode();
      
      const ExtensionContextManager = (await import('@/core/extensionContext.js')).default;
      ExtensionContextManager.isValidSync.mockReturnValue(false);
      
      vi.advanceTimersByTime(2500);
      
      expect(manager.isActive).toBe(false);
      expect(document.documentElement.getAttribute('data-translate-it-select-mode')).toBeNull();
      vi.useRealTimers();
    });
  });

  describe('advanced interactions', () => {
    beforeEach(async () => {
      await manager.initialize();
      await manager.activateSelectElementMode();
      manager.activationTime = 0;
    });

    it('should ignore mouseover on our own UI elements', () => {
      const mockElement = document.createElement('div');
      manager.elementSelector.isOurElement.mockReturnValue(true);
      
      const event = new MouseEvent('mouseover');
      Object.defineProperty(event, 'target', { value: mockElement });
      manager.hasInitialMovementOccurred = true;
      
      manager.handleMouseOver(event);
      expect(manager.elementSelector.handleMouseOver).not.toHaveBeenCalled();
    });

    it('should handle deactivation message from iframe', () => {
      manager.isTopFrame = true;
      manager.setupEventListeners(); // Re-setup to bind iframeMessageHandler
      
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'translate-it-deactivate-select-element' }
      }));
      
      expect(manager.isActive).toBe(false);
    });

    it('should emit progress events during translation', async () => {
      let progressCallback;
      manager.domTranslatorAdapter.translateElement.mockImplementation((el, opts) => {
        progressCallback = opts.onProgress;
        return Promise.resolve({ success: true });
      });

      const mockElement = document.createElement('div');
      mockElement.textContent = 'test';
      manager.elementSelector.getHighlightedElement.mockReturnValue(mockElement);
      
      await manager.handleClick(new MouseEvent('click'));
      
      const { pageEventBus } = await import('@/core/PageEventBus.js');
      await progressCallback();
      
      expect(pageEventBus.emit).toHaveBeenCalledWith('ELEMENT_TRANSLATIONS_AVAILABLE');
    });

    it('should unlock page interaction immediately after click', async () => {
      const mockElement = document.createElement('div');
      mockElement.textContent = 'test';
      manager.elementSelector.getHighlightedElement.mockReturnValue(mockElement);
      
      const removeSpy = vi.spyOn(manager, 'removeEventListeners');
      
      await manager.handleClick(new MouseEvent('click'));
      
      expect(document.documentElement.getAttribute('data-translate-it-select-mode')).toBeNull();
      expect(removeSpy).toHaveBeenCalled();
    });
  });
});
