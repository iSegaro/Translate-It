import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HoverTranslationManager } from './HoverTranslationManager.js';
import { HoverTextDetector } from './HoverTextDetector.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { contentScriptIntegration } from '@/shared/messaging/core/ContentScriptIntegration.js';

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
    sendTranslationRequest: vi.fn()
  }
}));

vi.mock('@/shared/services/ElementDetectionService.js', () => ({
  ElementDetectionService: {
    getInstance: vi.fn(() => ({
      isUIElement: vi.fn(() => false)
    }))
  }
}));

describe('HoverTranslationManager', () => {
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    manager = new HoverTranslationManager();
    
    // Set default setting mocks
    settingsManager.get.mockImplementation((key, def) => {
      if (key === 'MOUSE_HOVER_AUTO_CLOSE') return 'mouseleave';
      if (key === 'MOUSE_HOVER_TRIGGER') return 'ctrl';
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
    const cleanupSpy = vi.spyOn(manager, 'cleanup');
    const emitSpy = vi.spyOn(pageEventBus, 'emit');
    
    await manager.deactivate();
    
    expect(manager.isActive).toBe(false);
    expect(cleanupSpy).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith('MOUSE_HOVER_HIDE_TOOLTIP');
  });

  describe('handleMouseMove', () => {
    it('should debounce detection', async () => {
      await manager.activate();
      
      const event = { clientX: 10, clientY: 10, target: document.body, ctrlKey: true };
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
      
      // First move
      manager.handleMouseMove({ clientX: 10, clientY: 10, target: document.body, ctrlKey: true });
      vi.advanceTimersByTime(200);
      
      // Second move (cancels first)
      manager.handleMouseMove({ clientX: 100, clientY: 100, target: document.body, ctrlKey: true });
      
      vi.advanceTimersByTime(200); // Only 200ms since 2nd move
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(101); // Now 301ms since 2nd move
      expect(HoverTextDetector.detect).toHaveBeenCalledTimes(1);
    });

    it('should respect modifier key settings', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return 'ctrl';
        return def;
      });

      // Move without Ctrl
      manager.handleMouseMove({ clientX: 10, clientY: 10, target: document.body, ctrlKey: false });
      vi.advanceTimersByTime(600);
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();

      // Move with Ctrl (different position to avoid dist < 2)
      manager.handleMouseMove({ clientX: 50, clientY: 50, target: document.body, ctrlKey: true });
      vi.advanceTimersByTime(600);
      expect(HoverTextDetector.detect).toHaveBeenCalled();
    });
  });

  describe('handleKeyDown', () => {
    it('should trigger translation immediately if modifier is pressed', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return 'ctrl';
        return def;
      });

      manager.lastMouseEvent = { clientX: 10, clientY: 10, target: document.body };
      
      manager.handleKeyDown({ ctrlKey: true });
      
      vi.advanceTimersByTime(60); // Modifier trigger has 50ms delay
      expect(HoverTextDetector.detect).toHaveBeenCalled();
    });
  });

  describe('_processHover', () => {
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
  });
});
