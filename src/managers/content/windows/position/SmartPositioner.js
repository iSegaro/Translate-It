// src/managers/content/windows/position/SmartPositioner.js

import { createLogger } from "../../../../utils/core/logger.js";
import { WindowsConfig } from "../core/WindowsConfig.js";

/**
 * Handles intelligent positioning of translation windows
 */
export class SmartPositioner {
  constructor(positionCalculator) {
    this.logger = createLogger('Content', 'SmartPositioner');
    this.positionCalculator = positionCalculator;
  }

  /**
   * Calculate smart position that stays within viewport
   */
  calculateSmartPosition(position, topWindow = null) {
    if (!topWindow) {
      const topDocument = this.positionCalculator.getTopDocument();
      topWindow = topDocument.defaultView || topDocument.parentWindow || window;
    }

    // Get viewport dimensions
    const viewport = {
      width: topWindow.innerWidth,
      height: topWindow.innerHeight,
      scrollX: topWindow.scrollX,
      scrollY: topWindow.scrollY
    };

    // Popup dimensions
    const popupWidth = WindowsConfig.POSITIONING.POPUP_WIDTH;
    const popupHeight = WindowsConfig.POSITIONING.POPUP_HEIGHT;
    const margin = WindowsConfig.POSITIONING.VIEWPORT_MARGIN;

    // Calculate available space in each direction
    const spaceRight = viewport.width - (position.x - viewport.scrollX);
    const spaceLeft = position.x - viewport.scrollX;
    const spaceBelow = viewport.height - (position.y - viewport.scrollY);
    const spaceAbove = position.y - viewport.scrollY;

    let finalX = position.x;
    let finalY = position.y;
    let transformOrigin = "top left";

    // Horizontal positioning logic
    if (spaceRight >= popupWidth) {
      // Enough space on the right
      finalX = position.x;
    } else if (spaceLeft >= popupWidth) {
      // Not enough space on right, try left
      finalX = position.x - popupWidth;
      transformOrigin = transformOrigin.replace("left", "right");
    } else {
      // Not enough space on either side, position to fit within viewport
      const maxRight = viewport.scrollX + viewport.width - popupWidth - margin;
      const minLeft = viewport.scrollX + margin;
      finalX = Math.max(minLeft, Math.min(position.x, maxRight));
      transformOrigin = "top center";
    }

    // Vertical positioning logic
    if (spaceBelow >= popupHeight) {
      // Enough space below
      finalY = position.y;
    } else if (spaceAbove >= popupHeight) {
      // Not enough space below, try above
      finalY = position.y - popupHeight - margin;
      transformOrigin = transformOrigin.replace("top", "bottom");
    } else {
      // Not enough space above or below, position to fit within viewport
      const maxBottom = viewport.scrollY + viewport.height - popupHeight - margin;
      const minTop = viewport.scrollY + margin;
      finalY = Math.max(minTop, Math.min(position.y, maxBottom));

      // Adjust transform origin based on final position relative to selection
      if (finalY < position.y) {
        transformOrigin = transformOrigin.replace("top", "bottom");
      }
    }

    // Handle fixed/sticky elements by checking for overlaps
    finalY = this.adjustForFixedElements(finalX, finalY, popupWidth, popupHeight, topWindow);

    const result = {
      x: finalX,
      y: finalY,
      origin: transformOrigin
    };

    this.logger.debug('Calculated smart position', {
      original: position,
      viewport,
      spaces: { spaceRight, spaceLeft, spaceBelow, spaceAbove },
      final: result
    });

    return result;
  }

  /**
   * Adjust position to avoid fixed/sticky elements
   */
  adjustForFixedElements(x, y, width, height, topWindow) {
    const topDocument = this.positionCalculator.getTopDocument();
    
    // Get all fixed and sticky positioned elements
    const fixedElements = Array.from(topDocument.querySelectorAll("*")).filter(el => {
      const style = topWindow.getComputedStyle(el);
      return style.position === "fixed" || style.position === "sticky";
    });

    const popupRect = {
      left: x - topWindow.scrollX,
      top: y - topWindow.scrollY,
      right: x - topWindow.scrollX + width,
      bottom: y - topWindow.scrollY + height
    };

    for (const element of fixedElements) {
      const rect = element.getBoundingClientRect();

      // Skip invisible or zero-dimension elements
      if (rect.width === 0 || rect.height === 0 || 
          rect.left >= topWindow.innerWidth || rect.top >= topWindow.innerHeight ||
          rect.right <= 0 || rect.bottom <= 0) {
        continue;
      }

      // Check for overlap
      const isOverlapping = !(
        popupRect.right <= rect.left ||
        popupRect.left >= rect.right ||
        popupRect.bottom <= rect.top ||
        popupRect.top >= rect.bottom
      );

      if (isOverlapping) {
        this.logger.debug('Found overlapping fixed element, adjusting position', {
          popup: popupRect,
          element: rect
        });

        // Try to reposition below the fixed element
        const newY = topWindow.scrollY + rect.bottom + WindowsConfig.POSITIONING.VIEWPORT_MARGIN;
        const spaceBelow = topWindow.innerHeight - (rect.bottom + WindowsConfig.POSITIONING.VIEWPORT_MARGIN);

        if (spaceBelow >= height) {
          return newY;
        } else {
          // Try above the fixed element
          const newYAbove = topWindow.scrollY + rect.top - height - WindowsConfig.POSITIONING.VIEWPORT_MARGIN;
          if (rect.top >= height + WindowsConfig.POSITIONING.VIEWPORT_MARGIN) {
            return newYAbove;
          }
        }
      }
    }

    return y;
  }

  /**
   * Adjust position after content change (when actual dimensions are known)
   */
  adjustPositionAfterContentChange(element, topWindow = null) {
    if (!element || !element.isConnected) return;

    if (!topWindow) {
      const topDocument = this.positionCalculator.getTopDocument();
      topWindow = topDocument.defaultView || topDocument.parentWindow || window;
    }

    // Get actual popup dimensions after content is rendered
    const rect = element.getBoundingClientRect();
    const currentX = parseInt(element.style.left) || 0;
    const currentY = parseInt(element.style.top) || 0;

    const viewport = {
      width: topWindow.innerWidth,
      height: topWindow.innerHeight
    };

    const margin = WindowsConfig.POSITIONING.VIEWPORT_MARGIN;
    let needsRepositioning = false;
    let newX = currentX;
    let newY = currentY;

    // Check horizontal bounds
    if (currentX + rect.width > viewport.width - margin) {
      newX = viewport.width - rect.width - margin;
      needsRepositioning = true;
    }
    
    if (currentX < margin) {
      newX = margin;
      needsRepositioning = true;
    }

    // Ensure popup fits within viewport even after adjustment
    if (newX + rect.width > viewport.width - margin) {
      newX = Math.max(margin, viewport.width - rect.width - margin);
    }

    // Check vertical bounds
    if (currentY + rect.height > viewport.height - margin) {
      newY = viewport.height - rect.height - margin;
      needsRepositioning = true;
    } else if (currentY < margin) {
      newY = margin;
      needsRepositioning = true;
    }

    // Apply new position if needed
    if (needsRepositioning) {
      this.logger.debug('Repositioning after content change', {
        old: { x: currentX, y: currentY },
        new: { x: newX, y: newY },
        rect: { width: rect.width, height: rect.height },
        viewport
      });

      element.style.left = `${newX}px`;
      element.style.top = `${newY}px`;
      return { x: newX, y: newY };
    }

    return { x: currentX, y: currentY };
  }

  /**
   * Apply initial positioning styles to element
   */
  applyInitialStyles(element, position, topWindow = null) {
    if (!element) return;

    // Check if coordinates are already adjusted from iframe
    let topWindowPosition;
    if (position._alreadyAdjusted) {
      topWindowPosition = { x: position.x, y: position.y };
      this.logger.debug('Using pre-adjusted coordinates from iframe', topWindowPosition);
    } else {
      topWindowPosition = this.positionCalculator.calculateCoordsForTopWindow(position);
    }

    // Calculate smart position
    const smartPosition = this.calculateSmartPosition(topWindowPosition, topWindow);
    
    if (!topWindow) {
      const topDocument = this.positionCalculator.getTopDocument();
      topWindow = topDocument.defaultView || topDocument.parentWindow || window;
    }

    const styles = {
      position: "fixed",
      zIndex: WindowsConfig.Z_INDEX.POPUP.toString(),
      left: `${smartPosition.x - topWindow.scrollX}px`,
      top: `${smartPosition.y - topWindow.scrollY}px`,
      transform: "scale(0.1)",
      transformOrigin: smartPosition.origin,
      opacity: "0",
      transition: WindowsConfig.ANIMATION.SCALE_TRANSITION
    };

    Object.assign(element.style, styles);
    
    this.logger.debug('Applied initial positioning styles', {
      position: topWindowPosition,
      smartPosition,
      styles
    });
  }
}