import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Mock dependencies FIRST
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

vi.mock('../utils/IframePositionCalculator.js', () => ({
  default: class {
    constructor() {}
    setupMouseTracking = vi.fn();
    cleanup = vi.fn();
    handleIframePositionRequest = vi.fn();
    handlePositionCalculationResponse = vi.fn();
  }
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  },
  SELECTION_EVENTS: {
    GLOBAL_SELECTION_CHANGE: 'global-selection-change',
    GLOBAL_SELECTION_CLEAR: 'global-selection-clear'
  }
}));

vi.mock('@/shared/config/config.js', () => ({
  SelectionTranslationMode: { ON_CLICK: 'onclick' },
  getActiveSelectionIconOnTextfieldsAsync: vi.fn(() => Promise.resolve(true)),
  getExtensionEnabledAsync: vi.fn(() => Promise.resolve(true)),
  getTranslateOnTextSelectionAsync: vi.fn(() => Promise.resolve(true))
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    get: vi.fn(() => 'onclick')
  }
}));

// Mock ResourceTracker to avoid complex MemoryManager dependencies
vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    constructor(id) {
      this.id = id;
      this.listeners = [];
      this.resources = new Set();
    }
    addEventListener(target, event, handler, options) {
      this.listeners.push({ target, event, handler, options });
      target.addEventListener(event, handler, options);
    }
    removeEventListener(target, event, handler, options) {
      target.removeEventListener(event, handler, options);
    }
    trackResource(id, cleanup) {
      this.resources.add({ id, cleanup });
    }
    cleanup() {
      this.listeners.forEach(({ target, event, handler, options }) => {
        target.removeEventListener(event, handler, options);
      });
      this.listeners = [];
      this.resources.forEach(r => r.cleanup());
      this.resources.clear();
    }
  }
}));

// 2. Import after mocks
import { TextFieldDoubleClickHandler } from './TextFieldDoubleClickHandler.js';
import { pageEventBus } from '@/core/PageEventBus.js';

describe('TextFieldDoubleClickHandler', () => {
  let handler;
  let mockFeatureManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFeatureManager = {};
    handler = new TextFieldDoubleClickHandler({ featureManager: mockFeatureManager });
    
    // Mock getSelection
    vi.stubGlobal('getSelection', vi.fn(() => ({
      toString: () => 'selected text'
    })));
    
    // Mock scrollX/Y
    vi.stubGlobal('scrollX', 0);
    vi.stubGlobal('scrollY', 0);
  });

  afterEach(() => {
    handler.deactivate();
    vi.useRealTimers();
  });

  it('should activate and setup listeners', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    await handler.activate();
    
    expect(handler.isActive).toBe(true);
    expect(addSpy).toHaveBeenCalledWith('dblclick', expect.any(Function), expect.any(Object));
    expect(handler.positionCalculator.setupMouseTracking).toHaveBeenCalled();
  });

  it('should deactivate and cleanup', async () => {
    await handler.activate();
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    
    await handler.deactivate();
    
    expect(handler.isActive).toBe(false);
    expect(removeSpy).toHaveBeenCalledWith('dblclick', expect.any(Function), expect.any(Object));
    expect(handler.positionCalculator.cleanup).toHaveBeenCalled();
  });

  describe('isTextField', () => {
    it('should identify textarea as text field', () => {
      const el = document.createElement('textarea');
      expect(handler.isTextField(el)).toBe(true);
    });

    it('should identify contenteditable as text field', () => {
      const el = document.createElement('div');
      el.contentEditable = 'true';
      expect(handler.isTextField(el)).toBe(true);
    });

    it('should identify child of contenteditable as text field', () => {
      const parent = document.createElement('div');
      parent.contentEditable = 'true';
      const child = document.createElement('span');
      parent.appendChild(child);
      expect(handler.isTextField(child)).toBe(true);
    });
  });

  describe('Double Click Processing', () => {
    beforeEach(async () => {
      await handler.activate();
    });

    it('should process double click on textarea', async () => {
      const el = document.createElement('textarea');
      el.value = 'hello world';
      // In jsdom, we might need to mock selectionStart/End if they don't behave
      el.selectionStart = 0;
      el.selectionEnd = 5;
      
      const event = new MouseEvent('dblclick', { bubbles: true, clientX: 100, clientY: 200 });
      Object.defineProperty(event, 'target', { value: el });
      
      await handler.handleDoubleClick(event);
      
      // Advance timers for the 150ms delay
      await vi.advanceTimersByTimeAsync(200);
      
      expect(pageEventBus.emit).toHaveBeenCalledWith('global-selection-change', expect.objectContaining({
        text: 'hello',
        position: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
      }));
    });

    it('should ignore double click if typing is active', async () => {
      window.translateItTextFieldTypingActive = true;
      
      const el = document.createElement('textarea');
      const event = new MouseEvent('dblclick', { bubbles: true });
      Object.defineProperty(event, 'target', { value: el });
      
      await handler.handleDoubleClick(event);
      
      vi.advanceTimersByTime(200);
      
      expect(pageEventBus.emit).not.toHaveBeenCalled();
      
      window.translateItTextFieldTypingActive = false;
    });
  });

  describe('Typing Detection', () => {
    beforeEach(async () => {
      await handler.activate();
    });

    it('should start grace period on keydown', () => {
      const el = document.createElement('textarea');
      handler.doubleClickProcessing = true;
      handler.lastDoubleClickTime = Date.now() - 200; // 200ms ago

      const event = new KeyboardEvent('keydown', { key: 'a' });
      Object.defineProperty(event, 'target', { value: el });
      
      handler.handleTextInputStart(event);
      
      expect(handler.typingDetection.isActive).toBe(true);
      expect(window.translateItTextFieldTypingActive).toBe(true);
    });

    it('should extend grace period on input', () => {
      handler.typingDetection.isActive = true;
      handler.typingDetection.startTime = Date.now();
      
      const el = document.createElement('textarea');
      const event = new Event('input');
      Object.defineProperty(event, 'target', { value: el });
      
      handler.handleTextInput(event);
      
      expect(handler.typingDetection.timeout).toBeDefined();
    });
  });
});
