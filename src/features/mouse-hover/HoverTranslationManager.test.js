import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HoverTranslationManager } from './HoverTranslationManager.js';
import { HoverTextDetector } from './HoverTextDetector.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { contentScriptIntegration, registerTranslation } from '@/shared/messaging/core/ContentScriptIntegration.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getErrorMessage } from '@/shared/error-management/ErrorMessages.js';
import { mapCanonicalTranslationError } from '@/shared/error-management/PublicTranslationErrorPolicy.js';
import { createLegacyDisplayError } from '@/shared/error-management/PublicTranslationErrorAdapter.js';
import browser from 'webextension-polyfill';

const { mockErrorHandler } = vi.hoisted(() => ({
  mockErrorHandler: {
    handle: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

vi.mock('./HoverTextDetector.js', () => ({
  HoverTextDetector: {
    detect: vi.fn()
  }
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    get: vi.fn((key, def) => def)
  }
}));

vi.mock('@/shared/messaging/core/ContentScriptIntegration.js', () => ({
  contentScriptIntegration: {
    sendTranslationRequest: vi.fn(),
    cancelTranslationRequest: vi.fn()
  },
  registerTranslation: vi.fn()
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => mockErrorHandler)
  }
}));

vi.mock('@/shared/services/ElementDetectionService.js', () => ({
  ElementDetectionService: {
    getInstance: vi.fn(() => ({
      isUIElement: vi.fn(() => false)
    }))
  }
}));

vi.mock('@/core/helpers.js', () => ({
  isEditable: vi.fn(() => false)
}));

import { isEditable } from '@/core/helpers.js';

const keyEvent = (key, options = {}) => ({
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  repeat: false,
  ...options
});

describe('HoverTranslationManager', () => {
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockErrorHandler.handle.mockClear();
    isEditable.mockReset();
    isEditable.mockReturnValue(false);
    vi.useFakeTimers();
    manager = new HoverTranslationManager();
    
    // Set default setting mocks
    settingsManager.get.mockImplementation((key, def) => {
      if (key === 'MOUSE_HOVER_AUTO_CLOSE') return 'mouseleave';
      if (key === 'MOUSE_HOVER_TRIGGER') return 'primary';
      if (key === 'MOUSE_HOVER_DELAY') return 300;
      return def;
    });
  });

  afterEach(() => {
    manager.cleanup();
    vi.useRealTimers();
  });

  it('should activate and add event listeners', async () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    await manager.activate();
    
    expect(manager.isActive).toBe(true);
    expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function), expect.any(Object));
    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), expect.any(Object));
  });

  it('should deactivate and cleanup', async () => {
    await manager.activate();
    manager.displayedHoverId = 'displayed-id';
    const cleanupSpy = vi.spyOn(manager, 'cleanup');
    const emitSpy = vi.spyOn(pageEventBus, 'emit');
    
    await manager.deactivate();
    
    expect(manager.isActive).toBe(false);
    expect(cleanupSpy).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith('MOUSE_HOVER_HIDE_TOOLTIP', { hoverId: 'displayed-id', frameId: 0 });
  });

  it('clears transient hover state before deactivation and allows a fresh hover after reactivation', async () => {
    await manager.activate();
    const element = document.createElement('div');
    element.classList.add('ti-hover-container-highlight');
    manager.currentText = 'old text';
    manager.currentElement = element;
    manager.currentRect = { top: 0, left: 0, bottom: 100, right: 100 };
    manager.borderedElement = element;
    manager.currentMessageId = 'old-request';
    manager.lastPosition = { x: 100, y: 100 };
    manager.lastMouseEvent = { target: element };
    manager.hoverTimer = manager.setTimeout(vi.fn(), 1000);

    await manager.deactivate();

    expect(manager.currentText).toBeNull();
    expect(manager.currentElement).toBeNull();
    expect(manager.currentRect).toBeNull();
    expect(manager.borderedElement).toBeNull();
    expect(manager.hoverTimer).toBeNull();
    expect(manager.currentMessageId).toBeNull();
    expect(manager.lastMouseEvent).toBeNull();
    expect(manager.lastPosition).toEqual({ x: 0, y: 0 });
    expect(element.classList.contains('ti-hover-container-highlight')).toBe(false);

    await manager.activate();
    settingsManager.get.mockImplementation((key, def) => {
      if (key === 'MOUSE_HOVER_TRIGGER') return 'hover';
      if (key === 'MOUSE_HOVER_DELAY') return 300;
      return def;
    });
    manager.handleMouseMove({ clientX: 100, clientY: 100, target: document.body });
    vi.advanceTimersByTime(300);

    expect(HoverTextDetector.detect).toHaveBeenCalledWith(100, 100, 'sentence');
  });

  it('hides both a pending replacement source and its previously displayed tooltip on exit', async () => {
    await manager.activate();
    manager.currentText = 'source B';
    manager.activeHoverId = 'hover-b';
    manager.currentMessageId = 'request-b';
    manager.displayedHoverId = 'hover-a';
    manager.displayedFrameId = 0;
    const emitSpy = vi.spyOn(pageEventBus, 'emit');

    manager.handleMouseLeave();
    vi.advanceTimersByTime(350);

    expect(emitSpy).toHaveBeenCalledWith('MOUSE_HOVER_HIDE_TOOLTIP', { hoverId: 'hover-b', frameId: 0 });
    expect(emitSpy).toHaveBeenCalledWith('MOUSE_HOVER_HIDE_TOOLTIP', { hoverId: 'hover-a', frameId: 0 });
    expect(emitSpy.mock.calls.filter(([type]) => type === 'MOUSE_HOVER_HIDE_TOOLTIP')).toHaveLength(2);
    expect(contentScriptIntegration.cancelTranslationRequest).toHaveBeenCalledWith('request-b', expect.any(String));
  });

  it.each([false, true])('deactivation hides distinct active and displayed ids (iframe=%s)', async (iframe) => {
    const originalTop = Object.getOwnPropertyDescriptor(window, 'top');
    const sendMessage = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue(undefined);
    if (iframe) Object.defineProperty(window, 'top', { configurable: true, value: {} });
    await manager.activate();
    manager.activeHoverId = 'pending-b';
    manager.displayedHoverId = 'displayed-a';
    manager.displayedFrameId = 0;
    const emitSpy = vi.spyOn(pageEventBus, 'emit');

    await manager.deactivate();

    const hides = emitSpy.mock.calls.filter(([type]) => type === 'MOUSE_HOVER_HIDE_TOOLTIP');
    expect(hides).toEqual([
      ['MOUSE_HOVER_HIDE_TOOLTIP', { hoverId: 'pending-b', frameId: 0 }],
      ['MOUSE_HOVER_HIDE_TOOLTIP', { hoverId: 'displayed-a', frameId: 0 }]
    ]);
    if (iframe) {
      expect(sendMessage.mock.calls.map(([message]) => message.data)).toEqual([
        { type: 'MOUSE_HOVER_HIDE_TOOLTIP', detail: { hoverId: 'pending-b', frameId: 0 } },
        { type: 'MOUSE_HOVER_HIDE_TOOLTIP', detail: { hoverId: 'displayed-a', frameId: 0 } }
      ]);
    }
    if (iframe) Object.defineProperty(window, 'top', originalTop);
    sendMessage.mockRestore();
  });

  it('keeps source ownership until a new hover detection accepts its element', async () => {
    manager.activeHoverId = 'hover-a';
    const sourceElement = document.createElement('p');
    manager.currentElement = sourceElement;
    manager.currentRect = { top: 0, left: 0, bottom: 20, right: 20 };
    settingsManager.get.mockImplementation((key, def) => key === 'MOUSE_HOVER_TRIGGER' ? 'hover' : def);

    manager.handleMouseMove({ clientX: 100, clientY: 100, target: document.body });

    expect(manager.currentElement).toBe(sourceElement);
  });

  it('applies translation-hide ownership filtering and hides both associated tokens', () => {
    const sourceElement = document.createElement('p');
    const unrelatedElement = document.createElement('p');
    manager.currentText = 'source B';
    manager.currentElement = sourceElement;
    manager.activeHoverId = 'hover-b';
    manager.displayedHoverId = 'hover-a';
    const emitSpy = vi.spyOn(pageEventBus, 'emit');

    manager.handleTranslationHide({ element: unrelatedElement });
    expect(emitSpy).not.toHaveBeenCalledWith('MOUSE_HOVER_HIDE_TOOLTIP', expect.anything());
    expect(manager.currentElement).toBe(sourceElement);

    manager.handleTranslationHide({ element: sourceElement });
    expect(emitSpy).toHaveBeenCalledWith('MOUSE_HOVER_HIDE_TOOLTIP', { hoverId: 'hover-b', frameId: 0 });
    expect(emitSpy).toHaveBeenCalledWith('MOUSE_HOVER_HIDE_TOOLTIP', { hoverId: 'hover-a', frameId: 0 });
  });

  describe('handleMouseMove', () => {
    it('should debounce detection', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return 'hover';
        if (key === 'MOUSE_HOVER_DELAY') return 300;
        return def;
      });
      
      const event = { clientX: 10, clientY: 10, target: document.body };
      manager.handleMouseMove(event);

      expect(HoverTextDetector.detect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(301);
      expect(HoverTextDetector.detect).toHaveBeenCalled();
    });

    it('should skip detection if mouse is inside rectangle cache', async () => {
      await manager.activate();
      manager.currentRect = { top: 0, left: 0, bottom: 100, right: 100 };
      manager.lastPosition = { x: 50, y: 50 };

      // Move slightly but still inside rect
      const event = { clientX: 60, clientY: 60, target: document.body, ctrlKey: true };
      manager.handleMouseMove(event);

      vi.advanceTimersByTime(400);
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });

    it('should cancel pending hover if mouse moves away before delay', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return 'hover';
        if (key === 'MOUSE_HOVER_DELAY') return 300;
        return def;
      });
      
      // First move
      manager.handleMouseMove({ clientX: 10, clientY: 10, target: document.body });
      vi.advanceTimersByTime(200);
      
      // Second move (cancels first)
      manager.handleMouseMove({ clientX: 100, clientY: 100, target: document.body });
      
      vi.advanceTimersByTime(200); // Only 200ms since 2nd move
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(101); // Now 301ms since 2nd move
      expect(HoverTextDetector.detect).toHaveBeenCalledTimes(1);
    });

    it('should not schedule translation from mousemove in modifier mode', async () => {
      await manager.activate();
      manager.handleMouseMove({ clientX: 10, clientY: 10, target: document.body, ctrlKey: true });
      manager.handleMouseMove({ clientX: 50, clientY: 50, target: document.body, ctrlKey: true });
      vi.advanceTimersByTime(600);

      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });

    it('keeps latest mouse event for modifier release', async () => {
      await manager.activate();
      manager.handleMouseMove({ clientX: 10, clientY: 10, target: document.body });
      manager.handleKeyDown(keyEvent('Control', { ctrlKey: true }));
      manager.handleMouseMove({ clientX: 50, clientY: 50, target: document.body, ctrlKey: true });
      manager.handleKeyUp(keyEvent('Control'));

      vi.advanceTimersByTime(50);

      expect(HoverTextDetector.detect).toHaveBeenCalledWith(50, 50, 'sentence');
    });

    it('does not invalidate pending modifier gesture on mouse movement', async () => {
      await manager.activate();
      manager.handleKeyDown(keyEvent('Control', { ctrlKey: true }));
      manager.handleMouseMove({ clientX: 20, clientY: 20, target: document.body, ctrlKey: true });
      manager.handleKeyUp(keyEvent('Control'));

      vi.advanceTimersByTime(50);

      expect(HoverTextDetector.detect).toHaveBeenCalled();
    });

    it('should skip detection if target is editable', async () => {
      await manager.activate();
      isEditable.mockReturnValue(true);

      const event = { clientX: 10, clientY: 10, target: document.createElement('input'), ctrlKey: true };
      manager.handleMouseMove(event);

      vi.advanceTimersByTime(400);
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });
  });

  describe('handleKeyDown', () => {
    it('should not trigger translation before modifier release', async () => {
      await manager.activate();

      manager.lastMouseEvent = { clientX: 10, clientY: 10, target: document.body };
      
      manager.handleKeyDown(keyEvent('Control', { ctrlKey: true }));
      
      vi.advanceTimersByTime(60);
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });

    it.each(['primary', 'control'])('should trigger exactly once on standalone %s release', async (trigger) => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return trigger;
        return def;
      });
      manager.lastMouseEvent = { clientX: 10, clientY: 10, target: document.body };

      manager.handleKeyDown(keyEvent('Control', { ctrlKey: true }));
      manager.handleKeyUp(keyEvent('Control'));
      manager.handleKeyUp(keyEvent('Control'));

      vi.advanceTimersByTime(50);
      expect(HoverTextDetector.detect).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['A', 'primary'],
      ['C', 'primary'],
      ['A', 'shift']
    ])('should not translate %s shortcut with %s trigger', async (key, trigger) => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return trigger;
        return def;
      });

      manager.lastMouseEvent = { clientX: 10, clientY: 10, target: document.body };

      const modifier = trigger === 'primary' ? 'Control' : 'Shift';
      manager.handleKeyDown(keyEvent(modifier, {
        ctrlKey: trigger === 'primary',
        shiftKey: trigger === 'shift'
      }));
      manager.handleKeyDown(keyEvent(key, {
        ctrlKey: trigger === 'primary',
        shiftKey: trigger === 'shift'
      }));
      manager.handleKeyUp(keyEvent(modifier));

      vi.advanceTimersByTime(60);
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });

    it('should not translate Ctrl+Shift', async () => {
      await manager.activate();
      manager.lastMouseEvent = { clientX: 10, clientY: 10, target: document.body };

      manager.handleKeyDown(keyEvent('Control', { ctrlKey: true }));
      manager.handleKeyDown(keyEvent('Shift', { ctrlKey: true, shiftKey: true }));
      manager.handleKeyUp(keyEvent('Control'));

      vi.advanceTimersByTime(60);
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });

    it('should translate standalone Alt release', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return 'alt';
        return def;
      });
      manager.lastMouseEvent = { clientX: 10, clientY: 10, target: document.body };

      manager.handleKeyDown(keyEvent('Alt', { altKey: true }));
      manager.handleKeyUp(keyEvent('Alt'));
      vi.advanceTimersByTime(50);

      expect(HoverTextDetector.detect).toHaveBeenCalledTimes(1);
    });

    it('should ignore modifier auto-repeat', async () => {
      await manager.activate();
      manager.lastMouseEvent = { clientX: 10, clientY: 10, target: document.body };

      manager.handleKeyDown(keyEvent('Control', { ctrlKey: true }));
      manager.handleKeyDown(keyEvent('Control', { ctrlKey: true, repeat: true }));
      manager.handleKeyUp(keyEvent('Control'));
      manager.handleKeyUp(keyEvent('Control'));
      vi.advanceTimersByTime(50);

      expect(HoverTextDetector.detect).toHaveBeenCalledTimes(1);
    });

    it('should not translate while editable target is focused', async () => {
      await manager.activate();
      isEditable.mockReturnValue(true);
      manager.lastMouseEvent = { clientX: 10, clientY: 10, target: document.body };

      manager.handleKeyDown(keyEvent('Control', { ctrlKey: true }));
      manager.handleKeyUp(keyEvent('Control'));
      vi.advanceTimersByTime(50);

      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });
  });

  describe('modifier gesture lifecycle', () => {
    beforeEach(async () => {
      await manager.activate();
      manager.lastMouseEvent = { clientX: 10, clientY: 10, target: document.body };
    });

    it.each([
      ['pointer', () => manager.handlePointerDown({})],
      ['wheel', () => manager.handleWheel({})]
    ])('cancels pending gesture on %s interaction', async (_name, interact) => {
      manager.handleKeyDown(keyEvent('Control', { ctrlKey: true }));
      interact();
      manager.handleKeyUp(keyEvent('Control'));
      vi.advanceTimersByTime(50);

      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });

    it('cancels pending gesture on window blur', async () => {
      manager.handleKeyDown(keyEvent('Control', { ctrlKey: true }));
      manager.handleWindowBlur();
      manager.handleKeyUp(keyEvent('Control'));
      vi.advanceTimersByTime(50);

      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });

    it('cancels pending gesture when document becomes hidden', async () => {
      const hidden = Object.getOwnPropertyDescriptor(document, 'hidden');
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      try {
        manager.handleKeyDown(keyEvent('Control', { ctrlKey: true }));
        manager.handleVisibilityChange();
        manager.handleKeyUp(keyEvent('Control'));
        vi.advanceTimersByTime(50);

        expect(HoverTextDetector.detect).not.toHaveBeenCalled();
      } finally {
        if (hidden) {
          Object.defineProperty(document, 'hidden', hidden);
        } else {
          delete document.hidden;
        }
      }
    });

    it('clears pending gesture on deactivation', async () => {
      manager.handleKeyDown(keyEvent('Control', { ctrlKey: true }));
      await manager.deactivate();

      expect(manager.modifierTriggerController.state).toBe('IDLE');
    });

    it('does not trigger explicit Control mode from Meta', async () => {
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return 'control';
        return def;
      });

      manager.handleKeyDown(keyEvent('Meta', { metaKey: true }));
      manager.handleKeyUp(keyEvent('Meta'));
      vi.advanceTimersByTime(50);

      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });
  });

  describe('handleMouseLeave', () => {
    it('should cancel translation request and clear currentMessageId on real mouseleave', async () => {
      await manager.activate();
      manager.currentMessageId = 'test-id-123';

      manager.handleMouseLeave();
      vi.advanceTimersByTime(350);

      expect(contentScriptIntegration.cancelTranslationRequest).toHaveBeenCalledWith('test-id-123', expect.any(String));
      expect(manager.currentMessageId).toBeNull();
    });

    it('keeps a tooltip hover through the grace period and dismisses once after pointer exit', async () => {
      await manager.activate();
      manager.currentText = 'text';
      manager.activeHoverId = 'hover-a';
      manager.currentMessageId = 'request-a';

      manager.handleMouseLeave();
      pageEventBus.emit('MOUSE_HOVER_TOOLTIP_POINTER_ENTER', { hoverId: 'hover-a', frameId: 0 });
      vi.advanceTimersByTime(400);
      expect(manager.currentText).toBe('text');

      pageEventBus.emit('MOUSE_HOVER_TOOLTIP_POINTER_LEAVE', { hoverId: 'hover-a', frameId: 0 });
      vi.advanceTimersByTime(349);
      expect(manager.currentText).toBe('text');
      vi.advanceTimersByTime(1);
      expect(manager.currentText).toBeNull();
      expect(contentScriptIntegration.cancelTranslationRequest).toHaveBeenCalledWith('request-a', expect.any(String));
    });

    it('ignores pointer signals and hidden acknowledgements for another hover token', async () => {
      await manager.activate();
      manager.currentText = 'current';
      manager.activeHoverId = 'current-token';
      manager.handleTooltipPointerLeave({ hoverId: 'stale-token' });
      manager.handleTooltipHidden({ hoverId: 'stale-token' });
      vi.advanceTimersByTime(500);
      expect(manager.currentText).toBe('current');
    });

    it('closes after continuous movement over unrelated content without extending the grace', async () => {
      await manager.activate();
      manager.currentText = 'active';
      manager.activeHoverId = 'hover-continuous';
      manager.currentRect = { top: 0, left: 0, bottom: 20, right: 20 };
      manager.handleMouseMove({ clientX: 100, clientY: 100, target: document.body });
      vi.advanceTimersByTime(200);
      manager.handleMouseMove({ clientX: 120, clientY: 120, target: document.body });
      vi.advanceTimersByTime(150);

      expect(manager.currentText).toBeNull();
      expect(pageEventBus.emit).toHaveBeenCalledWith('MOUSE_HOVER_HIDE_TOOLTIP', {
        hoverId: 'hover-continuous', frameId: 0
      });
    });

    it('does not cancel an in-flight request when document mousemove is over the tooltip', async () => {
      await manager.activate();
      manager.currentText = 'active';
      manager.activeHoverId = 'hover-tooltip';
      manager.currentMessageId = 'request-tooltip';
      manager.currentRect = { top: 0, left: 0, bottom: 20, right: 20 };
      const tooltip = document.createElement('div');
      tooltip.className = 'ti-mouse-hover-tooltip';

      manager.handleMouseMove({ clientX: 100, clientY: 100, target: tooltip, composedPath: () => [tooltip] });
      vi.advanceTimersByTime(500);

      expect(manager.currentMessageId).toBe('request-tooltip');
      expect(contentScriptIntegration.cancelTranslationRequest).not.toHaveBeenCalled();
      expect(manager.currentText).toBe('active');
    });

    it('cleans manager state on timer-mode source leave without hiding the tooltip', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => key === 'MOUSE_HOVER_AUTO_CLOSE' ? 'timer' : def);
      manager.currentText = 'active';
      manager.activeHoverId = 'hover-timer';
      manager.currentMessageId = 'request-timer';
      const emitSpy = vi.spyOn(pageEventBus, 'emit');

      manager.handleMouseLeave();

      expect(manager.currentMessageId).toBeNull();
      expect(contentScriptIntegration.cancelTranslationRequest).toHaveBeenCalledWith('request-timer', expect.any(String));
      expect(emitSpy).not.toHaveBeenCalledWith('MOUSE_HOVER_HIDE_TOOLTIP', expect.anything());
    });

    it('cancels tooltip grace on source reentry after tooltip pointer exit', async () => {
      await manager.activate();
      manager.currentText = 'active';
      manager.activeHoverId = 'hover-return';
      manager.currentRect = { top: 0, left: 0, bottom: 20, right: 20 };
      manager.handleTooltipPointerLeave({ hoverId: 'hover-return' });
      manager.handleMouseMove({ clientX: 10, clientY: 10, target: document.body });
      vi.advanceTimersByTime(400);

      expect(manager.currentText).toBe('active');
    });

    it.each([['hover', 'word'], ['primary', 'container']])(
      'applies bounded exits for %s trigger in %s scope', async (trigger, scope) => {
        await manager.activate();
        settingsManager.get.mockImplementation((key, def) => {
          if (key === 'MOUSE_HOVER_TRIGGER') return trigger;
          if (key === 'MOUSE_HOVER_SCOPE') return scope;
          return def;
        });
        manager.currentText = 'active';
        manager.activeHoverId = `hover-${trigger}-${scope}`;

        manager.handleMouseLeave();
        vi.advanceTimersByTime(350);

        expect(manager.currentText).toBeNull();
      }
    );

    it('ignores delayed tooltip-leave feedback after source reentry', async () => {
      await manager.activate();
      manager.currentText = 'active';
      manager.activeHoverId = 'hover-reentry-feedback';
      manager.currentRect = { top: 0, left: 0, bottom: 20, right: 20 };
      manager.handleTooltipPointerEnter({ hoverId: manager.activeHoverId });
      manager.handleMouseMove({ clientX: 10, clientY: 10, target: document.body });
      manager.handleTooltipPointerLeave({ hoverId: manager.activeHoverId });
      vi.advanceTimersByTime(400);

      expect(manager.currentText).toBe('active');
    });

    it('treats tooltip-to-unrelated mousemove as an exit despite cached pointer state', async () => {
      await manager.activate();
      manager.currentText = 'active';
      manager.activeHoverId = 'hover-tooltip-to-page';
      manager.currentRect = { top: 0, left: 0, bottom: 20, right: 20 };
      manager.handleTooltipPointerEnter({ hoverId: manager.activeHoverId });
      manager.handleMouseMove({ clientX: 100, clientY: 100, target: document.body });
      expect(manager.exitTimer).not.toBeNull();
      vi.advanceTimersByTime(350);
      expect(manager.currentText).toBeNull();
    });

    it.each([100, 200])('preserves active request when empty gap detection fires at %sms', async (delay) => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return 'hover';
        if (key === 'MOUSE_HOVER_DELAY') return delay;
        return def;
      });
      manager.currentText = 'original';
      manager.activeHoverId = 'gap-hover';
      manager.currentMessageId = 'gap-request';
      manager.currentRect = { top: 0, left: 0, bottom: 20, right: 20 };
      HoverTextDetector.detect.mockReturnValue(null);

      manager.handleMouseMove({ clientX: 100, clientY: 100, target: document.body });
      await vi.advanceTimersByTimeAsync(delay);
      expect(manager.currentText).toBe('original');
      expect(manager.currentMessageId).toBe('gap-request');
      expect(contentScriptIntegration.cancelTranslationRequest).not.toHaveBeenCalled();

      manager.handleTooltipPointerEnter({ hoverId: 'gap-hover' });
      vi.advanceTimersByTime(500);
      expect(manager.currentText).toBe('original');
      expect(manager.currentMessageId).toBe('gap-request');
    });

    it('dismisses once at original grace expiry after empty gap detection', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return 'hover';
        if (key === 'MOUSE_HOVER_DELAY') return 100;
        return def;
      });
      manager.currentText = 'original';
      manager.activeHoverId = 'gap-expiry';
      manager.currentMessageId = 'gap-request-expiry';
      manager.currentRect = { top: 0, left: 0, bottom: 20, right: 20 };
      HoverTextDetector.detect.mockReturnValue(null);

      manager.handleMouseMove({ clientX: 100, clientY: 100, target: document.body });
      await vi.advanceTimersByTimeAsync(100);
      vi.advanceTimersByTime(249);
      expect(manager.currentText).toBe('original');
      vi.advanceTimersByTime(1);

      expect(manager.currentText).toBeNull();
      expect(manager.currentMessageId).toBeNull();
      expect(contentScriptIntegration.cancelTranslationRequest).toHaveBeenCalledTimes(1);
    });

    it('ignores late source leaves while tooltip holds the matching hover, then exits on tooltip leave', async () => {
      await manager.activate();
      const source = document.createElement('p');
      HoverTextDetector.detect.mockReturnValue({
        text: 'held', rect: { top: 0, left: 0, bottom: 20, right: 20 }, element: source
      });
      await manager._processHover({ clientX: 10, clientY: 10 });
      const hoverId = manager.activeHoverId;
      manager.handleTooltipPointerEnter({ hoverId });

      manager.handleMouseLeave();
      source.dispatchEvent(new MouseEvent('mouseleave'));
      vi.advanceTimersByTime(400);
      expect(manager.currentText).toBe('held');

      manager.handleTooltipPointerLeave({ hoverId });
      vi.advanceTimersByTime(350);
      expect(manager.currentText).toBeNull();
    });

    it('clears the tooltip hold on source reentry and closes after the later real source leave', async () => {
      await manager.activate();
      manager.currentText = 'source';
      manager.activeHoverId = 'source-reentry';
      manager.currentRect = { top: 0, left: 0, bottom: 20, right: 20 };
      manager.handleTooltipPointerEnter({ hoverId: 'source-reentry' });
      manager.handleMouseMove({ clientX: 10, clientY: 10, target: document.body });
      expect(manager.tooltipHeldHoverId).toBeNull();
      expect(manager.sourceInside).toBe(true);

      manager.handleTooltipPointerLeave({ hoverId: 'source-reentry' });
      expect(manager.exitTimer).toBeNull();
      manager.handleMouseLeave();
      vi.advanceTimersByTime(349);
      expect(manager.currentText).toBe('source');
      vi.advanceTimersByTime(1);

      expect(manager.currentText).toBeNull();
    });

    it('does not let stale tooltip pointer signals hold or dismiss a newer hover', async () => {
      await manager.activate();
      manager.currentText = 'new';
      manager.activeHoverId = 'new-hover';
      manager.currentRect = { top: 0, left: 0, bottom: 20, right: 20 };
      manager.handleTooltipPointerEnter({ hoverId: 'old-hover' });
      manager.handleTooltipPointerLeave({ hoverId: 'old-hover' });
      expect(manager.tooltipHeldHoverId).toBeNull();

      manager.handleTooltipPointerEnter({ hoverId: 'new-hover' });
      manager.handleMouseMove({ clientX: 100, clientY: 100, target: document.body });
      vi.advanceTimersByTime(350);
      expect(manager.currentText).toBeNull();
    });

    it.each([200, 500])('detects one new hover after %sms even if old exit grace expires first', async (delay) => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return 'hover';
        if (key === 'MOUSE_HOVER_DELAY') return delay;
        return def;
      });
      manager.currentText = 'old text';
      manager.currentElement = document.body;
      manager.activeHoverId = 'old-hover';
      manager.currentMessageId = 'old-request';
      manager.currentRect = { top: 0, left: 0, bottom: 20, right: 20 };
      HoverTextDetector.detect.mockReturnValue({
        text: 'new text', rect: { top: 100, left: 100, bottom: 120, right: 120 },
        element: document.createElement('p')
      });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({ translatedText: 'new translation' });

      manager.handleMouseMove({ clientX: 100, clientY: 100, target: document.body });
      await vi.advanceTimersByTimeAsync(delay);

      expect(HoverTextDetector.detect).toHaveBeenCalledTimes(1);
      expect(manager.currentText).toBe('new text');
    });

    it('restarts the pending detection on rapid movement and does not schedule it in modifier mode', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return 'hover';
        if (key === 'MOUSE_HOVER_DELAY') return 300;
        return def;
      });
      manager.currentText = 'old';
      manager.activeHoverId = 'old-hover';
      manager.currentRect = { top: 0, left: 0, bottom: 20, right: 20 };
      HoverTextDetector.detect.mockReturnValue({
        text: 'rapid destination', rect: { top: 120, left: 120, bottom: 140, right: 140 },
        element: document.createElement('p')
      });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({ translatedText: 'destination' });
      manager.handleMouseMove({ clientX: 100, clientY: 100, target: document.body });
      vi.advanceTimersByTime(200);
      manager.handleMouseMove({ clientX: 130, clientY: 130, target: document.body });
      vi.advanceTimersByTime(200);
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      expect(HoverTextDetector.detect).toHaveBeenCalledTimes(1);
      expect(HoverTextDetector.detect).toHaveBeenCalledWith(130, 130, 'sentence');

      manager.cleanup();
      manager = new HoverTranslationManager();
      HoverTextDetector.detect.mockClear();
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => key === 'MOUSE_HOVER_TRIGGER' ? 'primary' : def);
      manager.currentText = 'old';
      manager.activeHoverId = 'modifier-hover';
      manager.currentRect = { top: 0, left: 0, bottom: 20, right: 20 };
      manager.handleMouseMove({ clientX: 100, clientY: 100, target: document.body });
      expect(manager.hoverTimer).toBeNull();
      vi.advanceTimersByTime(400);
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });

    it.each([false, true])('deactivates a timer-mode display after source leave (iframe=%s)', async (iframe) => {
      const originalTop = Object.getOwnPropertyDescriptor(window, 'top');
      const sendMessage = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue(undefined);
      if (iframe) Object.defineProperty(window, 'top', { configurable: true, value: {} });
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => key === 'MOUSE_HOVER_AUTO_CLOSE' ? 'timer' : def);
      manager.currentText = 'displayed';
      manager.activeHoverId = 'source-token';
      manager.displayedHoverId = 'display-token';
      manager.displayedFrameId = 12;
      manager.handleMouseLeave();
      expect(manager.activeHoverId).toBeNull();
      expect(manager.displayedHoverId).toBe('display-token');

      const emitted = vi.spyOn(pageEventBus, 'emit');
      await manager.deactivate();

      expect(emitted).toHaveBeenCalledWith('MOUSE_HOVER_HIDE_TOOLTIP', { hoverId: 'display-token', frameId: 12 });
      if (iframe) {
        expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
          data: { type: 'MOUSE_HOVER_HIDE_TOOLTIP', detail: { hoverId: 'display-token', frameId: 12 } }
        }));
      }
      if (iframe) Object.defineProperty(window, 'top', originalTop);
      sendMessage.mockRestore();
    });

    it('does not let a late hidden acknowledgement clear a newer display token', async () => {
      manager.activeHoverId = 'new-active';
      manager.displayedHoverId = 'new-display';
      manager.displayedFrameId = 0;
      manager.handleTooltipHidden({ hoverId: 'old-display' });
      expect(manager.displayedHoverId).toBe('new-display');
      expect(manager.activeHoverId).toBe('new-active');
    });
  });

  describe('_processHover', () => {
    const runRejectedHover = async (error) => {
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: document.createElement('p')
      });
      contentScriptIntegration.sendTranslationRequest.mockRejectedValueOnce(error);

      const emitSpy = vi.spyOn(pageEventBus, 'emit');
      await manager._processHover({ clientX: 15, clientY: 15 });
      const errorEvent = emitSpy.mock.calls.find(([type]) => type === 'MOUSE_HOVER_TRANSLATION_ERROR');
      emitSpy.mockRestore();

      return errorEvent?.[1]?.error;
    };

    it('should send translation request and emit event', async () => {
      await manager.activate();
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: document.createElement('p')
      });

      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        translatedText: 'سلام دنیا',
        direction: 'rtl'
      });

      const emitSpy = vi.spyOn(pageEventBus, 'emit');

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(contentScriptIntegration.sendTranslationRequest).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ text: 'Hello world' })
      }));

      expect(emitSpy).toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_READY', expect.objectContaining({
        originalText: 'Hello world',
        translatedText: 'سلام دنیا',
        direction: 'rtl'
      }));
    });

    it('sanitizes generic HTTP errors before local presentation', async () => {
      const canonicalError = Object.assign(new Error('raw provider HTTP body secret'), {
        type: ErrorTypes.HTTP_ERROR,
        statusCode: 404,
        providerName: 'custom'
      });

      const displayError = await runRejectedHover(canonicalError);

      expect(displayError.type).toBe(ErrorTypes.HTTP_ERROR);
      expect(displayError.message).toBe(await getErrorMessage('ERRORS_HTTP_ERROR'));
      expect(displayError.message).not.toContain('raw provider HTTP body secret');
      expect(displayError).not.toHaveProperty('statusCode');
      expect(displayError).not.toHaveProperty('providerName');
      expect(displayError).not.toHaveProperty('originalType');
      expect(displayError.cause).toBe(canonicalError);
      expect(Object.prototype.propertyIsEnumerable.call(displayError, 'cause')).toBe(false);
    });

    it.each([
      [ErrorTypes.API_ERROR, ErrorTypes.API_ERROR, 'ERRORS_API_ERROR', 'raw provider detail secret'],
      [ErrorTypes.JSON_PARSING_ERROR, ErrorTypes.API_RESPONSE_INVALID, 'ERRORS_API_ERROR', 'raw parser response secret'],
      [ErrorTypes.TRANSLATION_TIMEOUT, ErrorTypes.TRANSLATION_TIMEOUT, 'ERRORS_TRANSLATION_TIMEOUT', 'raw timeout detail secret'],
      [ErrorTypes.MODEL_MISSING, ErrorTypes.MODEL_MISSING, 'ERRORS_MODEL_MISSING', 'raw model detail secret'],
      [ErrorTypes.API_KEY_INVALID, ErrorTypes.API_KEY_INVALID, 'ERRORS_API_KEY_INVALID', 'raw key detail secret'],
      [ErrorTypes.CIRCUIT_BREAKER_OPEN, ErrorTypes.CIRCUIT_BREAKER_OPEN, 'ERRORS_CIRCUIT_BREAKER_OPEN', 'raw underlying network reason secret'],
      [undefined, ErrorTypes.TRANSLATION_FAILED, 'ERRORS_TRANSLATION_FAILED', 'raw unknown provider detail secret']
    ])('keeps %s tooltip output localized and metadata-free', async (type, expectedType, messageKey, rawMessage) => {
      const canonicalError = new Error(rawMessage);
      if (type) canonicalError.type = type;
      if (type === ErrorTypes.CIRCUIT_BREAKER_OPEN) {
        canonicalError.originalType = ErrorTypes.NETWORK_ERROR;
        canonicalError.providerName = 'custom';
        canonicalError.statusCode = 503;
      }

      const displayError = await runRejectedHover(canonicalError);

      expect(displayError.type).toBe(expectedType);
      expect(displayError.message).toBe(await getErrorMessage(messageKey));
      expect(displayError.message).not.toContain(rawMessage);
      expect(displayError).not.toHaveProperty('statusCode');
      expect(displayError).not.toHaveProperty('originalType');
      expect(displayError).not.toHaveProperty('providerName');
      expect(displayError).not.toHaveProperty('providerId');
      expect(displayError).not.toHaveProperty('translationOutcome');
      expect(displayError.cause).toBe(canonicalError);
      expect(Object.prototype.propertyIsEnumerable.call(displayError, 'cause')).toBe(false);
    });

    it('passes canonical error to ErrorHandler and emits exactly one adapted error event', async () => {
      const canonicalError = Object.assign(new Error('raw provider message'), {
        type: ErrorTypes.API_ERROR
      });
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: document.createElement('p')
      });
      contentScriptIntegration.sendTranslationRequest.mockRejectedValueOnce(canonicalError);
      const emitSpy = vi.spyOn(pageEventBus, 'emit');

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(mockErrorHandler.handle).toHaveBeenCalledTimes(1);
      expect(mockErrorHandler.handle).toHaveBeenCalledWith(expect.objectContaining({
        type: canonicalError.type,
        cause: canonicalError,
      }), {
        context: 'hover',
        showToast: false
      });
      const errorEvents = emitSpy.mock.calls.filter(([type]) => type === 'MOUSE_HOVER_TRANSLATION_ERROR');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0][1].error).not.toBe(canonicalError);
      expect(errorEvents[0][1].error.message).not.toContain('raw provider message');
      emitSpy.mockRestore();
    });

    it.each([
      new Error('Handler cancelled'),
      Object.assign(new Error('cancelled'), { type: ErrorTypes.USER_CANCELLED }),
      Object.assign(new Error('aborted'), { isCancelled: true })
    ])('does not emit tooltip error for intentional cancellation', async (error) => {
      const emitSpy = vi.spyOn(pageEventBus, 'emit');
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: document.createElement('p')
      });
      contentScriptIntegration.sendTranslationRequest.mockRejectedValueOnce(error);

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(emitSpy).not.toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_ERROR', expect.anything());
      expect(mockErrorHandler.handle).not.toHaveBeenCalled();
      emitSpy.mockRestore();
    });

    it('suppresses TRANSLATION_CANCELLED through the existing public adapter path', async () => {
      const emitSpy = vi.spyOn(pageEventBus, 'emit');
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: document.createElement('p')
      });
      contentScriptIntegration.sendTranslationRequest.mockRejectedValueOnce(
        Object.assign(new Error('Translation cancelled'), { type: ErrorTypes.TRANSLATION_CANCELLED })
      );

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(emitSpy).not.toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_ERROR', expect.anything());
      emitSpy.mockRestore();
    });

    it('reports plain AbortError as a generic translation failure', async () => {
      const emitSpy = vi.spyOn(pageEventBus, 'emit');
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: document.createElement('p')
      });
      contentScriptIntegration.sendTranslationRequest.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(emitSpy).toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_ERROR', expect.anything());
      emitSpy.mockRestore();
    });

    it('does not transport hover UI events through window messages from iframes', async () => {
      const originalTop = Object.getOwnPropertyDescriptor(window, 'top');
      const postMessage = vi.fn();
      Object.defineProperty(window, 'top', { configurable: true, value: { postMessage } });
      const sendMessage = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue(undefined);

      try {
        const canonicalError = new Error('raw provider HTTP body secret');
        Object.assign(canonicalError, {
          type: ErrorTypes.HTTP_ERROR,
          originalType: ErrorTypes.API_ERROR,
          statusCode: 503,
          context: 'hover',
          providerName: 'Provider',
          providerId: 'provider-id',
          code: 'UPSTREAM_FAILURE',
          errorCode: 'E_UPSTREAM',
          translationOutcome: { partial: true },
          cause: 'private',
          arbitrary: { ignored: true }
        });
        const publicError = mapCanonicalTranslationError(canonicalError);
        const displayError = await createLegacyDisplayError(canonicalError, publicError);
        const localEmit = vi.spyOn(pageEventBus, 'emit');

        manager._emitPageEvent('MOUSE_HOVER_TRANSLATION_ERROR', { error: displayError });

        expect(localEmit).toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_ERROR', { error: displayError });
        expect(postMessage).not.toHaveBeenCalled();
        expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
          action: expect.anything(),
          context: 'mouse-hover-frame-event',
          data: {
            type: 'MOUSE_HOVER_TRANSLATION_ERROR',
            detail: {
            error: displayError.message,
            errorDetails: {
              message: displayError.message,
              type: ErrorTypes.HTTP_ERROR
            }
            }
          }
        }));
        expect(sendMessage.mock.calls[0][0].data.detail.error).not.toContain('raw provider HTTP body secret');
        expect(sendMessage.mock.calls[0][0].data.detail.errorDetails).not.toHaveProperty('cause');
        expect(sendMessage.mock.calls[0][0].data.detail.errorDetails).not.toHaveProperty('providerName');
        expect(sendMessage.mock.calls[0][0].data.detail.errorDetails).not.toHaveProperty('statusCode');
        expect(sendMessage.mock.calls[0][0].data.detail.errorDetails).not.toHaveProperty('originalType');
        expect(sendMessage.mock.calls[0][0].data.detail.errorDetails).not.toHaveProperty('arbitrary');
      } finally {
        Object.defineProperty(window, 'top', originalTop);
        sendMessage.mockRestore();
      }
    });

    it('should clean up highlight and caches on context invalidation error without sending cancellation to background', async () => {
      await manager.activate();
      const emitSpy = vi.spyOn(pageEventBus, 'emit');
      const contextErrorSpy = vi.spyOn(ExtensionContextManager, 'isContextError').mockReturnValue(true);
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_SCOPE') return 'container';
        if (key === 'MOUSE_HOVER_SHOW_CONTAINER_BORDER') return true;
        return def;
      });

      const element = document.createElement('div');
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: element
      });

      contentScriptIntegration.sendTranslationRequest.mockRejectedValue(
        new Error('Extension context invalidated')
      );

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(element.classList.contains('ti-hover-container-highlight')).toBe(false);
      expect(manager.borderedElement).toBeNull();
      expect(manager.currentRect).toBeNull();
      expect(manager.currentText).toBeNull();
      expect(manager.currentElement).toBeNull();
      expect(contentScriptIntegration.cancelTranslationRequest).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_ERROR', expect.anything());
      contextErrorSpy.mockRestore();
      emitSpy.mockRestore();
    });

    it.each([ErrorTypes.CONTEXT, ErrorTypes.EXTENSION_CONTEXT_INVALIDATED])(
      'characterizes recognized context error type %s reaching Hover error presentation',
      async (type) => {
        HoverTextDetector.detect.mockReturnValue({
          text: 'Hello world',
          rect: { top: 10, left: 10, bottom: 20, right: 100 },
          element: document.createElement('p')
        });
        contentScriptIntegration.sendTranslationRequest.mockRejectedValueOnce(
          Object.assign(new Error('context failure'), { type })
        );
        const emitSpy = vi.spyOn(pageEventBus, 'emit');

        await manager._processHover({ clientX: 15, clientY: 15 });

        expect(emitSpy).not.toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_ERROR', expect.anything());
        emitSpy.mockRestore();
      }
    );

    it('should clean up highlight and caches on standard translation error without sending cancellation to background', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_SCOPE') return 'container';
        if (key === 'MOUSE_HOVER_SHOW_CONTAINER_BORDER') return true;
        return def;
      });

      const element = document.createElement('div');
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: element
      });

      contentScriptIntegration.sendTranslationRequest.mockRejectedValue(
        new Error('Translation failed')
      );

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(element.classList.contains('ti-hover-container-highlight')).toBe(false);
      expect(manager.borderedElement).toBeNull();
      expect(manager.currentRect).toBeNull();
      expect(manager.currentText).toBeNull();
      expect(manager.currentElement).toBeNull();
      expect(contentScriptIntegration.cancelTranslationRequest).not.toHaveBeenCalled();
    });

    it('does not show a late streaming result after the request is cancelled', async () => {
      await manager.activate();
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: document.createElement('p')
      });

      let streamCallbacks;
      let resolveRequest;
      registerTranslation.mockImplementationOnce((_id, callbacks) => {
        streamCallbacks = callbacks;
      });
      contentScriptIntegration.sendTranslationRequest.mockImplementationOnce(
        () => new Promise(resolve => { resolveRequest = resolve; })
      );
      const emitSpy = vi.spyOn(pageEventBus, 'emit');
      const processPromise = manager._processHover({ clientX: 15, clientY: 15 });

      await vi.waitFor(() => expect(streamCallbacks).toBeDefined());
      manager._cancelPendingHover();
      streamCallbacks.onStreamUpdate({ data: 'late translation' });

      expect(emitSpy).not.toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_READY', expect.anything());

      resolveRequest({ translatedText: 'late translation' });
      await processPromise;
      emitSpy.mockRestore();
    });

    it('should not clean up highlight or caches if a stale failed request finishes after a new hover started', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_SCOPE') return 'container';
        if (key === 'MOUSE_HOVER_SHOW_CONTAINER_BORDER') return true;
        return def;
      });

      const element1 = document.createElement('div');
      const element2 = document.createElement('div');

      // 1. First hover starts
      manager.currentElement = element1;
      HoverTextDetector.detect.mockReturnValue({
        text: 'Text one',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: element1
      });

      let rejectRequest1;
      const promise1 = new Promise((_, reject) => {
        rejectRequest1 = () => reject(new Error('Extension context invalidated'));
      });
      contentScriptIntegration.sendTranslationRequest.mockReturnValueOnce(promise1);

      const processPromise1 = manager._processHover({ clientX: 15, clientY: 15 });
      const firstMessageId = manager.currentMessageId;

      expect(element1.classList.contains('ti-hover-container-highlight')).toBe(true);
      expect(manager.currentText).toBe('Text one');

      // 2. Second hover starts before first completes, overriding active hover state
      manager.currentElement = element2;
      HoverTextDetector.detect.mockReturnValue({
        text: 'Text two',
        rect: { top: 20, left: 20, bottom: 30, right: 120 },
        element: element2
      });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        translatedText: 'Translation two',
        direction: 'ltr'
      });

      await manager._processHover({ clientX: 25, clientY: 25 });
      const secondMessageId = manager.currentMessageId;

      expect(secondMessageId).not.toBe(firstMessageId);
      expect(element2.classList.contains('ti-hover-container-highlight')).toBe(true);
      expect(manager.currentText).toBe('Text two');

      // 3. First request fails (e.g. throws context error)
      rejectRequest1();
      await processPromise1;

      // 4. Verify stale first request's failure did NOT clear the second hover's state
      expect(element2.classList.contains('ti-hover-container-highlight')).toBe(true);
      expect(manager.currentText).toBe('Text two');
      expect(manager.currentElement).toBe(element2);
      expect(manager.borderedElement).toBe(element2);
    });
  });
});
