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
  constructor(iconId, targetElement, iconUpdateCallback) {
    super(`element-attachment-${iconId}`);
    
    this.iconId = iconId;
    this.targetElement = targetElement;
    this.iconUpdateCallback = iconUpdateCallback; // Function to update icon position
    this.isAttached = false;
    
    // Cache last known positions to detect changes
    this.lastElementRect = null;
    this.lastIconPosition = null;
    this.lastViewport = null;
    
    // Observers and listeners
    this.resizeObserver = null;
    this.intersectionObserver = null;
    this.scrollThrottleId = null;
    
    // Configuration from config file
    this.updateThrottle = textFieldIconConfig.attachment.updateThrottle;
    
    this.logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'ElementAttachment');
    
    this.logger.debug('ElementAttachment created for icon:', iconId);
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

    // Store initial element position
    this.updateElementRect();
    this.updateViewportInfo();
    
    // Setup observers and listeners
    this.setupResizeObserver();
    this.setupIntersectionObserver();
    this.setupScrollDismissListener();
    
    this.isAttached = true;
    this.logger.debug('ElementAttachment attached successfully');
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
   * Setup scroll listener to dismiss icon on scroll
   */
  setupScrollDismissListener() {
    const scrollHandler = () => {
      this.logger.debug('Page scrolled, dismissing icon:', this.iconId);
      this.notifyIconUpdate({
        visible: false,
        reason: 'scroll-dismiss'
      });
    };

    // Use passive listener for better performance
    this.addEventListener(window, 'scroll', scrollHandler, { passive: true });
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
      // Hide icon when element is not visible
      this.notifyIconUpdate({
        visible: false,
        reason: 'element-hidden'
      });
    } else {
      // Show and update icon position when element becomes visible
      this.updatePosition();
      this.notifyIconUpdate({
        visible: true,
        reason: 'element-visible'
      });
    }
  }

  /**
   * Update icon position with throttling
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
   * Update icon position
   */
  updatePosition() {
    if (!this.isAttached || !this.targetElement || !this.targetElement.isConnected) {
      return;
    }

    try {
      // Calculate new optimal position
      const newPosition = PositionCalculator.calculateOptimalPosition(
        this.targetElement,
        null, // Use default icon size
        { checkCollisions: true }
      );

      // Check if position actually changed
      if (this.hasPositionChanged(newPosition)) {
        this.lastIconPosition = newPosition;
        this.updateElementRect();
        this.updateViewportInfo();
        
        this.logger.debug('Updating icon position:', {
          iconId: this.iconId,
          placement: newPosition.placement,
          position: { top: newPosition.top, left: newPosition.left }
        });

        // Notify the icon component to update
        this.notifyIconUpdate({
          position: newPosition,
          reason: 'position-update'
        });
      }
    } catch (error) {
      this.logger.error('Error updating icon position:', error);
    }
  }


  /**
   * Check if position has changed significantly
   * @param {Object} newPosition - New position to compare
   * @returns {boolean} Whether position changed
   */
  hasPositionChanged(newPosition) {
    if (!this.lastIconPosition) {
      return true;
    }

    const threshold = 2; // pixels
    return (
      Math.abs(newPosition.top - this.lastIconPosition.top) > threshold ||
      Math.abs(newPosition.left - this.lastIconPosition.left) > threshold ||
      newPosition.placement !== this.lastIconPosition.placement
    );
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