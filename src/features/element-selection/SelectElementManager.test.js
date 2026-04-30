import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
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
    isValidSync: vi.fn(() => true)
  }
}));

vi.mock('@/shared/error-management/ErrorMatcher.js', () => ({
  isFatalError: vi.fn(() => false),
  isCancellationError: vi.fn(() => false),
  matchErrorToType: vi.fn(() => 'UNKNOWN')
}));

vi.mock('@/shared/config/config.js', () => ({
  getSettingsAsync: vi.fn(() => Promise.resolve({})),
  getSelectElementShowOriginalOnHoverAsync: vi.fn(() => Promise.resolve(true)),
  getSourceLanguageAsync: vi.fn(() => Promise.resolve('en')),
  getTargetLanguageAsync: vi.fn(() => Promise.resolve('fa')),
  getTranslationApiAsync: vi.fn(() => Promise.resolve('google')),
  getAIContextTranslationEnabledAsync: vi.fn(() => Promise.resolve(true))
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
    GOOGLE: 'google'
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

  beforeEach(async () => {
    vi.clearAllMocks();
    if (!SelectElementManager) {
      const module = await import('./SelectElementManager.js');
      SelectElementManager = module.SelectElementManager;
    }
    manager = new SelectElementManager();
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
});
