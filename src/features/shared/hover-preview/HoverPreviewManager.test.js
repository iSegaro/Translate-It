import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Mock dependencies FIRST
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    init: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }))
}));

vi.mock('@/core/PageEventBus.js', () => ({
  PageTranslationEvents: {
    showTooltip: vi.fn(),
    hideTooltip: vi.fn(),
    updateTooltipPosition: vi.fn()
  }
}));

vi.mock('./HoverPreviewLookup.js', () => ({
  hoverPreviewLookup: {
    get: vi.fn()
  }
}));

vi.mock('@/utils/dom/DomDirectionManager.js', () => ({
  stripBiDiMarks: vi.fn((text) => text)
}));

vi.mock('@/features/page-translation/PageTranslationConstants.js', () => ({
  PAGE_TRANSLATION_ATTRIBUTES: {
    HAS_ORIGINAL: 'data-has-original'
  }
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    constructor(id) {
      this.id = id;
      this.listeners = [];
    }
    addEventListener(target, event, handler, options) {
      this.listeners.push({ target, event, handler, options });
      target.addEventListener(event, handler, options);
    }
    removeEventListener(target, event, handler, options) {
      target.removeEventListener(event, handler, options);
    }
    cleanup() {
      this.listeners.forEach(({ target, event, handler, options }) => {
        target.removeEventListener(event, handler, options);
      });
      this.listeners = [];
    }
  }
}));

// 2. Import after mocks
import { HoverPreviewManager } from './HoverPreviewManager.js';
import { hoverPreviewLookup } from './HoverPreviewLookup.js';
import { PageTranslationEvents } from '@/core/PageEventBus.js';

describe('HoverPreviewManager', () => {
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new HoverPreviewManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should initialize and add event listeners', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    manager.initialize();
    
    expect(addSpy).toHaveBeenCalledWith('mouseover', expect.any(Function), { capture: true });
    expect(addSpy).toHaveBeenCalledWith('mouseout', expect.any(Function), { capture: true });
    expect(manager.isActive).toBe(true);
  });

  it('should not show tooltip if element does not have data-has-original', () => {
    manager.initialize();
    const el = document.createElement('div');
    const event = new MouseEvent('mouseover', { bubbles: true });
    Object.defineProperty(event, 'target', { value: el });
    
    document.dispatchEvent(event);
    
    expect(PageTranslationEvents.showTooltip).not.toHaveBeenCalled();
  });

  it('should show tooltip when hovering over element with data-has-original', () => {
    manager.initialize();
    const el = document.createElement('div');
    el.setAttribute('data-has-original', 'true');
    const textNode = document.createTextNode('translated text');
    el.appendChild(textNode);
    document.body.appendChild(el);

    hoverPreviewLookup.get.mockImplementation((node) => {
      if (node.nodeType === Node.TEXT_NODE) return 'original text';
      return undefined;
    });

    const event = new MouseEvent('mouseover', { 
      bubbles: true,
      clientX: 100,
      clientY: 200
    });
    Object.defineProperty(event, 'target', { value: el });
    
    el.dispatchEvent(event);
    
    expect(PageTranslationEvents.showTooltip).toHaveBeenCalledWith({
      text: 'original text',
      position: { x: 100, y: 200 }
    });

    document.body.removeChild(el);
  });

  it('should update tooltip position on mousemove', () => {
    manager.initialize();
    
    const el = document.createElement('div');
    el.setAttribute('data-has-original', 'true');
    const textNode = document.createTextNode('test');
    el.appendChild(textNode);
    document.body.appendChild(el);
    
    hoverPreviewLookup.get.mockImplementation((node) => {
      if (node.nodeType === Node.TEXT_NODE) return 'orig';
      return undefined;
    });
    
    const overEvent = new MouseEvent('mouseover', { 
      bubbles: true,
      clientX: 10,
      clientY: 10
    });
    Object.defineProperty(overEvent, 'target', { value: el });
    el.dispatchEvent(overEvent);

    const moveEvent = new MouseEvent('mousemove', {
      clientX: 150,
      clientY: 250
    });
    document.dispatchEvent(moveEvent);

    expect(PageTranslationEvents.updateTooltipPosition).toHaveBeenCalledWith({
      x: 150, y: 250
    });
    
    document.body.removeChild(el);
  });

  it('should hide tooltip on mouseout', () => {
    manager.initialize();
    manager.currentElement = document.createElement('div');
    
    const outEvent = new MouseEvent('mouseout', {
      bubbles: true,
      relatedTarget: document.body
    });
    
    manager.handleMouseOut(outEvent);
    
    expect(PageTranslationEvents.hideTooltip).toHaveBeenCalled();
    expect(manager.currentElement).toBeNull();
  });

  it('should gather original text from multiple nodes and handle BR tags', () => {
    const el = document.createElement('div');
    el.setAttribute('data-has-original', 'true');
    
    const text1 = document.createTextNode('Part 1');
    const br = document.createElement('br');
    const text2 = document.createTextNode('Part 2');
    
    el.appendChild(text1);
    el.appendChild(br);
    el.appendChild(text2);

    hoverPreviewLookup.get.mockImplementation((node) => {
      if (node === text1) return 'Orig 1';
      if (node === text2) return 'Orig 2';
      return undefined;
    });

    const result = manager._getOriginalText(el);
    expect(result).toBe('Orig 1\nOrig 2');
  });

  it('should handle original text in attributes (title, alt)', () => {
    const el = document.createElement('img');
    el.setAttribute('data-has-original', 'true');
    el.setAttribute('title', 'translated title');
    el.setAttribute('alt', 'translated alt');

    const titleAttr = el.getAttributeNode('title');
    const altAttr = el.getAttributeNode('alt');

    hoverPreviewLookup.get.mockImplementation((node) => {
      if (node === titleAttr) return 'original title';
      if (node === altAttr) return 'original alt';
      return undefined;
    });

    const result = manager._getOriginalText(el);
    expect(result).toContain('[title]: original title');
    expect(result).toContain('[alt]: original alt');
  });

  it('should cleanup on destroy', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    manager.initialize();
    manager.destroy();
    
    expect(removeSpy).toHaveBeenCalledWith('mouseover', expect.any(Function), expect.any(Object));
    expect(removeSpy).toHaveBeenCalledWith('mouseout', expect.any(Function), expect.any(Object));
    
    expect(PageTranslationEvents.hideTooltip).toHaveBeenCalled();
    expect(manager.isActive).toBe(false);
  });
});
