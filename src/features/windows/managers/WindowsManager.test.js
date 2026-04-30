import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WindowsManager } from './WindowsManager.js';
import { WindowsManagerEvents, WINDOWS_MANAGER_EVENTS, pageEventBus } from '@/core/PageEventBus.js';
import { SELECTION_EVENTS } from '@/features/text-selection/events/SelectionEvents.js';

// Mock ALL dependencies using absolute aliases to avoid path issues
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()
  }))
}));

vi.mock('@/features/windows/managers/core/WindowsConfig.js', () => ({ 
  WindowsConfig: {
    TIMEOUTS: { 
      OUTSIDE_CLICK_DELAY: 600,
      PENDING_WINDOW_RESET: 500,
      ICON_CLEANUP: 150
    },
    ANIMATION: {
      FADE_OUT_DURATION: 125
    }
  } 
}));

vi.mock('@/features/windows/managers/core/WindowsState.js', () => ({ 
  WindowsState: vi.fn().mockImplementation(function() {
    this.reset = vi.fn();
    this.setVisible = vi.fn();
    this.setIconMode = vi.fn();
    this.setOriginalText = vi.fn();
    this.setProvider = vi.fn();
    this.setActiveWindowId = vi.fn();
    this.setProcessing = vi.fn();
    this.clearIconClickContext = vi.fn();
    this.setIconClickContext = vi.fn();
    this.setTranslationCancelled = vi.fn();
    this.isVisible = false;
    this.isIconMode = false;
    this.activeWindowId = null;
    this.originalText = null;
    return this;
  })
}));

vi.mock('@/features/windows/managers/crossframe/CrossFrameManager.js', () => ({ 
  CrossFrameManager: vi.fn().mockImplementation(function() {
    this.frameId = 'test-frame';
    this.setEventHandlers = vi.fn();
    this.messageRouter = {
      broadcastOutsideClick: vi.fn()
    };
    return this;
  })
}));

vi.mock('@/features/windows/managers/translation/TranslationHandler.js', () => ({ 
  TranslationHandler: vi.fn().mockImplementation(function() {
    this.translate = vi.fn().mockResolvedValue({ translatedText: 'translated' });
    this.cancel = vi.fn();
    this.getEffectiveProvider = vi.fn().mockResolvedValue('google_v2');
    return this;
  }) 
}));

vi.mock('@/features/windows/managers/interaction/ClickManager.js', () => ({ 
  ClickManager: vi.fn().mockImplementation(function() {
    this.setHandlers = vi.fn();
    this.addOutsideClickListener = vi.fn();
    this.cleanup = vi.fn();
    return this;
  }) 
}));

vi.mock('@/features/windows/managers/theme/ThemeManager.js', () => ({ 
  ThemeManager: vi.fn().mockImplementation(function() {
    this.applyTheme = vi.fn();
    this.cleanup = vi.fn();
    return this;
  }) 
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({ 
  default: { 
    get: vi.fn().mockImplementation((key, def) => {
      if (key === 'selectionTranslationMode') return 'onClick';
      if (key === 'TRANSLATE_ON_TEXT_SELECTION') return true;
      if (key === 'MOBILE_UI_MODE') return 'auto';
      return def;
    }),
    onSettingsChanged: vi.fn() 
  } 
}));

vi.mock('@/shared/config/config.js', () => ({ 
  state: {}, 
  SelectionTranslationMode: { 
    IMMEDIATE: 'immediate',
    ON_FAB_CLICK: 'onFabClick',
    ON_CLICK: 'onClick'
  } 
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({ 
  ErrorHandler: { 
    getInstance: vi.fn(() => ({ 
      getErrorForUI: vi.fn().mockResolvedValue({ 
        message: 'Mock Error', 
        canRetry: true, 
        needsSettings: false 
      }) 
    })) 
  } 
}));

vi.mock('@/shared/error-management/ErrorTypes.js', () => ({ 
  ErrorTypes: { API_ERROR: 'api-error' } 
}));

vi.mock('@/core/extensionContext.js', () => ({ 
  default: { 
    isValidSync: vi.fn().mockReturnValue(true),
    isContextValid: vi.fn().mockReturnValue(true),
    isContextError: vi.fn().mockReturnValue(false),
    handleContextError: vi.fn()
  } 
}));

vi.mock('@/core/PageEventBus.js', () => ({
  WINDOWS_MANAGER_EVENTS: {
    SHOW_WINDOW: 'windows-manager-show-window',
    UPDATE_WINDOW: 'windows-manager-update-window',
    SHOW_ICON: 'windows-manager-show-icon',
    DISMISS_WINDOW: 'windows-manager-dismiss-window',
    DISMISS_ICON: 'windows-manager-dismiss-icon',
    ICON_CLICKED: 'windows-manager-icon-clicked',
    SHOW_MOBILE_SHEET: 'windows-manager-show-mobile-sheet'
  },
  WindowsManagerEvents: {
    showWindow: vi.fn(),
    showIcon: vi.fn(),
    updateWindow: vi.fn(),
    dismissWindow: vi.fn(),
    dismissIcon: vi.fn(),
    showMobileSheet: vi.fn(),
    iconClicked: vi.fn()
  },
  pageEventBus: { 
    on: vi.fn(), 
    off: vi.fn(), 
    emit: vi.fn() 
  }
}));

vi.mock('@/features/text-selection/events/SelectionEvents.js', () => ({ 
  SELECTION_EVENTS: { 
    GLOBAL_SELECTION_TRIGGER: 'global-selection-trigger' 
  } 
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class {
    constructor() {
      this.addEventListener = vi.fn();
      this.removeEventListener = vi.fn();
      this.trackTimeout = vi.fn();
      this.trackResource = vi.fn();
    }
    cleanup() {}
    destroy() {}
  }
}));

vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  default: {
    getInstance: vi.fn(() => ({
      isUrlExcludedForFeature: vi.fn().mockResolvedValue(false),
      isFeatureAllowed: vi.fn().mockResolvedValue(true)
    }))
  }
}));

vi.mock('@/utils/browser/compatibility.js', () => ({ 
  deviceDetector: { 
    isMobile: vi.fn().mockReturnValue(false),
    shouldEnableMobileUI: vi.fn().mockReturnValue(false)
  } 
}));

vi.mock('@/shared/config/constants.js', () => ({
  UI_HOST_IDS: { WINDOW: 'window-id' },
  TRANSLATION_HTML: {},
  MOBILE_CONSTANTS: {
    UI_MODE: { AUTO: 'auto', MOBILE: 'mobile', DESKTOP: 'desktop' },
    VIEWS: { SELECTION: 'selection' },
    SHEET_STATE: { PEEK: 'peek' }
  }
}));

describe('WindowsManager', () => {
  let windowsManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    WindowsManager.resetInstance();
    windowsManager = WindowsManager.getInstance();
  });

  afterEach(() => {
    WindowsManager.resetInstance();
    vi.useRealTimers();
  });

  it('should be a singleton', () => {
    const instance2 = WindowsManager.getInstance();
    expect(windowsManager).toBe(instance2);
  });

  it('should emit showIcon event when calling show() in onClick mode', async () => {
    const text = 'hello';
    const position = { x: 100, y: 200 };

    await windowsManager.show(text, position);

    expect(WindowsManagerEvents.showIcon).toHaveBeenCalledWith(expect.objectContaining({
      text: text
    }));
  });

  it('should emit showWindow event when calling show() in immediate mode', async () => {
    const text = 'hello';
    const position = { x: 100, y: 200 };

    // Mock settings for immediate mode (show window)
    const settingsManager = (await import('@/shared/managers/SettingsManager.js')).default;
    settingsManager.get.mockImplementation((key, def) => {
      if (key === 'selectionTranslationMode') return 'immediate';
      if (key === 'TRANSLATE_ON_TEXT_SELECTION') return true;
      if (key === 'MOBILE_UI_MODE') return 'auto';
      return def;
    });

    await windowsManager.show(text, position);

    expect(WindowsManagerEvents.showWindow).toHaveBeenCalledWith(expect.objectContaining({
      selectedText: text,
      position: position,
      mode: 'window'
    }));
  });

  it('should emit dismiss events when calling dismiss', async () => {
    // Set some state to make it look like something is visible
    windowsManager.state.isVisible = true;
    windowsManager.state.activeWindowId = 'test-window-123';

    await windowsManager.dismiss();

    expect(WindowsManagerEvents.dismissWindow).toHaveBeenCalledWith('test-window-123', true);
  });

  it('should handle icon click by transitioning to window mode', async () => {
    const payload = {
      id: 'icon-123',
      text: 'hello',
      position: { x: 100, y: 200 }
    };

    // Find the icon click handler that was registered on pageEventBus
    const iconClickHandlerCall = pageEventBus.on.mock.calls.find(call => call[0] === WINDOWS_MANAGER_EVENTS.ICON_CLICKED);
    expect(iconClickHandlerCall).toBeDefined();
    const iconClickHandler = iconClickHandlerCall[1];

    // Trigger icon click
    await iconClickHandler(payload);

    // Transitions use setTimeout, so we need to run timers
    vi.runAllTimers();

    // Should dismiss icon and show window
    expect(WindowsManagerEvents.dismissIcon).toHaveBeenCalledWith(payload.id);
    expect(WindowsManagerEvents.showWindow).toHaveBeenCalled();
  });

  it('should handle selection trigger from Coordinator', async () => {
    const payload = {
      text: 'selected text',
      position: { x: 100, y: 200 },
      triggerMode: 'icon'
    };

    // Find the selection trigger handler
    const triggerHandlerCall = pageEventBus.on.mock.calls.find(call => call[0] === SELECTION_EVENTS.GLOBAL_SELECTION_TRIGGER);
    expect(triggerHandlerCall).toBeDefined();
    const triggerHandler = triggerHandlerCall[1];

    // Spy on windowsManager._showWindow instead of show because triggerHandler calls _showWindow directly
    const showWindowSpy = vi.spyOn(windowsManager, '_showWindow').mockResolvedValue();

    triggerHandler(payload);
    
    expect(showWindowSpy).toHaveBeenCalled();
  });

  it('should handle re-translation request from UI', async () => {
    const payload = {
      id: 'window-123',
      provider: 'bing'
    };

    // Mock state
    windowsManager.state.activeWindowId = payload.id;
    windowsManager.state.originalText = 'hello';

    // Find the change provider handler
    const changeHandlerCall = pageEventBus.on.mock.calls.find(call => call[0] === 'translation-window-change-provider');
    expect(changeHandlerCall).toBeDefined();
    const changeHandler = changeHandlerCall[1];

    await changeHandler(payload);

    expect(windowsManager.state.setProvider).toHaveBeenCalledWith('bing');
    expect(WindowsManagerEvents.updateWindow).toHaveBeenCalledWith(payload.id, expect.objectContaining({
      isLoading: true
    }));
  });

  it('should skip show() in immediate mode if Ctrl is required but not pressed', async () => {
    const text = 'hello';
    const position = { x: 100, y: 200 };

    // Mock settings for immediate mode AND Ctrl requirement
    const settingsManager = (await import('@/shared/managers/SettingsManager.js')).default;
    settingsManager.get.mockImplementation((key, def) => {
      if (key === 'selectionTranslationMode') return 'immediate';
      if (key === 'REQUIRE_CTRL_FOR_TEXT_SELECTION') return true;
      if (key === 'TRANSLATE_ON_TEXT_SELECTION') return true;
      return def;
    });

    // Call show without ctrlPressed option
    await windowsManager.show(text, position, { ctrlPressed: false });

    expect(WindowsManagerEvents.showWindow).not.toHaveBeenCalled();
  });

  it('should proceed with show() in immediate mode if Ctrl is required and pressed', async () => {
    const text = 'hello';
    const position = { x: 100, y: 200 };

    // Mock settings for immediate mode AND Ctrl requirement
    const settingsManager = (await import('@/shared/managers/SettingsManager.js')).default;
    settingsManager.get.mockImplementation((key, def) => {
      if (key === 'selectionTranslationMode') return 'immediate';
      if (key === 'REQUIRE_CTRL_FOR_TEXT_SELECTION') return true;
      if (key === 'TRANSLATE_ON_TEXT_SELECTION') return true;
      return def;
    });

    // Call show WITH ctrlPressed option
    await windowsManager.show(text, position, { ctrlPressed: true });

    expect(WindowsManagerEvents.showWindow).toHaveBeenCalled();
  });

  it('should skip show() if feature is not allowed (excluded or disabled)', async () => {
    const text = 'hello';
    const position = { x: 100, y: 200 };

    // Mock exclusion/permission failure
    const ExclusionChecker = (await import('@/features/exclusion/core/ExclusionChecker.js')).default;
    ExclusionChecker.getInstance().isFeatureAllowed.mockResolvedValue(false);

    await windowsManager.show(text, position);

    expect(WindowsManagerEvents.showIcon).not.toHaveBeenCalled();
    expect(WindowsManagerEvents.showWindow).not.toHaveBeenCalled();
  });
});
