/**
 * PositionCalculator - Smart positioning utility for text field icons
 * 
 * Inspired by LanguageTool's positioning system, provides intelligent
 * icon placement that avoids viewport edges and element collisions.
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { textFieldIconConfig } from '../config/positioning.js';

export class PositionCalculator {
  static logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'PositionCalculator');
  
  // Default icon size - from config
  static get DEFAULT_ICON_SIZE() {
    return textFieldIconConfig.appearance.sizes[textFieldIconConfig.appearance.defaultSize];
  }
  
  // Minimum distance from viewport edges - from config
  static get VIEWPORT_MARGIN() {
    return textFieldIconConfig.positioning.viewportMargin;
  }
  
  // Distance from target element - from config
  static get ELEMENT_MARGIN() {
    return textFieldIconConfig.positioning.elementMargin;
  }
  
  // Placement priorities (ordered by preference)
  static PLACEMENT_PRIORITIES = [
    'top-right',
    'bottom-right', 
    'top-left',
    'bottom-left',
    'inside-right',
    'inside-left'
  ];

  /**
   * Calculate optimal position for text field icon
   * @param {Element} element - Target input element
   * @param {Object} iconSize - Icon dimensions {width, height}
   * @param {Object} options - Additional options
   * @returns {Object} Optimal position with placement info
   */
  static calculateOptimalPosition(element, iconSize = null, options = {}) {
    if (!element || !element.getBoundingClientRect) {
      this.logger.error('Invalid element provided to calculateOptimalPosition');
      return this.getFallbackPosition();
    }

    iconSize = iconSize || this.DEFAULT_ICON_SIZE;
    const rect = element.getBoundingClientRect();
    const viewport = this.getViewportInfo();
    const isMultiline = this.isMultilineElement(element);
    const positioningMode = options.positioningMode || textFieldIconConfig.positioning.defaultPositioningMode;

    this.logger.debug('Calculating position for element:', {
      tag: element.tagName,
      isMultiline,
      positioningMode,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: viewport.width, height: viewport.height }
    });

    // Generate all possible positions (now with element context)
    const candidates = this.generatePositionCandidates(rect, iconSize, viewport, element);

    // Filter valid positions (within viewport, no collisions)
    const validPositions = candidates.filter(pos =>
      this.isWithinViewport(pos, iconSize, viewport) &&
      (!options.checkCollisions || !this.hasCollision(pos, iconSize, element))
    );

    if (validPositions.length === 0) {
      this.logger.debug('No valid positions found, using fallback');
      return this.getFallbackPosition(rect, iconSize, positioningMode);
    }

    // Select best position based on priority
    const bestPosition = this.selectBestPosition(validPositions);

    // Convert to absolute positioning if needed
    if (positioningMode === 'absolute') {
      this.logger.debug('Converting to absolute position before:', {
        top: bestPosition.top,
        left: bestPosition.left,
        scrollY: viewport.scrollY,
        scrollX: viewport.scrollX
      });
      this.convertToAbsolutePosition(bestPosition, viewport);
      this.logger.debug('Converting to absolute position after:', {
        top: bestPosition.top,
        left: bestPosition.left
      });
    }

    this.logger.debug('Selected optimal position:', {
      positioningMode,
      top: bestPosition.top,
      left: bestPosition.left,
      placement: bestPosition.placement
    });
    return bestPosition;
  }

  /**
   * Check if element is multiline (textarea, contenteditable, or tall input)
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element is multiline
   */
  static isMultilineElement(element) {
    if (!element) return false;
    
    // Check for textarea
    if (element.tagName === 'TEXTAREA') {
      return true;
    }
    
    // Check for contenteditable
    if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
      return true;
    }
    
    // Check for WYSIWYG editors (from config)
    const wysiwygSelectors = textFieldIconConfig.detection.wysiwyg.selectors;
    if (element.closest(wysiwygSelectors.join(', '))) {
      return true;
    }
    
    // Check if input is tall enough to be considered multiline (from config)
    if (element.tagName === 'INPUT') {
      const rect = element.getBoundingClientRect();
      return rect.height > textFieldIconConfig.detection.multilineHeightThreshold;
    }
    
    return false;
  }

  /**
   * Generate position candidates for all placement strategies
   * @param {DOMRect} rect - Element bounding rectangle
   * @param {Object} iconSize - Icon dimensions
   * @param {Object} viewport - Viewport information
   * @param {Element} element - Target element for context-aware positioning
   * @returns {Array} Array of position candidates
   */
  static generatePositionCandidates(rect, iconSize, viewport, element = null) {
    const candidates = [];
    const margin = this.ELEMENT_MARGIN;
    const isMultiline = element ? this.isMultilineElement(element) : false;

    if (isMultiline) {
      // For multiline elements: prioritize inside-bottom-right to avoid toolbar conflicts
      
      // Inside-bottom-right (preferred for multiline)
      candidates.push({
        top: rect.bottom - iconSize.height - margin,
        left: rect.right - iconSize.width - margin,
        placement: 'inside-bottom-right',
        priority: 1
      });

      // Inside-bottom-left (alternative for multiline)
      candidates.push({
        top: rect.bottom - iconSize.height - margin,
        left: rect.left + margin,
        placement: 'inside-bottom-left',
        priority: 2
      });

      // Inside-top-right (if bottom conflicts with scrollbar)
      candidates.push({
        top: rect.top + margin,
        left: rect.right - iconSize.width - margin,
        placement: 'inside-top-right',
        priority: 3
      });

      // Bottom-right (outside, fallback)
      candidates.push({
        top: rect.bottom + margin,
        left: rect.right - iconSize.width,
        placement: 'bottom-right',
        priority: 4
      });

      // Top-right (outside, fallback)
      candidates.push({
        top: rect.top - iconSize.height - margin,
        left: rect.right - iconSize.width,
        placement: 'top-right',
        priority: 5
      });

      // Bottom-left (outside, fallback)
      candidates.push({
        top: rect.bottom + margin,
        left: rect.left,
        placement: 'bottom-left',
        priority: 6
      });

    } else {
      // For single-line elements: use original positioning strategy
      
      // Top-right (preferred for single-line)
      candidates.push({
        top: rect.top - iconSize.height - margin,
        left: rect.right - iconSize.width,
        placement: 'top-right',
        priority: 1
      });

      // Bottom-right
      candidates.push({
        top: rect.bottom + margin,
        left: rect.right - iconSize.width,
        placement: 'bottom-right',
        priority: 2
      });

      // Top-left
      candidates.push({
        top: rect.top - iconSize.height - margin,
        left: rect.left,
        placement: 'top-left',
        priority: 3
      });

      // Bottom-left
      candidates.push({
        top: rect.bottom + margin,
        left: rect.left,
        placement: 'bottom-left',
        priority: 4
      });

      // Inside-right (for wide single-line elements)
      if (rect.width > iconSize.width + margin * 2) {
        candidates.push({
          top: rect.top + margin,
          left: rect.right - iconSize.width - margin,
          placement: 'inside-right',
          priority: 5
        });
      }

      // Inside-left (for wide single-line elements)
      if (rect.width > iconSize.width + margin * 2) {
        candidates.push({
          top: rect.top + margin,
          left: rect.left + margin,
          placement: 'inside-left', 
          priority: 6
        });
      }
    }

    return candidates;
  }

  /**
   * Select the best position from valid candidates
   * @param {Array} validPositions - Array of valid positions
   * @returns {Object} Best position
   */
  static selectBestPosition(validPositions) {
    if (validPositions.length === 1) {
      return validPositions[0];
    }

    // Sort by priority (lower number = higher priority)
    validPositions.sort((a, b) => a.priority - b.priority);
    
    return validPositions[0];
  }

  /**
   * Check if position is within viewport boundaries
   * @param {Object} position - Position to check
   * @param {Object} iconSize - Icon dimensions
   * @param {Object} viewport - Viewport info
   * @returns {boolean} Whether position is valid
   */
  static isWithinViewport(position, iconSize, viewport) {
    const margin = this.VIEWPORT_MARGIN;
    
    return (
      position.left >= margin &&
      position.top >= margin &&
      position.left + iconSize.width <= viewport.width - margin &&
      position.top + iconSize.height <= viewport.height - margin
    );
  }

  /**
   * Check for collision with other elements
   * @param {Object} position - Position to check
   * @param {Object} iconSize - Icon dimensions  
   * @param {Element} targetElement - Target element to ignore
   * @returns {boolean} Whether there's a collision
   */
  static hasCollision(position, iconSize, targetElement) {
    // Create temporary element to test for collision
    const testRect = {
      left: position.left,
      top: position.top,
      right: position.left + iconSize.width,
      bottom: position.top + iconSize.height
    };

    // Get elements at the potential icon position
    const elementsAtPosition = document.elementsFromPoint(
      position.left + iconSize.width / 2,
      position.top + iconSize.height / 2
    );

    // Filter out the target element and document/body
    const collidingElements = elementsAtPosition.filter(el => 
      el !== targetElement && 
      el !== document.documentElement && 
      el !== document.body &&
      !el.closest('#translate-it-host') // Ignore our own extension elements
    );

    // Check if any colliding element has significant overlap
    for (const element of collidingElements) {
      const elementRect = element.getBoundingClientRect();
      
      // Calculate overlap area
      const overlapWidth = Math.max(0, Math.min(testRect.right, elementRect.right) - Math.max(testRect.left, elementRect.left));
      const overlapHeight = Math.max(0, Math.min(testRect.bottom, elementRect.bottom) - Math.max(testRect.top, elementRect.top));
      const overlapArea = overlapWidth * overlapHeight;
      
      // If overlap is more than 30% of icon area, consider it a collision
      const iconArea = iconSize.width * iconSize.height;
      if (overlapArea > iconArea * 0.3) {
        this.logger.debug('Collision detected with element:', element.tagName);
        return true;
      }
    }

    return false;
  }

  /**
   * Get viewport information
   * @returns {Object} Viewport dimensions and scroll position
   */
  static getViewportInfo() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.pageXOffset || document.documentElement.scrollLeft,
      scrollY: window.pageYOffset || document.documentElement.scrollTop
    };
  }

  /**
   * Get fallback position when no optimal position is found
   * @param {DOMRect} rect - Element rectangle
   * @param {Object} iconSize - Icon dimensions
   * @param {string} positioningMode - Positioning mode ('fixed' or 'absolute')
   * @returns {Object} Fallback position
   */
  static getFallbackPosition(rect = null, iconSize = null, positioningMode = null) {
    iconSize = iconSize || this.DEFAULT_ICON_SIZE;
    positioningMode = positioningMode || textFieldIconConfig.positioning.defaultPositioningMode;

    if (!rect) {
      // Absolute fallback - center of viewport
      const viewport = this.getViewportInfo();
      const fallbackPosition = {
        top: viewport.height / 2 - iconSize.height / 2,
        left: viewport.width / 2 - iconSize.width / 2,
        placement: 'center',
        priority: 999,
        isFallback: true
      };

      // Convert to absolute if needed
      if (positioningMode === 'absolute') {
        this.convertToAbsolutePosition(fallbackPosition, viewport);
      }

      return fallbackPosition;
    }

    // Element-relative fallback - simple top-right with viewport constraint
    const viewport = this.getViewportInfo();
    const top = Math.min(rect.top - iconSize.height - this.ELEMENT_MARGIN, viewport.height - iconSize.height - this.VIEWPORT_MARGIN);
    const left = Math.min(rect.right - iconSize.width, viewport.width - iconSize.width - this.VIEWPORT_MARGIN);

    const fallbackPosition = {
      top: Math.max(this.VIEWPORT_MARGIN, top),
      left: Math.max(this.VIEWPORT_MARGIN, left),
      placement: 'fallback',
      priority: 999,
      isFallback: true
    };

    // Convert to absolute if needed
    if (positioningMode === 'absolute') {
      this.convertToAbsolutePosition(fallbackPosition, viewport);
    }

    return fallbackPosition;
  }

  /**
   * Convert position from viewport-relative (fixed) to document-relative (absolute)
   * @param {Object} position - Position object to convert
   * @param {Object} viewport - Viewport information
   */
  static convertToAbsolutePosition(position, viewport) {
    if (!position || !viewport) return;

    // Add scroll offsets to convert from fixed to absolute positioning
    position.top += viewport.scrollY;
    position.left += viewport.scrollX;
  }

  /**
   * Recalculate position for element (used on scroll/resize)
   * @param {Element} element - Target element
   * @param {Object} currentPosition - Current position data
   * @param {Object} options - Calculation options
   * @returns {Object} New position
   */
  static recalculatePosition(element, currentPosition, options = {}) {
    if (!element || !element.getBoundingClientRect) {
      return currentPosition;
    }

    // Preserve original placement preference if possible
    const newOptions = {
      ...options,
      preferredPlacement: currentPosition?.placement
    };

    return this.calculateOptimalPosition(element, null, newOptions);
  }

  /**
   * Check if element position has changed significantly
   * @param {Element} element - Target element
   * @param {Object} lastKnownPosition - Last known position of the element
   * @returns {boolean} Whether position changed
   */
  static hasElementMoved(element, lastKnownPosition) {
    if (!element || !lastKnownPosition) return true;

    const currentRect = element.getBoundingClientRect();
    const threshold = 5; // pixels

    return (
      Math.abs(currentRect.top - lastKnownPosition.top) > threshold ||
      Math.abs(currentRect.left - lastKnownPosition.left) > threshold ||
      Math.abs(currentRect.width - lastKnownPosition.width) > threshold ||
      Math.abs(currentRect.height - lastKnownPosition.height) > threshold
    );
  }

  /**
   * Get position data for debugging
   * @param {Element} element - Target element
   * @returns {Object} Debug information
   */
  static getDebugInfo(element) {
    if (!element) return { error: 'No element provided' };

    const rect = element.getBoundingClientRect();
    const viewport = this.getViewportInfo();
    const candidates = this.generatePositionCandidates(rect, this.DEFAULT_ICON_SIZE, viewport);
    
    return {
      element: {
        tag: element.tagName,
        id: element.id,
        class: element.className
      },
      rect,
      viewport,
      candidates: candidates.length,
      validCandidates: candidates.filter(pos => 
        this.isWithinViewport(pos, this.DEFAULT_ICON_SIZE, viewport)
      ).length
    };
  }
}