import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TextFieldHandler } from './TextFieldHandler.js';

// Mock dependencies
vi.mock('../managers/TextFieldIconManager.js', () => ({
  TextFieldIconManager: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn(),
      processEditableElement: vi.fn(),
      cleanupElement: vi.fn(),
      cleanup: vi.fn(),
      forceUpdateAllPositions: vi.fn(),
      activeIcons: new Set()
    }))
  }
}));

vi.mock('./TextFieldDoubleClickHandler.js', () => ({
  TextFieldDoubleClickHandler: class {
    constructor() { this.isActive = false; }
    activate = vi.fn(() => { this.isActive = true; });
    deactivate = vi.fn(() => { this.isActive = false; });
    getStatus = vi.fn(() => ({}));
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn()
  }))
}));

vi.mock('@/shared/error-management/ErrorHandler.js');

vi.mock('@/shared/services/ElementDetectionService.js', () => ({
  default: {
    isUIElement: vi.fn(() => false)
  }
}));

describe('TextFieldHandler', () => {
  let handler;
  let mockFeatureManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFeatureManager = {};
    handler = new TextFieldHandler({ featureManager: mockFeatureManager });
  });

  afterEach(() => {
    handler.deactivate();
    vi.useRealTimers();
  });

  it('should activate and initialize sub-handlers', async () => {
    const result = await handler.activate();
    
    expect(result).toBe(true);
    expect(handler.isActive).toBe(true);
    expect(handler.textFieldIconManager).toBeDefined();
    expect(handler.doubleClickHandler).toBeDefined();
    expect(handler.doubleClickHandler.activate).toHaveBeenCalled();
  });

  it('should deactivate and cleanup', async () => {
    await handler.activate();
    await handler.deactivate();
    
    expect(handler.isActive).toBe(false);
    expect(handler.textFieldIconManager).toBeNull();
    expect(handler.doubleClickHandler).toBeNull();
  });

  describe('Event Handling', () => {
    beforeEach(async () => {
      await handler.activate();
    });

    it('should process element on focusin', async () => {
      const el = document.createElement('textarea');
      document.body.appendChild(el);
      el.focus();

      const event = new FocusEvent('focusin', { bubbles: true });
      Object.defineProperty(event, 'target', { value: el });
      document.dispatchEvent(event);

      // Advance timers for the 100ms delay in focusHandler
      vi.advanceTimersByTime(150);

      expect(handler.textFieldIconManager.processEditableElement).toHaveBeenCalledWith(el);
      
      document.body.removeChild(el);
    });

    it('should cleanup element on focusout', async () => {
      const el = document.createElement('textarea');
      document.body.appendChild(el);
      
      const event = new FocusEvent('focusout', { bubbles: true });
      Object.defineProperty(event, 'target', { value: el });
      document.dispatchEvent(event);

      // Advance microtasks and timers
      await Promise.resolve();
      vi.advanceTimersByTime(50);

      expect(handler.textFieldIconManager.cleanupElement).toHaveBeenCalledWith(el);
      
      document.body.removeChild(el);
    });

    it('should force update positions on window resize', () => {
      window.dispatchEvent(new Event('resize'));
      expect(handler.textFieldIconManager.forceUpdateAllPositions).toHaveBeenCalled();
    });
  });

  describe('isEditableElement', () => {
    it('should identify textarea as editable', () => {
      const el = document.createElement('textarea');
      expect(handler.isEditableElement(el)).toBe(true);
    });

    it('should identify text input as editable', () => {
      const el = document.createElement('input');
      el.type = 'text';
      expect(handler.isEditableElement(el)).toBe(true);
    });

    it('should identify contenteditable as editable', () => {
      const el = document.createElement('div');
      el.contentEditable = 'true';
      expect(handler.isEditableElement(el)).toBe(true);
    });

    it('should identify non-text input as not editable', () => {
      const el = document.createElement('input');
      el.type = 'checkbox';
      expect(handler.isEditableElement(el)).toBe(false);
    });
  });
});
