import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DragHandler } from './DragHandler.js';

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

describe('DragHandler', () => {
  let dragHandler;
  let mockPositionCalculator;
  let dragElement;
  let dragHandle;

  beforeEach(() => {
    mockPositionCalculator = {
      getTopDocument: vi.fn(() => document)
    };

    dragHandler = new DragHandler(mockPositionCalculator);
    
    // Create mock DOM elements
    dragElement = document.createElement('div');
    dragElement.style.position = 'fixed';
    dragElement.style.width = '200px';
    dragElement.style.height = '150px';
    
    // Mock getBoundingClientRect
    dragElement.getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 100,
      width: 200,
      height: 150,
      right: 300,
      bottom: 250
    }));

    dragHandle = document.createElement('div');
    dragElement.appendChild(dragHandle);
    
    document.body.appendChild(dragElement);
    
    // Mock window dimensions
    vi.stubGlobal('innerWidth', 1024);
    vi.stubGlobal('innerHeight', 768);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  describe('Initialization and Setup', () => {
    it('should setup drag handlers correctly', () => {
      dragHandler.setupDragHandlers(dragElement, dragHandle);
      
      expect(dragHandler.dragElement).toBe(dragElement);
      expect(dragHandler.dragHandle).toBe(dragHandle);
      expect(dragHandler.addEventListener).toHaveBeenCalledWith(
        dragHandle,
        'mousedown',
        expect.any(Function)
      );
    });

    it('should warn and not setup if elements are missing', () => {
      dragHandler.setupDragHandlers(null, null);
      expect(dragHandler.dragElement).toBeNull();
    });
  });

  describe('Drag Lifecycle', () => {
    beforeEach(() => {
      dragHandler.setupDragHandlers(dragElement, dragHandle);
    });

    it('should start drag on mousedown', () => {
      const event = new MouseEvent('mousedown', {
        clientX: 120, // 20px inside from left (100)
        clientY: 130  // 30px inside from top (100)
      });
      
      dragHandler._onMouseDown(event);
      
      expect(dragHandler.isDragging).toBe(true);
      expect(dragHandler.dragOffset).toEqual({ x: 20, y: 30 });
      
      // Should add global listeners
      expect(dragHandler.addEventListener).toHaveBeenCalledWith(
        document,
        'mousemove',
        expect.any(Function)
      );
      expect(dragHandler.addEventListener).toHaveBeenCalledWith(
        document,
        'mouseup',
        expect.any(Function)
      );
      
      // Should update visual feedback
      expect(dragHandle.style.cursor).toBe('grabbing');
      expect(dragHandle.style.opacity).toBe('1');
    });

    it('should move element on mousemove while dragging', () => {
      // 1. Start drag
      const downEvent = new MouseEvent('mousedown', { clientX: 120, clientY: 130 });
      dragHandler._onMouseDown(downEvent);
      
      // 2. Move mouse
      const moveEvent = new MouseEvent('mousemove', { clientX: 500, clientY: 400 });
      dragHandler._onMouseMove(moveEvent);
      
      // Expected pos: mouse - offset => 500 - 20 = 480, 400 - 30 = 370
      expect(dragElement.style.left).toBe('480px');
      expect(dragElement.style.top).toBe('370px');
    });

    it('should constrain element within viewport during mousemove', () => {
      // Start drag
      dragHandler._onMouseDown(new MouseEvent('mousedown', { clientX: 120, clientY: 130 }));
      
      // Move mouse way outside (bottom-right)
      const moveEvent = new MouseEvent('mousemove', { clientX: 2000, clientY: 2000 });
      dragHandler._onMouseMove(moveEvent);
      
      // Constrained by: innerWidth - rect.width => 1024 - 200 = 824
      // Constrained by: innerHeight - rect.height => 768 - 150 = 618
      expect(dragElement.style.left).toBe('824px');
      expect(dragElement.style.top).toBe('618px');
      
      // Move mouse way outside (top-left)
      const moveEventTop = new MouseEvent('mousemove', { clientX: -100, clientY: -100 });
      dragHandler._onMouseMove(moveEventTop);
      
      expect(dragElement.style.left).toBe('0px');
      expect(dragElement.style.top).toBe('0px');
    });

    it('should stop drag on mouseup', () => {
      // Start drag
      dragHandler._onMouseDown(new MouseEvent('mousedown', { clientX: 120, clientY: 130 }));
      expect(dragHandler.isDragging).toBe(true);
      
      // End drag
      dragHandler._onMouseUp();
      
      expect(dragHandler.isDragging).toBe(false);
      expect(dragHandle.style.cursor).toBe('move');
      expect(dragHandle.style.opacity).toBe('0.8');
    });
  });

  describe('Control and Utility Methods', () => {
    it('should enable and disable dragging', () => {
      dragHandler.setupDragHandlers(dragElement, dragHandle);
      
      dragHandler.disableDragging();
      expect(dragHandle.style.cursor).toBe('default');
      
      dragHandler.enableDragging();
      expect(dragHandle.style.cursor).toBe('move');
    });

    it('should return correct drag state', () => {
      dragHandler.setupDragHandlers(dragElement, dragHandle);
      
      let state = dragHandler.getDragState();
      expect(state.isDragging).toBe(false);
      expect(state.hasDragElement).toBe(true);
      
      dragHandler._onMouseDown(new MouseEvent('mousedown', { clientX: 120, clientY: 130 }));
      state = dragHandler.getDragState();
      expect(state.isDragging).toBe(true);
    });

    it('should force stop drag', () => {
      dragHandler.setupDragHandlers(dragElement, dragHandle);
      dragHandler._onMouseDown(new MouseEvent('mousedown', { clientX: 120, clientY: 130 }));
      
      dragHandler.forceStopDrag();
      expect(dragHandler.isDragging).toBe(false);
    });

    it('should update elements correctly', () => {
      dragHandler.setupDragHandlers(dragElement, dragHandle);
      
      const newElem = document.createElement('div');
      const newHandle = document.createElement('div');
      
      dragHandler.updateElements(newElem, newHandle);
      
      expect(dragHandler.dragElement).toBe(newElem);
      expect(dragHandler.dragHandle).toBe(newHandle);
    });

    it('should provide animation feedback functions', () => {
      dragHandler.setupDragHandlers(dragElement, dragHandle);
      const { startDrag, endDrag } = dragHandler.getDragAnimationFeedback();
      
      startDrag();
      expect(dragHandle.style.cursor).toBe('grabbing');
      
      endDrag();
      expect(dragHandle.style.cursor).toBe('move');
    });
  });

  describe('Cleanup', () => {
    it('should remove handlers and reset state on cleanup', () => {
      dragHandler.setupDragHandlers(dragElement, dragHandle);
      dragHandler.cleanup();
      
      expect(dragHandler.dragElement).toBeNull();
      expect(dragHandler.dragHandle).toBeNull();
      expect(dragHandler.isDragging).toBe(false);
    });
  });
});
