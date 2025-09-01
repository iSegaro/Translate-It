// src/managers/content/windows/interaction/DragHandler.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

/**
 * Handles drag and drop functionality for translation windows
 */
export class DragHandler {
  constructor(positionCalculator) {
  this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'DragHandler');
    this.positionCalculator = positionCalculator;
    
    // Drag state
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.dragElement = null;
    this.dragHandle = null;
    
    // Bound methods
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  /**
   * Setup drag handlers for an element
   */
  setupDragHandlers(element, dragHandle) {
    if (!element || !dragHandle) {
      this.logger.warn('Cannot setup drag handlers: missing element or handle');
      return;
    }

    this.dragElement = element;
    this.dragHandle = dragHandle;
    
    // Add mousedown listener to drag handle
    this.dragHandle.addEventListener("mousedown", this._onMouseDown);
    
    this.logger.debug('Drag handlers setup completed');
  }

  /**
   * Handle mouse down event (start drag)
   */
  _onMouseDown(e) {
    if (!this.dragElement) return;

    this.isDragging = true;
    
    // Calculate offset from mouse to element top-left corner
    const rect = this.dragElement.getBoundingClientRect();
    this.dragOffset.x = e.clientX - rect.left;
    this.dragOffset.y = e.clientY - rect.top;

    // Get appropriate document for event listeners
    const topDocument = this.positionCalculator.getTopDocument();

    // Add global listeners for mouse move and up
    topDocument.addEventListener("mousemove", this._onMouseMove);
    topDocument.addEventListener("mouseup", this._onMouseUp);

    // Prevent text selection and default behaviors
    e.preventDefault();
    e.stopPropagation();

    // Visual feedback
    if (this.dragHandle) {
      this.dragHandle.style.opacity = "1";
      this.dragHandle.style.cursor = "grabbing";
    }

    this.logger.debug('Drag started', { 
      offset: this.dragOffset,
      elementRect: rect 
    });
  }

  /**
   * Handle mouse move event (during drag)
   */
  _onMouseMove(e) {
    if (!this.isDragging || !this.dragElement) return;

    e.preventDefault();

    // Calculate new position
    const newX = e.clientX - this.dragOffset.x;
    const newY = e.clientY - this.dragOffset.y;

    // Get viewport constraints
    const topDocument = this.positionCalculator.getTopDocument();
    const topWindow = topDocument.defaultView || topDocument.parentWindow || window;
    const viewport = {
      width: topWindow.innerWidth,
      height: topWindow.innerHeight
    };

    // Get element dimensions
    const rect = this.dragElement.getBoundingClientRect();
    
    // Keep element within viewport bounds
    const constrainedX = Math.max(0, Math.min(newX, viewport.width - rect.width));
    const constrainedY = Math.max(0, Math.min(newY, viewport.height - rect.height));

    // Apply new position (using fixed positioning)
    this.dragElement.style.left = `${constrainedX}px`;
    this.dragElement.style.top = `${constrainedY}px`;

    this.logger.debug('Element dragged', {
      original: { x: newX, y: newY },
      constrained: { x: constrainedX, y: constrainedY },
      viewport
    });
  }

  /**
   * Handle mouse up event (end drag)
   */
  _onMouseUp() {
    if (!this.isDragging) return;

    this.isDragging = false;

    // Get appropriate document for cleanup
    const topDocument = this.positionCalculator.getTopDocument();

    // Remove global listeners
    topDocument.removeEventListener("mousemove", this._onMouseMove);
    topDocument.removeEventListener("mouseup", this._onMouseUp);

    // Reset visual feedback
    if (this.dragHandle) {
      this.dragHandle.style.opacity = "0.8";
      this.dragHandle.style.cursor = "move";
    }

    this.logger.debug('Drag ended');
  }

  /**
   * Enable dragging
   */
  enableDragging() {
    if (this.dragHandle && this.dragElement) {
      this.dragHandle.style.cursor = "move";
      this.dragHandle.addEventListener("mousedown", this._onMouseDown);
    }
  }

  /**
   * Disable dragging
   */
  disableDragging() {
    if (this.dragHandle) {
      this.dragHandle.style.cursor = "default";
      this.dragHandle.removeEventListener("mousedown", this._onMouseDown);
    }
  }

  /**
   * Check if currently dragging
   */
  isDragActive() {
    return this.isDragging;
  }

  /**
   * Get current drag state
   */
  getDragState() {
    return {
      isDragging: this.isDragging,
      dragOffset: { ...this.dragOffset },
      hasDragElement: !!this.dragElement,
      hasDragHandle: !!this.dragHandle
    };
  }

  /**
   * Force stop dragging
   */
  forceStopDrag() {
    if (this.isDragging) {
      this._onMouseUp(new MouseEvent('mouseup'));
    }
  }

  /**
   * Update drag element and handle
   */
  updateElements(element, dragHandle) {
    // Clean up existing handlers
    this.removeDragHandlers();
    
    // Setup new handlers
    this.setupDragHandlers(element, dragHandle);
  }

  /**
   * Remove drag handlers and cleanup
   */
  removeDragHandlers() {
    // Stop any active drag
    this.forceStopDrag();
    
    // Remove handle event listener
    if (this.dragHandle) {
      this.dragHandle.removeEventListener("mousedown", this._onMouseDown);
    }

    // Clean up global listeners (safety cleanup)
    try {
      const topDocument = this.positionCalculator.getTopDocument();
      topDocument.removeEventListener("mousemove", this._onMouseMove);
      topDocument.removeEventListener("mouseup", this._onMouseUp);
    } catch (error) {
      this.logger.warn('Error cleaning up global drag listeners:', error);
    }

    // Reset state
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.dragElement = null;
    this.dragHandle = null;
    
    this.logger.debug('Drag handlers removed');
  }

  /**
   * Get drag animation feedback functions
   */
  getDragAnimationFeedback() {
    const startDrag = () => {
      if (this.dragHandle) {
        this.dragHandle.style.opacity = "1";
        this.dragHandle.style.cursor = "grabbing";
      }
    };

    const endDrag = () => {
      if (this.dragHandle) {
        this.dragHandle.style.opacity = "0.8";
        this.dragHandle.style.cursor = "move";
      }
    };

    return { startDrag, endDrag };
  }

  /**
   * Cleanup drag handler
   */
  cleanup() {
    this.removeDragHandlers();
    this.logger.debug('DragHandler cleanup completed');
  }
}