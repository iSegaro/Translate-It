// src/managers/content/windows/animation/AnimationManager.js

import { createLogger } from "../../../../utils/core/logger.js";
import { WindowsConfig } from "../core/WindowsConfig.js";

/**
 * Manages animations for icons and windows
 */
export class AnimationManager {
  constructor() {
    this.logger = createLogger('Content', 'AnimationManager');
  }

  /**
   * Animate icon appearance
   */
  animateIconIn(iconElement, delay = WindowsConfig.ANIMATION.ICON_ANIMATION.DELAY) {
    if (!iconElement) return Promise.resolve();

    return new Promise((resolve) => {
      // Set initial state
      iconElement.style.opacity = "0";
      iconElement.style.transform = "scale(0.5)";
      iconElement.style.transformOrigin = "bottom center";
      iconElement.style.transition = `opacity ${WindowsConfig.ANIMATION.ICON_ANIMATION.DURATION}ms ease-out, transform ${WindowsConfig.ANIMATION.ICON_ANIMATION.DURATION}ms ${WindowsConfig.ANIMATION.ICON_ANIMATION.EASING}`;

      // Trigger animation after delay
      setTimeout(() => {
        if (iconElement && iconElement.isConnected) {
          iconElement.style.opacity = "1";
          iconElement.style.transform = "scale(1)";
          
          // Resolve after animation completes
          setTimeout(() => {
            resolve();
          }, WindowsConfig.ANIMATION.ICON_ANIMATION.DURATION);
        } else {
          resolve();
        }
      }, delay);
    });
  }

  /**
   * Animate icon disappearance
   */
  animateIconOut(iconElement, duration = WindowsConfig.TIMEOUTS.ICON_CLEANUP) {
    if (!iconElement) return Promise.resolve();

    return new Promise((resolve) => {
      // Apply fade out animation
      iconElement.style.opacity = "0";
      iconElement.style.transform = "scale(0.5)";

      setTimeout(() => {
        if (iconElement && iconElement.parentNode) {
          iconElement.remove();
        }
        resolve();
      }, duration);
    });
  }

  /**
   * Animate window appearance
   */
  animateWindowIn(windowElement, fadeInDuration = WindowsConfig.ANIMATION.FADE_IN_DURATION) {
    if (!windowElement) return Promise.resolve();

    return new Promise((resolve) => {
      // Ensure initial transform is applied
      requestAnimationFrame(() => {
        if (windowElement && windowElement.isConnected) {
          windowElement.style.opacity = "0.95";
          windowElement.style.transform = "scale(1)";
          
          setTimeout(() => {
            resolve();
          }, fadeInDuration);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Animate window disappearance
   */
  animateWindowOut(windowElement, fadeOutDuration = WindowsConfig.ANIMATION.FADE_OUT_DURATION) {
    if (!windowElement) return Promise.resolve();

    return new Promise((resolve) => {
      // Apply fade out styles
      windowElement.style.transition = `opacity ${fadeOutDuration}ms ease-in-out, transform 0.1s ease-in`;
      windowElement.style.opacity = "0";
      windowElement.style.transform = "scale(0.5)";

      // Set up fallback timeout
      const fallbackTimeout = setTimeout(() => {
        this.logger.warn('Animation fallback timeout triggered');
        resolve();
      }, fadeOutDuration + 50);

      // Listen for transition end
      const handleTransitionEnd = () => {
        clearTimeout(fallbackTimeout);
        windowElement.removeEventListener('transitionend', handleTransitionEnd);
        resolve();
      };

      windowElement.addEventListener('transitionend', handleTransitionEnd, { once: true });
    });
  }

  /**
   * Set loading animation styles
   */
  setupLoadingAnimation(loadingContainer) {
    if (!loadingContainer) return;

    // Loading animation styles are handled by CSS
    // This method can be extended for more complex loading animations
    this.logger.debug('Loading animation setup completed');
  }

  /**
   * Remove all animations from element
   */
  removeAnimations(element) {
    if (!element) return;

    element.style.transition = 'none';
    element.style.animation = 'none';
    element.style.transform = '';
    
    // Force reflow to ensure styles are applied
    element.offsetHeight;
  }

  /**
   * Apply hover animation styles
   */
  setupHoverAnimation(element) {
    if (!element) return;

    // Add CSS class for hover effects instead of inline styles
    element.classList.add('animated-hover');
    
    // Define hover styles programmatically if needed
    const style = document.createElement('style');
    style.textContent = `
      .animated-hover {
        transition: all 0.2s ease-in-out;
      }
      .animated-hover:hover {
        transform: scale(1.05);
        filter: brightness(1.1);
      }
    `;
    
    // Add to shadow root if element has one, otherwise to document head
    if (element.shadowRoot) {
      element.shadowRoot.appendChild(style);
    } else {
      document.head.appendChild(style);
    }
  }

  /**
   * Setup drag animation feedback
   */
  setupDragAnimation(dragHandle) {
    if (!dragHandle) return;

    const originalOpacity = dragHandle.style.opacity || '0.8';
    
    const startDrag = () => {
      dragHandle.style.opacity = '1';
      dragHandle.style.cursor = 'grabbing';
    };
    
    const endDrag = () => {
      dragHandle.style.opacity = originalOpacity;
      dragHandle.style.cursor = 'move';
    };

    return { startDrag, endDrag };
  }

  /**
   * Animate copy feedback
   */
  animateCopyFeedback(copyElement) {
    if (!copyElement) return Promise.resolve();

    return new Promise((resolve) => {
      const originalOpacity = copyElement.style.opacity || '1';
      copyElement.style.opacity = '0.5';
      
      setTimeout(() => {
        if (copyElement && copyElement.isConnected) {
          copyElement.style.opacity = originalOpacity;
        }
        resolve();
      }, 150);
    });
  }

  /**
   * Create pulse animation for loading states
   */
  createPulseAnimation(element, duration = 1000) {
    if (!element) return;

    const pulseKeyframes = [
      { opacity: 0.6, transform: 'scale(1)' },
      { opacity: 1, transform: 'scale(1.02)' },
      { opacity: 0.6, transform: 'scale(1)' }
    ];

    const pulseOptions = {
      duration: duration,
      iterations: Infinity,
      easing: 'ease-in-out'
    };

    const animation = element.animate(pulseKeyframes, pulseOptions);
    
    return animation;
  }

  /**
   * Stop all animations on element
   */
  stopAnimations(element) {
    if (!element) return;

    // Stop CSS animations
    element.style.animation = 'none';
    
    // Stop Web Animations API animations
    const animations = element.getAnimations();
    animations.forEach(animation => {
      animation.cancel();
    });

    this.logger.debug('Stopped all animations on element');
  }
}