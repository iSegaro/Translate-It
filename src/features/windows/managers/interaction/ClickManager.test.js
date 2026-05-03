import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClickManager } from './ClickManager.js';
import { UI_HOST_IDS } from '@/shared/constants/ui.js';
import { WindowsConfig } from "../core/WindowsConfig.js";
import ElementDetectionService from '@/shared/services/ElementDetectionService.js';

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { WINDOWS: 'WINDOWS' }
}));

vi.mock('../core/WindowsConfig.js', () => ({
  WindowsConfig: {
    IDS: { ICON: 'translation-icon' },
    TIMEOUTS: { PENDING_WINDOW_RESET: 500 }
  }
}));

vi.mock('@/core/memory/ResourceTracker.js', () => {
  return {
    default: class ResourceTracker {
      constructor() {
        this.addEventListener = vi.fn();
        this.removeEventListener = vi.fn();
      }
      cleanup() {}
    }
  };
});

vi.mock('@/shared/services/ElementDetectionService.js', () => ({
  default: {
    isUIElement: vi.fn().mockReturnValue(false),
    getClickedUIElement: vi.fn().mockReturnValue(null),
    getElementType: vi.fn().mockReturnValue('unknown')
  }
}));

vi.mock('@/shared/config/constants.js', () => ({
  UI_HOST_IDS: {
    MAIN: 'translate-it-ui-host',
    IFRAME: 'translate-it-ui-host-iframe'
  }
}));

describe('ClickManager', () => {
  let clickManager;
  let mockCrossFrameManager;
  let mockState;
  let mockHandlers;

  beforeEach(() => {
    vi.useFakeTimers();
    
    mockCrossFrameManager = {
      enableGlobalClickBroadcast: vi.fn(),
      disableGlobalClickBroadcast: vi.fn(),
      requestGlobalClickRelay: vi.fn(),
      isTopFrame: true,
      frameId: 'top'
    };

    mockState = {
      hasActiveElements: false,
      shouldPreventDismissal: false,
      setPendingTranslationWindow: vi.fn()
    };

    mockHandlers = {
      onOutsideClick: vi.fn(),
      onIconClick: vi.fn()
    };

    clickManager = new ClickManager(mockCrossFrameManager, mockState);
    clickManager.setHandlers(mockHandlers);
    
    // Clear DOM before each test
    document.body.innerHTML = '';
    
    // Reset global state
    window.__TRANSLATION_WINDOW_IS_DRAGGING = false;
    window.textSelectionManager = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Outside Click Listener Management', () => {
    it('should add outside click listener and enable broadcasting', () => {
      clickManager.addOutsideClickListener();

      expect(clickManager.addEventListener).toHaveBeenCalledWith(
        document,
        'click',
        expect.any(Function),
        { capture: true }
      );
      expect(mockCrossFrameManager.enableGlobalClickBroadcast).toHaveBeenCalled();
      expect(mockCrossFrameManager.requestGlobalClickRelay).toHaveBeenCalledWith(true);
    });

    it('should remove outside click listener and disable broadcasting if no active elements', () => {
      clickManager.addOutsideClickListener();
      clickManager.removeOutsideClickListener();

      expect(mockCrossFrameManager.disableGlobalClickBroadcast).toHaveBeenCalled();
      expect(mockCrossFrameManager.requestGlobalClickRelay).toHaveBeenCalledWith(false);
    });
  });

  describe('Outside Click Detection Logic', () => {
    it('should NOT dismiss if shouldPreventDismissal is true', () => {
      mockState.shouldPreventDismissal = true;
      const event = new MouseEvent('click');
      
      clickManager._handleOutsideClick(event);
      
      expect(mockHandlers.onOutsideClick).not.toHaveBeenCalled();
    });

    it('should NOT dismiss if dragging text selection', () => {
      window.textSelectionManager = { isDragging: true };
      const event = new MouseEvent('click');
      
      clickManager._handleOutsideClick(event);
      
      expect(mockHandlers.onOutsideClick).not.toHaveBeenCalled();
    });

    it('should NOT dismiss if clicking inside Vue UI Host', () => {
      const host = document.createElement('div');
      host.id = UI_HOST_IDS.MAIN;
      document.body.appendChild(host);
      
      const target = document.createElement('span');
      host.appendChild(target);
      
      const event = { target };
      
      const shouldDismiss = clickManager._shouldDismissOnOutsideClick(event);
      expect(shouldDismiss).toBe(false);
    });

    it('should NOT dismiss if clicking inside Legacy Icon', () => {
      const icon = document.createElement('div');
      icon.id = WindowsConfig.IDS.ICON;
      document.body.appendChild(icon);
      
      const event = { target: icon };
      
      const shouldDismiss = clickManager._shouldDismissOnOutsideClick(event);
      expect(shouldDismiss).toBe(false);
    });

    it('should NOT dismiss if ElementDetectionService says it is a UI element', () => {
      vi.mocked(ElementDetectionService.isUIElement).mockReturnValueOnce(true);
      
      const target = document.createElement('div');
      const event = { target };
      
      const shouldDismiss = clickManager._shouldDismissOnOutsideClick(event);
      expect(shouldDismiss).toBe(false);
    });

    it('should dismiss if clicking outside everything', () => {
      vi.mocked(ElementDetectionService.isUIElement).mockReturnValue(false);
      const target = document.createElement('div');
      document.body.appendChild(target);
      
      const event = { target };
      
      const shouldDismiss = clickManager._shouldDismissOnOutsideClick(event);
      expect(shouldDismiss).toBe(true);
    });

    it('should trigger onOutsideClick handler when it should dismiss', () => {
      // Mock _shouldDismissOnOutsideClick to return true
      vi.spyOn(clickManager, '_shouldDismissOnOutsideClick').mockReturnValue(true);
      
      const event = new MouseEvent('click');
      clickManager._handleOutsideClick(event);
      
      expect(mockHandlers.onOutsideClick).toHaveBeenCalledWith(event);
    });
  });

  describe('Icon Click Handling', () => {
    it('should setup icon click handler', () => {
      const icon = document.createElement('div');
      clickManager.setupIconClickHandler(icon);
      
      expect(clickManager.addEventListener).toHaveBeenCalledWith(
        icon,
        'click',
        expect.any(Function)
      );
    });

    it('should handle icon click and transition state', () => {
      const context = { text: 'test', position: { x: 10, y: 20 } };
      
      const result = clickManager.handleIconClick(context);
      
      expect(mockState.setPendingTranslationWindow).toHaveBeenCalledWith(true);
      expect(result).toEqual(context);
    });

    it('should complete icon transition after timeout', () => {
      clickManager.completeIconTransition();
      
      expect(mockState.setPendingTranslationWindow).not.toHaveBeenCalledWith(false);
      
      vi.advanceTimersByTime(WindowsConfig.TIMEOUTS.PENDING_WINDOW_RESET);
      
      expect(mockState.setPendingTranslationWindow).toHaveBeenCalledWith(false);
    });
  });

  describe('Utility methods', () => {
    it('should correctly identify if click is inside element', () => {
      const parent = document.createElement('div');
      const child = document.createElement('span');
      parent.appendChild(child);
      
      const event = { target: child };
      expect(clickManager.isClickInsideElement(event, parent)).toBe(true);
      
      const other = document.createElement('div');
      expect(clickManager.isClickInsideElement(event, other)).toBe(false);
    });

    it('should get click coordinates', () => {
      const event = {
        clientX: 100,
        clientY: 200,
        pageX: 150,
        pageY: 250
      };
      
      const coords = clickManager.getClickCoordinates(event);
      expect(coords).toEqual({
        x: 100,
        y: 200,
        pageX: 150,
        pageY: 250
      });
    });

    it('should setup double click handler', () => {
      const element = document.createElement('div');
      const handler = vi.fn();
      clickManager.setupDoubleClickHandler(element, handler);
      
      expect(clickManager.addEventListener).toHaveBeenCalledWith(
        element,
        'dblclick',
        expect.any(Function)
      );
    });

    it('should add element click listener with wrapping', () => {
      const element = document.createElement('div');
      const handler = vi.fn();
      clickManager.addElementClickListener(element, handler);
      
      expect(clickManager.addEventListener).toHaveBeenCalledWith(
        element,
        'click',
        expect.any(Function),
        {}
      );
    });

    it('should prevent event propagation', () => {
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      };
      clickManager.stopPropagation(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('should identify click on UI element using ElementDetectionService', () => {
      const event = { target: {} };
      const uiElement = { type: 'window', element: {} };
      vi.mocked(ElementDetectionService.getClickedUIElement).mockReturnValue(uiElement);
      
      const result = clickManager.isClickOnUIElement(event);
      expect(result).toBe(uiElement);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all listeners and handlers', () => {
      clickManager.cleanup();
      
      expect(clickManager.onOutsideClick).toBeNull();
      expect(clickManager.onIconClick).toBeNull();
      expect(mockCrossFrameManager.disableGlobalClickBroadcast).toHaveBeenCalled();
    });
  });
});
