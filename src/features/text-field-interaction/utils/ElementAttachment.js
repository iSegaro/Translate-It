/**
 * ElementAttachment - Manages icon lifecycle and positioning updates
 * 
 * Handles the attachment of text field icons to their target elements,
 * automatically updating position on scroll/resize and managing cleanup.
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { PositionCalculator } from "./PositionCalculator.js";
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { textFieldIconConfig } from '../config/positioning.js';

export class ElementAttachment extends ResourceTracker {
  constructor(iconId, targetElement, iconUpdateCallback, positioningMode = null) {
    super(`element-attachment-${iconId}`);

    this.iconId = iconId;
    this.targetElement = targetElement;
    this.iconUpdateCallback = iconUpdateCallback; // Function to update icon position
    this.positioningMode = positioningMode || textFieldIconConfig.positioning.defaultPositioningMode;
    this.isAttached = false;

    // Cache last known positions to detect changes
    this.lastElementRect = null;
    this.lastIconPosition = null;
    this.lastViewport = null;

    // Observers and listeners
    this.resizeObserver = null;
    this.intersectionObserver = null;

    this.logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'ElementAttachment');

    this.logger.debug('ElementAttachment created for icon:', iconId, {
      positioningMode: this.positioningMode
    });
  }

  /**
   * Attach icon to target element
   */
  attach() {
    if (this.isAttached) {
      this.logger.warn('ElementAttachment already attached for icon:', this.iconId);
      return;
    }

    if (!this.targetElement || !this.targetElement.isConnected) {
      this.logger.error('Cannot attach: target element is invalid or not connected');
      return;
    }

    this.logger.debug('Attaching icon to element:', {
      iconId: this.iconId,
      elementTag: this.targetElement.tagName
    });

    // Store initial element position and calculate initial icon position
    this.updateElementRect();
    this.updateViewportInfo();

    // Calculate and store initial position to maintain consistency
    const initialPosition = PositionCalculator.calculateOptimalPosition(
      this.targetElement,
      null,
      {
        checkCollisions: true,
        positioningMode: this.positioningMode
      }
    );
    this.lastIconPosition = initialPosition;

    // Setup observers and listeners
    this.setupResizeObserver();
    this.setupIntersectionObserver();
    this.setupSmoothScrollFollowing();

    this.isAttached = true;
    this.logger.debug('ElementAttachment attached successfully with initial placement:', initialPosition.placement);
  }

  /**
   * Detach icon from element and cleanup resources
   */
  detach() {
    if (!this.isAttached) {
      return;
    }

    this.logger.debug('Detaching ElementAttachment for icon:', this.iconId);

    // Cleanup will be handled by ResourceTracker.cleanup()
    super.cleanup();
    
    this.isAttached = false;
    this.targetElement = null;
    this.iconUpdateCallback = null;
    
    this.logger.debug('ElementAttachment detached');
  }

  /**
   * Setup ResizeObserver to monitor element size changes
   */
  setupResizeObserver() {
    if (!textFieldIconConfig.attachment.resizeObserver.enabled || !window.ResizeObserver) {
      this.logger.warn('ResizeObserver disabled or not supported, falling back to periodic checks');
      return;
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this.targetElement) {
          this.logger.debug('Element size changed, updating position');
          this.throttledUpdatePosition();
          break;
        }
      }
    });

    this.resizeObserver.observe(this.targetElement);
    
    // Track with ResourceTracker for automatic cleanup
    this.trackResource('resizeObserver', () => this.resizeObserver?.disconnect());
  }

  /**
   * Setup IntersectionObserver to monitor element visibility
   */
  setupIntersectionObserver() {
    if (!textFieldIconConfig.attachment.intersectionObserver.enabled || !window.IntersectionObserver) {
      this.logger.warn('IntersectionObserver disabled or not supported');
      return;
    }

    const observerConfig = textFieldIconConfig.attachment.intersectionObserver;
    this.intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this.targetElement) {
          this.handleVisibilityChange(entry.isIntersecting);
          break;
        }
      }
    }, {
      threshold: observerConfig.threshold,
      rootMargin: observerConfig.rootMargin
    });

    this.intersectionObserver.observe(this.targetElement);

    // Track with ResourceTracker for automatic cleanup
    this.trackResource('intersectionObserver', () => this.intersectionObserver?.disconnect());
  }

  /**
   * Setup smooth scroll following listener with RequestAnimationFrame
   */
  setupSmoothScrollFollowing() {
    let rafId = null;

    const scrollHandler = () => {
      // Use RAF for smooth 60fps updates without multiple concurrent calls
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          this.smoothUpdatePosition();
          rafId = null;
        });
      }
    };

    // Use passive listener for better performance
    this.addEventListener(window, 'scroll', scrollHandler, { passive: true });

    // Also listen to document scroll for better coverage
    this.addEventListener(document, 'scroll', scrollHandler, { passive: true });

    // Track RAF for cleanup
    this.trackResource('scroll-raf', () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    });
  }


  /**
   * Handle element visibility changes
   * @param {boolean} isVisible - Whether element is visible
   */
  handleVisibilityChange(isVisible) {
    this.logger.debug('Element visibility changed:', {
      iconId: this.iconId,
      isVisible
    });

    if (!isVisible) {
      // Hide icon when element is not visible in viewport
      this.notifyIconUpdate({
        visible: false,
        reason: 'viewport-exit'
      });
    } else {
      // Show and update icon position when element becomes visible again
      this.updatePosition();
      this.notifyIconUpdate({
        visible: true,
        reason: 'viewport-enter'
      });
    }
  }

  /**
   * Update icon position with throttling (for resize events)
   */
  throttledUpdatePosition() {
    if (this.scrollThrottleId) {
      return;
    }

    this.scrollThrottleId = requestAnimationFrame(() => {
      this.updatePosition();
      this.scrollThrottleId = null;
    });
  }

  /**
   * Smooth position update for scroll following
   */
  smoothUpdatePosition() {
    if (!this.isAttached || !this.targetElement || !this.targetElement.isConnected) {
      return;
    }

    try {
      // Calculate new optimal position with high precision
      // IMPORTANT: Use checkCollisions: true to maintain consistent placement with initial position
      const newPosition = PositionCalculator.calculateOptimalPosition(
        this.targetElement,
        null, // Use default icon size
        {
          checkCollisions: true, // Keep collision detection to maintain consistent placement
          positioningMode: this.positioningMode,
          preferredPlacement: this.lastIconPosition?.placement // Prefer current placement
        }
      );

      // Always update during scroll for smooth following (lower threshold)
      if (this.hasPositionChanged(newPosition, 1)) {
        this.lastIconPosition = newPosition;
        this.updateElementRect();
        this.updateViewportInfo();


        // Notify the icon component to update immediately
        this.notifyIconUpdate({
          position: newPosition,
          positioningMode: this.positioningMode,
          reason: 'smooth-scroll-follow',
          immediate: true
        });
      }
    } catch (error) {
      this.logger.error('Error in smooth position update:', error);
    }
  }

  /**
   * Check if position has changed significantly
   * @param {Object} newPosition - New position to compare
   * @param {number} threshold - Change threshold in pixels (default: 2)
   * @returns {boolean} Whether position changed
   */
  hasPositionChanged(newPosition, threshold = 2) {
    if (!this.lastIconPosition) {
      return true;
    }

    return (
      Math.abs(newPosition.top - this.lastIconPosition.top) > threshold ||
      Math.abs(newPosition.left - this.lastIconPosition.left) > threshold ||
      newPosition.placement !== this.lastIconPosition.placement
    );
  }

  /**
   * Update icon position
   */
  updatePosition() {
    if (!this.isAttached || !this.targetElement || !this.targetElement.isConnected) {
      return;
    }

    try {
      // Calculate new optimal position with positioning mode
      const newPosition = PositionCalculator.calculateOptimalPosition(
        this.targetElement,
        null, // Use default icon size
        {
          checkCollisions: true,
          positioningMode: this.positioningMode
        }
      );

      // Check if position actually changed
      if (this.hasPositionChanged(newPosition)) {
        this.lastIconPosition = newPosition;
        this.updateElementRect();
        this.updateViewportInfo();

        this.logger.debug('Updating icon position:', {
          iconId: this.iconId,
          positioningMode: this.positioningMode,
          placement: newPosition.placement,
          position: { top: newPosition.top, left: newPosition.left }
        });

        // Notify the icon component to update
        this.notifyIconUpdate({
          position: newPosition,
          positioningMode: this.positioningMode,
          reason: 'position-update'
        });
      }
    } catch (error) {
      this.logger.error('Error updating icon position:', error);
    }
  }


  /**
   * Update cached element rect
   */
  updateElementRect() {
    if (this.targetElement && this.targetElement.getBoundingClientRect) {
      this.lastElementRect = this.targetElement.getBoundingClientRect();
    }
  }

  /**
   * Update cached viewport info
   */
  updateViewportInfo() {
    this.lastViewport = PositionCalculator.getViewportInfo();
  }

  /**
   * Notify icon component of updates
   * @param {Object} updateData - Update information
   */
  notifyIconUpdate(updateData) {
    if (typeof this.iconUpdateCallback === 'function') {
      this.iconUpdateCallback({
        iconId: this.iconId,
        ...updateData
      });
    }
  }

  /**
   * Get current attachment status and debug info
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      iconId: this.iconId,
      isAttached: this.isAttached,
      targetElement: {
        exists: !!this.targetElement,
        connected: this.targetElement?.isConnected,
        tag: this.targetElement?.tagName
      },
      observers: {
        resizeObserver: !!this.resizeObserver,
        intersectionObserver: !!this.intersectionObserver
      },
      lastPosition: this.lastIconPosition,
      lastElementRect: this.lastElementRect,
      lastViewport: this.lastViewport
    };
  }

  /**
   * Force position recalculation
   */
  forceUpdate() {
    this.logger.debug('Force updating position for icon:', this.iconId);
    this.lastIconPosition = null; // Force position change detection
    this.updatePosition();
  }
}