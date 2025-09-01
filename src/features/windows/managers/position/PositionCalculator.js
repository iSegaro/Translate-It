// src/managers/content/windows/position/PositionCalculator.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { WindowsConfig } from "../core/WindowsConfig.js";

/**
 * Calculates positions for icons and windows across different frames
 */
export class PositionCalculator {
  constructor() {
  this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'PositionCalculator');
  }

  /**
   * Calculate position for translate icon - now trusts TextSelectionManager calculations
   */
  calculateIconPosition(selection, providedPosition) {
    // If TextSelectionManager provided a position, trust it (it has viewport-aware logic now)
    if (providedPosition && 
        typeof providedPosition.x === 'number' && 
        typeof providedPosition.y === 'number') {
      this.logger.debug('Using smart position from TextSelectionManager', providedPosition);
      return providedPosition;
    }

    return this._calculateFromSelection(selection);
  }

  /**
   * Private method to calculate position from selection
   */
  _calculateFromSelection(selection) {
    if (!selection || selection.rangeCount === 0) {
      this.logger.warn('No selection range found for icon positioning');
      return null;
    }
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    const iconSize = WindowsConfig.POSITIONING.ICON_SIZE;
    const selectionOffset = WindowsConfig.POSITIONING.SELECTION_OFFSET;
    
    // Calculate preferred position (centered under selection)
    // Note: getBoundingClientRect() returns viewport-relative coordinates
    // We need absolute coordinates for positioning, so we add scroll offset
    const preferredX = window.scrollX + rect.left + rect.width / 2 - (iconSize / 2);
    const preferredY = window.scrollY + rect.bottom + selectionOffset;
    
    return this._applySmartPositioning(rect, preferredX, preferredY);
  }

  /**
   * Apply smart positioning logic
   */
  _applySmartPositioning(rect, preferredX, preferredY) {
    // Get viewport dimensions for intelligent positioning
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    
    const iconSize = WindowsConfig.POSITIONING.ICON_SIZE;
    const selectionOffset = WindowsConfig.POSITIONING.SELECTION_OFFSET;
    const margin = WindowsConfig.POSITIONING.VIEWPORT_MARGIN;
    
    // Smart horizontal adjustment based on available space
    // rect coordinates are viewport-relative, convert to absolute
    const rectLeft = rect.left + window.scrollX;
    const rectRight = rect.right + window.scrollX;
    let finalX = preferredX;
    let finalY = preferredY;
    
    if (preferredX + iconSize > window.scrollX + viewport.width - margin) {
      // Icon would overflow right edge - align to right of selection
      finalX = rectRight - iconSize;
      this.logger.debug('Icon adjusted to avoid right overflow');
    } else if (preferredX < window.scrollX + margin) {
      // Icon would overflow left edge - align to left of selection
      finalX = rectLeft;
      this.logger.debug('Icon adjusted to avoid left overflow');
    }
    
    // Ensure icon stays within absolute viewport bounds
    finalX = Math.max(window.scrollX + margin, 
                     Math.min(finalX, window.scrollX + viewport.width - iconSize - margin));
    
    // Smart vertical adjustment if needed
    if (preferredY + iconSize > window.scrollY + viewport.height - margin) {
      // Position above selection if no space below
      // Convert viewport-relative rect.top to absolute position
      finalY = window.scrollY + rect.top - iconSize - selectionOffset;
      this.logger.debug('Icon positioned above selection due to space constraints');
    }
    
    const position = { x: finalX, y: finalY };

    this.logger.debug('Calculated smart icon position from selection', { 
      rect, 
      viewport, 
      original: { x: preferredX, y: preferredY },
      adjusted: position 
    });
    
    return position;
  }

  /**
   * Calculate final icon position accounting for scroll and centering
   */
  calculateFinalIconPosition(originalPosition, targetWindow = window) {
    const iconSize = WindowsConfig.POSITIONING.ICON_SIZE;
    
    // Convert absolute position to fixed position (relative to viewport)
    const finalPosition = {
      left: originalPosition.x - targetWindow.scrollX,
      top: originalPosition.y - targetWindow.scrollY
    };

    // Ensure the final position stays within viewport bounds
    const margin = WindowsConfig.POSITIONING.VIEWPORT_MARGIN;
    finalPosition.left = Math.max(margin, 
                         Math.min(finalPosition.left, targetWindow.innerWidth - iconSize - margin));
    finalPosition.top = Math.max(margin, 
                        Math.min(finalPosition.top, targetWindow.innerHeight - iconSize - margin));

    this.logger.debug('Calculated final icon position', {
      original: originalPosition,
      scroll: { x: targetWindow.scrollX, y: targetWindow.scrollY },
      iconSize,
      final: finalPosition,
      viewport: { width: targetWindow.innerWidth, height: targetWindow.innerHeight },
      constraints: { margin }
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
        } catch {
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