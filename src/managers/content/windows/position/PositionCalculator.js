// src/managers/content/windows/position/PositionCalculator.js

import { createLogger } from "../../../../utils/core/logger.js";
import { WindowsConfig } from "../core/WindowsConfig.js";

/**
 * Calculates positions for icons and windows across different frames
 */
export class PositionCalculator {
  constructor() {
    this.logger = createLogger('Content', 'PositionCalculator');
  }

  /**
   * Calculate position for translate icon
   */
  calculateIconPosition(selection, providedPosition) {
    // Use provided position if valid
    if (providedPosition && 
        typeof providedPosition.x === 'number' && 
        typeof providedPosition.y === 'number') {
      this.logger.debug('Using provided position for icon', providedPosition);
      return providedPosition;
    }

    // Calculate from selection if no valid position provided
    if (!selection || selection.rangeCount === 0) {
      this.logger.warn('No selection range found for icon positioning');
      return null;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    const position = {
      x: window.scrollX + rect.left + rect.width / 2 - (WindowsConfig.POSITIONING.ICON_SIZE / 2),
      y: window.scrollY + rect.bottom + WindowsConfig.POSITIONING.SELECTION_OFFSET
    };

    this.logger.debug('Calculated icon position from selection', { rect, position });
    return position;
  }

  /**
   * Calculate final icon position accounting for scroll and centering
   */
  calculateFinalIconPosition(originalPosition, targetWindow = window) {
    const iconSize = WindowsConfig.POSITIONING.ICON_SIZE;
    
    const finalPosition = {
      left: originalPosition.x - targetWindow.scrollX - (iconSize / 2),
      top: originalPosition.y - targetWindow.scrollY + WindowsConfig.POSITIONING.SELECTION_OFFSET
    };

    this.logger.debug('Calculated final icon position', {
      original: originalPosition,
      scroll: { x: targetWindow.scrollX, y: targetWindow.scrollY },
      iconSize,
      final: finalPosition,
      viewport: { width: targetWindow.innerWidth, height: targetWindow.innerHeight }
    });

    return finalPosition;
  }

  /**
   * Calculate coordinates for top window (iframe coordinate transformation)
   */
  calculateCoordsForTopWindow(position) {
    if (window === window.top) {
      this.logger.debug('No iframe conversion needed, using original position', position);
      return position;
    }

    try {
      let totalOffsetX = position.x;
      let totalOffsetY = position.y;
      let currentWindow = window;

      this.logger.debug('Calculating iframe coordinates', {
        originalPosition: position,
        isInIframe: window !== window.top
      });

      // Add iframe offsets up the chain
      while (currentWindow.parent !== currentWindow) {
        try {
          const frameElement = currentWindow.frameElement;
          if (!frameElement) break;

          const frameRect = frameElement.getBoundingClientRect();
          const parentWindow = currentWindow.parent;
          
          // Add iframe position offset
          totalOffsetX += frameRect.left + parentWindow.scrollX;
          totalOffsetY += frameRect.top + parentWindow.scrollY;
          
          // Add CSS borders
          const computedStyle = parentWindow.getComputedStyle(frameElement);
          const borderLeft = parseInt(computedStyle.borderLeftWidth) || 0;
          const borderTop = parseInt(computedStyle.borderTopWidth) || 0;
          
          totalOffsetX += borderLeft;
          totalOffsetY += borderTop;
          
          this.logger.debug('Added iframe offset', {
            frameRect: { left: frameRect.left, top: frameRect.top },
            borders: { left: borderLeft, top: borderTop },
            cumulativeOffset: { x: totalOffsetX, y: totalOffsetY }
          });
          
          currentWindow = parentWindow;
        } catch (error) {
          this.logger.warn('Cross-origin restriction in iframe offset calculation:', error.message);
          break;
        }
      }

      const finalPosition = { x: totalOffsetX, y: totalOffsetY };
      this.logger.debug('Final calculated position for top window', {
        original: position,
        final: finalPosition,
        difference: { x: finalPosition.x - position.x, y: finalPosition.y - position.y }
      });
      
      return finalPosition;
    } catch (error) {
      this.logger.warn('Could not calculate top window coords:', error);
      return position;
    }
  }

  /**
   * Get top document for cross-frame positioning
   */
  getTopDocument() {
    let currentWindow = window;
    let topDocument = document;

    try {
      while (currentWindow.parent !== currentWindow) {
        try {
          const parentDoc = currentWindow.parent.document;
          if (parentDoc) {
            topDocument = parentDoc;
            currentWindow = currentWindow.parent;
          } else {
            break;
          }
        } catch (error) {
          // Cross-origin restriction
          break;
        }
      }
    } catch (error) {
      this.logger.warn('Could not access top document, using current:', error);
    }

    return topDocument;
  }

  /**
   * Calculate adjusted position for iframe window creation
   */
  calculateAdjustedPositionForIframe(position, frameId, frameMap) {
    let adjustedPosition = { ...position };

    try {
      let targetFrame = null;
      
      // Try to find iframe by frameId first
      if (frameMap && frameMap.has(frameId)) {
        targetFrame = frameMap.get(frameId);
      }

      if (targetFrame) {
        const rect = targetFrame.getBoundingClientRect();
        adjustedPosition = {
          x: (position?.x ?? 0) + window.scrollX + rect.left,
          y: (position?.y ?? 0) + window.scrollY + rect.top
        };

        this.logger.debug('Adjusted position for iframe', {
          original: position,
          iframeRect: rect,
          adjusted: adjustedPosition
        });
      } else {
        this.logger.warn('Could not find iframe for position adjustment', { frameId });
      }
    } catch (error) {
      this.logger.error('Failed to adjust position for iframe:', error);
    }

    return adjustedPosition;
  }

  /**
   * Validate position object
   */
  validatePosition(position) {
    if (!position || typeof position !== 'object') {
      return false;
    }

    const hasValidX = typeof position.x === 'number' && !isNaN(position.x);
    const hasValidY = typeof position.y === 'number' && !isNaN(position.y);

    return hasValidX && hasValidY;
  }

  /**
   * Ensure position is within reasonable bounds
   */
  constrainPosition(position, viewport) {
    if (!this.validatePosition(position) || !viewport) {
      return position;
    }

    return {
      x: Math.max(0, Math.min(position.x, viewport.width - WindowsConfig.POSITIONING.POPUP_WIDTH)),
      y: Math.max(0, Math.min(position.y, viewport.height - WindowsConfig.POSITIONING.POPUP_HEIGHT))
    };
  }
}