// src/managers/content/windows/position/SmartPositioner.js

import { createLogger } from "../../../../utils/core/logger.js";
import { WindowsConfig } from "../core/WindowsConfig.js";

/**
 * Handles smart positioning and repositioning of translation popups
 */
export class SmartPositioner {
  constructor(positionCalculator) {
    this.positionCalculator = positionCalculator;
    this.logger = createLogger('Content', 'SmartPositioner');
  }

  /**
   * Calculate smart position for popup considering viewport bounds
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
    const popupHeight = WindowsConfig.POSITIONING.POPUP_HEIGHT;
    const verticalOffset = WindowsConfig.POSITIONING.SELECTION_OFFSET * 10; // 30px (3 * 10)
    const margin = WindowsConfig.POSITIONING.VIEWPORT_MARGIN + 2; // 10px (8 + 2)

    // Calculate space below and above the icon position
    const iconY = position.y - viewport.scrollY; // Icon position relative to viewport
    const spaceBelow = viewport.height - iconY;
    const spaceAbove = iconY;

    let finalX = position.x;
    let finalY = position.y;
    let transformOrigin = "top left";

    // Decide whether to place popup below or above based on available space
    if (spaceBelow >= popupHeight + verticalOffset + margin) {
      // Enough space below - place popup below icon
      finalY = position.y + verticalOffset;
      transformOrigin = "top left";
      
      this.logger.debug('SmartPositioner - positioning popup below icon', {
        original: position,
        spaceBelow,
        strategy: 'below-icon-positioning'
      });
    } else if (spaceAbove >= popupHeight + verticalOffset + margin) {
      // Not enough space below, but enough above - place popup above icon
      finalY = position.y - popupHeight - verticalOffset;
      transformOrigin = "bottom left";
      
      this.logger.debug('SmartPositioner - positioning popup above icon', {
        original: position,
        spaceAbove,
        strategy: 'above-icon-positioning'
      });
    } else {
      // Limited space both above and below - choose the better option
      if (spaceBelow >= spaceAbove) {
        // More space below
        finalY = position.y + verticalOffset;
        transformOrigin = "top left";
        
        this.logger.debug('SmartPositioner - positioning popup below icon (limited space)', {
          original: position,
          spaceBelow,
          spaceAbove,
          strategy: 'below-icon-limited-space'
        });
      } else {
        // More space above
        finalY = position.y - popupHeight - verticalOffset;
        transformOrigin = "bottom left";
        
        this.logger.debug('SmartPositioner - positioning popup above icon (limited space)', {
          original: position,
          spaceBelow,
          spaceAbove,
          strategy: 'above-icon-limited-space'
        });
      }
    }

    return {
      x: finalX,
      y: finalY,
      origin: transformOrigin
    };
  }

  /**
   * DISABLED: No adjustment for fixed elements to avoid displacement
   */
  adjustForFixedElements(x, y, width, height, topWindow) {
    // Simply return original Y position - no adjustment
    this.logger.debug('Fixed element adjustment disabled - using original Y position', {
      originalY: y,
      strategy: 'no-adjustment'
    });
    return y;
  }

  /**
   * DISABLED: Minimal position adjustment to avoid displacement
   */
  adjustPositionAfterContentChange(element, topWindow = null) {
    if (!element || !element.isConnected) return;

    // Only check absolute viewport bounds - no other adjustments
    const currentX = parseInt(element.style.left) || 0;
    const currentY = parseInt(element.style.top) || 0;
    
    const viewportDims = {
      width: (topWindow || window).innerWidth,
      height: (topWindow || window).innerHeight
    };

    // Only adjust if completely outside viewport
    let newX = currentX;
    let newY = currentY;
    
    if (currentX < -200) newX = 5;  // Only if way off screen
    if (currentX > viewportDims.width + 100) newX = viewportDims.width - 350;
    if (currentY < -100) newY = 5;
    if (currentY > viewportDims.height + 100) newY = viewportDims.height - 150;

    if (newX !== currentX || newY !== currentY) {
      this.logger.debug('Minimal viewport bounds adjustment', {
        old: { x: currentX, y: currentY },
        new: { x: newX, y: newY },
        reason: 'completely-outside-viewport'
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