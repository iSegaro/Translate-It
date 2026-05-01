import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create stable objects for mocks
const { eventListeners, mockWindowsManagerEvents, mockPageEventBus } = vi.hoisted(() => {
  const listeners = {};
  return {
    eventListeners: listeners,
    mockWindowsManagerEvents: {
      showWindow: vi.fn(),
      showIcon: vi.fn(),
      updateWindow: vi.fn(),
      dismissWindow: vi.fn(),
      dismissIcon: vi.fn(),
      showMobileSheet: vi.fn(),
      iconClicked: vi.fn()
    },
    mockPageEventBus: {
      on: vi.fn((event, cb) => {
        listeners[event] = cb;
      }),
      off: vi.fn((event) => {
      }),
      emit: vi.fn(async (event, data) => {
        if (listeners[event]) {
          const res = listeners[event](data);
          if (res instanceof Promise) await res;
        }
      })
    }
  };
});

// Mock ALL dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), operation: vi.fn(), debugLazy: vi.fn()
  }))
}));

vi.mock('@/features/windows/managers/core/WindowsConfig.js', () => ({ 
  WindowsConfig: {
    TIMEOUTS: { OUTSIDE_CLICK_DELAY: 1, PENDING_WINDOW_RESET: 1, ICON_CLEANUP: 1, TRANSLATION_TIMEOUT: 1000 },
    ANIMATION: { FADE_OUT_DURATION: 1 }
  } 
}));

vi.mock('@/features/windows/managers/core/WindowsState.js', () => ({ 
  WindowsState: vi.fn().mockImplementation(function() {
    this.isVisible = false;
    this.isIconMode = false;
    this.reset = vi.fn(() => {
      this.isVisible = false;
      this.isIconMode = false;
    });
    this.setVisible = vi.fn((v) => { this.isVisible = v; });
    this.setIconMode = vi.fn((v) => { this.isIconMode = v; });
    this.setOriginalText = vi.fn();
    this.setProvider = vi.fn();
    this.setActiveWindowId = vi.fn();
    this.setProcessing = vi.fn();
    this.clearIconClickContext = vi.fn();
    this.setIconClickContext = vi.fn();
    this.setTranslationCancelled = vi.fn();
    this.setRequestingFrameId = vi.fn();
    this.hasActiveElements = true;
    this.iconClickContext = { iconId: 'test-icon' };
    return this;
  })
}));

vi.mock('@/features/windows/managers/crossframe/CrossFrameManager.js', () => ({ 
  CrossFrameManager: vi.fn().mockImplementation(function() {
    this.frameId = 'test-frame';
    this.setEventHandlers = vi.fn();
    this.messageRouter = { _broadcastToAllIframes: vi.fn() };
    this.isTopFrame = true;
    this.notifyWindowCreated = vi.fn();
    this.getIframeByFrameId = vi.fn().mockReturnValue(null);
    return this;
  })
}));

vi.mock('@/features/windows/managers/translation/TranslationHandler.js', () => ({ 
  TranslationHandler: vi.fn().mockImplementation(function() {
    this.performTranslation = vi.fn().mockResolvedValue({ 
      translatedText: 'translated content', sourceLanguage: 'en', targetLanguage: 'fa', provider: 'google_v2'
    });
    this.getEffectiveProvider = vi.fn().mockReturnValue('google_v2');
    this.cancelAllTranslations = vi.fn();
    return this;
  }) 
}));

vi.mock('@/features/windows/managers/interaction/ClickManager.js', () => ({ 
  ClickManager: vi.fn().mockImplementation(function() {
    this.setHandlers = vi.fn();
    this.addOutsideClickListener = vi.fn();
    this.cleanup = vi.fn();
    this.handleIconClick = vi.fn().mockReturnValue({ text: 'h', position: {x:0, y:0}, iconId: 'i' });
    this.completeIconTransition = vi.fn();
    return this;
  }) 
}));

vi.mock('@/features/windows/managers/theme/ThemeManager.js', () => ({ 
  ThemeManager: vi.fn().mockImplementation(function() {
    this.initialize = vi.fn().mockResolvedValue();
    this.getCurrentTheme = vi.fn().mockResolvedValue('light');
    this.cleanup = vi.fn();
    return this;
  }) 
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({ 
  default: { 
    get: vi.fn((key, def) => def),
    onSettingsChanged: vi.fn() 
  } 
}));

vi.mock('@/shared/config/config.js', () => ({ 
  state: {}, 
  SelectionTranslationMode: { IMMEDIATE: 'immediate', ON_FAB_CLICK: 'onFabClick', ON_CLICK: 'onClick' },
  TranslationMode: { Selection: 'selection', Dictionary: 'dictionary' }
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({ 
  ErrorHandler: { 
    getInstance: vi.fn(() => ({ 
      getErrorForUI: vi.fn().mockResolvedValue({ message: 'Mock Error', canRetry: true }),
      handle: vi.fn().mockResolvedValue()
    })) 
  } 
}));

vi.mock('@/shared/error-management/ErrorTypes.js', () => ({ 
  ErrorTypes: { API_ERROR: 'api-error', USER_CANCELLED: 'user-cancelled' } 
}));

vi.mock('@/core/extensionContext.js', () => ({ 
  default: { isValidSync: vi.fn().mockReturnValue(true), isContextError: vi.fn().mockReturnValue(false) } 
}));

vi.mock('@/core/PageEventBus.js', () => ({
  WINDOWS_MANAGER_EVENTS: {
    SHOW_WINDOW: 'sw', UPDATE_WINDOW: 'uw', SHOW_ICON: 'si',
    DISMISS_WINDOW: 'dw', DISMISS_ICON: 'di', ICON_CLICKED: 'ic',
    SHOW_MOBILE_SHEET: 'sms', DISMISS_MOBILE_SHEET: 'dms'
  },
  WindowsManagerEvents: mockWindowsManagerEvents,
  pageEventBus: mockPageEventBus
}));

vi.mock('@/features/text-selection/events/SelectionEvents.js', () => ({ 
  SELECTION_EVENTS: { 
    GLOBAL_SELECTION_TRIGGER: 'gst',
    GLOBAL_SELECTION_CHANGE: 'gsc',
    GLOBAL_SELECTION_CLEAR: 'gsl'
  } 
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class {
    constructor() { this.addEventListener = vi.fn(); }
    cleanup() {}
    destroy() {}
  }
}));

vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  default: { getInstance: vi.fn(() => ({ isFeatureAllowed: vi.fn().mockResolvedValue(true) })) }
}));

vi.mock('@/utils/browser/compatibility.js', () => ({ 
  deviceDetector: { shouldEnableMobileUI: vi.fn().mockReturnValue(false) } 
}));

vi.mock('@/shared/constants/ui.js', () => ({ UI_HOST_IDS: { MAIN: 'm', IFRAME: 'i' } }));
vi.mock('@/shared/constants/translation.js', () => ({ TRANSLATION_HTML: { ICON_ID: 'i', WINDOW_CLASS: 'w' } }));
vi.mock('@/shared/constants/mobile.js', () => ({ MOBILE_CONSTANTS: { UI_MODE: { AUTO: 'a', MOBILE: 'm', DESKTOP: 'd' }, VIEWS: { SELECTION: 's' }, SHEET_STATE: { PEEK: 'p' } } }));

vi.mock('@/features/tts/TTSFactory.js', () => {
  const tts = { speak: vi.fn().mockResolvedValue(), stop: vi.fn().mockResolvedValue(), stopAll: vi.fn().mockResolvedValue() };
  return { TTSFactory: { getTTSSmart: vi.fn().mockResolvedValue(() => tts), getTTSGlobal: vi.fn().mockResolvedValue({ TTSGlobalManager: {} }), _getInstance: () => tts } };
});

import { WindowsManager } from './WindowsManager.js';
import { SELECTION_EVENTS } from '@/features/text-selection/events/SelectionEvents.js';
import settingsManager from '@/shared/managers/SettingsManager.js';

describe('WindowsManager', () => {
  let windowsManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    WindowsManager.resetInstance();
    windowsManager = WindowsManager.getInstance();
    windowsManager.positionCalculator = { calculateAdjustedPositionForIframe: vi.fn((pos) => pos) };
  });

  afterEach(() => {
    WindowsManager.resetInstance();
    vi.useRealTimers();
  });

  it('should be a singleton', () => {
    expect(windowsManager).toBe(WindowsManager.getInstance());
  });

  describe('Selection Handling', () => {
    it('should emit showIcon event in onClick mode', async () => {
      vi.mocked(settingsManager.get).mockImplementation((key, def) => {
        if (key === 'selectionTranslationMode') return 'onClick';
        return def;
      });
      await windowsManager.show('hello', { x: 1, y: 1 });
      expect(mockWindowsManagerEvents.showIcon).toHaveBeenCalled();
    });

    it('should handle GLOBAL_SELECTION_CHANGE', async () => {
      vi.mocked(settingsManager.get).mockImplementation((key, def) => {
        if (key === 'selectionTranslationMode') return 'onClick';
        if (key === 'TRANSLATE_ON_TEXT_SELECTION') return true;
        return def;
      });
      
      await mockPageEventBus.emit(SELECTION_EVENTS.GLOBAL_SELECTION_CHANGE, { text: 'new', position: {x:1, y:1} });
      await vi.runAllTimersAsync();
      
      expect(mockWindowsManagerEvents.showIcon).toHaveBeenCalled();
    });

    it('should handle GLOBAL_SELECTION_CLEAR', async () => {
      // Use isIconMode which also triggers dismissal
      windowsManager.state.isIconMode = true;
      
      await mockPageEventBus.emit(SELECTION_EVENTS.GLOBAL_SELECTION_CLEAR);
      await vi.runAllTimersAsync();
      
      expect(mockWindowsManagerEvents.dismissIcon).toHaveBeenCalled();
    });
  });

  describe('Translation Flow', () => {
    it('should perform two-phase loading', async () => {
      const promise = windowsManager._showWindow('text', {x:1, y:1});
      expect(mockWindowsManagerEvents.showWindow).toHaveBeenCalledWith(expect.objectContaining({ isLoading: true }));
      await promise;
      expect(mockWindowsManagerEvents.updateWindow).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ isLoading: false, initialTranslatedText: 'translated content' }));
    });
  });

  describe('Mobile', () => {
    it('should show mobile sheet', async () => {
      const { deviceDetector } = await import('@/utils/browser/compatibility.js');
      vi.mocked(deviceDetector.shouldEnableMobileUI).mockReturnValue(true);
      
      await windowsManager.show('mob', {x:0, y:0});
      expect(mockWindowsManagerEvents.showMobileSheet).toHaveBeenCalled();
    });
  });

  describe('TTS', () => {
    it('should handle speak request', async () => {
      await mockPageEventBus.emit('translation-window-speak', { text: 'hi', language: 'en', isSpeaking: true });
      const { TTSFactory } = await import('@/features/tts/TTSFactory.js');
      expect(TTSFactory._getInstance().speak).toHaveBeenCalledWith('hi', 'en');
    });
  });

  describe('Cross-Frame', () => {
    it('should handle window request', async () => {
      await windowsManager._handleWindowCreationRequest({ selectedText: 'if', position: {x:0,y:0}, frameId: 'f1' });
      expect(mockWindowsManagerEvents.showWindow).toHaveBeenCalled();
    });
  });
});
