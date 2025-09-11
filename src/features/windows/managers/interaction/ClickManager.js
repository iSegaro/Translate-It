// src/managers/content/windows/interaction/ClickManager.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { WindowsConfig } from "../core/WindowsConfig.js";
import ResourceTracker from '@/core/memory/ResourceTracker.js';

/**
 * Manages click events and outside click detection for WindowsManager
 */
export class ClickManager extends ResourceTracker {
  constructor(crossFrameManager, state) {
    super('click-manager');
    this.logger = getScopedLogger(LOG_COMPONENTS.WINDOWS, 'ClickManager');
    this.crossFrameManager = crossFrameManager;
    this.state = state;
    
    // Event handlers
    this.onOutsideClick = null;
    this.onIconClick = null;
    
    // Click listener
    this.removeMouseDownListener = null;
    
    // Bound methods
    this._handleOutsideClick = this._handleOutsideClick.bind(this);
  }

  /**
   * Set event handlers
   */
  setHandlers(handlers) {
    this.onOutsideClick = handlers.onOutsideClick;
    this.onIconClick = handlers.onIconClick;
  }

  /**
   * Add outside click listener
   */
  addOutsideClickListener() {
    // Remove existing listener first
    this.removeOutsideClickListener();

    // Add local click listener using ResourceTracker
    this.addEventListener(document, "click", this._handleOutsideClick, { capture: true });

    // Enable cross-frame broadcasting
    this.crossFrameManager.enableGlobalClickBroadcast();
    this.crossFrameManager.requestGlobalClickRelay(true);

    // Store removal function for cross-frame cleanup
    this.removeMouseDownListener = () => {
      // ResourceTracker will handle event listener cleanup automatically
      
      // Disable cross-frame broadcasting if no active elements
      if (!this.state.hasActiveElements) {
        this.crossFrameManager.disableGlobalClickBroadcast();
        this.crossFrameManager.requestGlobalClickRelay(false);
      }
    };

    this.logger.debug('Outside click listener added');
  }

  /**
   * Remove outside click listener
   */
  removeOutsideClickListener() {
    if (this.removeMouseDownListener) {
      this.removeMouseDownListener();
      this.removeMouseDownListener = null;
    }

    // Also ensure we don't keep broadcasting when nothing is shown
    if (!this.state.hasActiveElements) {
      this.crossFrameManager.disableGlobalClickBroadcast();
    }

    this.logger.debug('Outside click listener removed');
  }

  /**
   * Handle outside click events
   */
  _handleOutsideClick(e) {
    // Prevent dismissal if transitioning from icon to window
    if (this.state.shouldPreventDismissal) {
      this.logger.debug('Outside click ignored due to pending transition');
      return;
    }

    // Check if we should dismiss based on click target
    const shouldDismiss = this._shouldDismissOnOutsideClick(e);
    
    if (shouldDismiss && this.onOutsideClick) {
      this.onOutsideClick(e);
    }
  }

  /**
   * Determine if outside click should trigger dismissal
   */
  _shouldDismissOnOutsideClick(e) {
    // Skip if currently dragging a translation window
    if (window.__TRANSLATION_WINDOW_IS_DRAGGING === true) {
      this.logger.debug('Skipping outside click check due to active window dragging');
      return false;
    }
    
    // Check if click is inside Vue UI Host (Shadow DOM contains both icons and windows)
    // Try both possible host IDs (main and iframe)
    const vueUIHostMain = document.getElementById('translate-it-host-main');
    const vueUIHostIframe = document.getElementById('translate-it-host-iframe');
    const vueUIHost = vueUIHostMain || vueUIHostIframe;
    
    this.logger.debug('Outside click check:', { 
      target: e.target.tagName, 
      vueUIHostMainExists: !!vueUIHostMain,
      vueUIHostIframeExists: !!vueUIHostIframe,
      vueUIHostExists: !!vueUIHost,
      isInsideVueHost: vueUIHost && vueUIHost.contains(e.target)
    });
    
    if (vueUIHost && vueUIHost.contains(e.target)) {
      // Click is inside Vue UI Host, don't dismiss (let Vue components handle it)
      this.logger.debug('Click is inside Vue UI Host, not dismissing');
      return false;
    }
    
    // Legacy check for old-style elements (keeping for compatibility)
    const iconElement = document.getElementById(WindowsConfig.IDS.ICON);
    if (iconElement && iconElement.contains(e.target)) {
      return false;
    }
    const windowElements = document.querySelectorAll('.translation-window');
    for (const element of windowElements) {
      if (element.contains(e.target)) {
        return false;
      }
    }
    
    // If not inside Vue UI Host or legacy elements, dismiss
    return true;
  }

  /**
   * Setup icon click handler
   */
  setupIconClickHandler(iconElement) {
    if (!iconElement) return;

    const boundIconClick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      this.logger.debug('Icon click detected');
      
      if (this.onIconClick) {
        this.onIconClick(e);
      }
    };

    this.addEventListener(iconElement, "click", boundIconClick);
    
    // Return cleanup function (ResourceTracker handles automatic cleanup)
    return () => {
      // ResourceTracker automatically handles cleanup
      this.logger.debug('Icon click handler cleanup requested');
    };
  }

  /**
   * Handle icon click with transition logic
   */
  handleIconClick(iconClickContext) {
    if (!iconClickContext) return;

    const { text, position } = iconClickContext;

    // Immediately remove outside click listener to prevent interference
    this.removeOutsideClickListener();

    // Set pending flag to prevent immediate dismissal during transition
    this.state.setPendingTranslationWindow(true);

    this.logger.debug('Icon click handled, transitioning to window', { text: text?.substring(0, 30) });

    return { text, position };
  }

  /**
   * Complete icon to window transition
   */
  completeIconTransition() {
    // Reset flags after transition delay
    setTimeout(() => {
      this.state.setPendingTranslationWindow(false);
      this.logger.debug('Icon transition completed');
    }, WindowsConfig.TIMEOUTS.PENDING_WINDOW_RESET);
  }

  /**
   * Check if click is inside specific element
   */
  isClickInsideElement(event, element) {
    if (!event || !element) return false;
    return element.contains(event.target);
  }

  /**
   * Check if click is on any UI element
   */
  isClickOnUIElement(event) {
    // Check icon
    const iconElement = document.getElementById(WindowsConfig.IDS.ICON);
    if (iconElement && this.isClickInsideElement(event, iconElement)) {
      return { type: 'icon', element: iconElement };
    }

    // Check popup windows
    const popupElements = document.querySelectorAll(`.${WindowsConfig.CSS_CLASSES.POPUP_HOST}`);
    for (const popup of popupElements) {
      if (this.isClickInsideElement(event, popup)) {
        return { type: 'popup', element: popup };
      }
    }

    return null;
  }

  /**
   * Add click listener to specific element
   */
  addElementClickListener(element, handler, options = {}) {
    if (!element || typeof handler !== 'function') return null;

    const wrappedHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    };

    this.addEventListener(element, 'click', wrappedHandler, options);
    
    // Return cleanup function (ResourceTracker handles automatic cleanup)
    return () => {
      this.logger.debug('Element click listener cleanup requested');
    };
  }

  /**
   * Setup double-click handler
   */
  setupDoubleClickHandler(element, handler) {
    if (!element || typeof handler !== 'function') return null;

    const wrappedHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    };

    this.addEventListener(element, 'dblclick', wrappedHandler);
    
    return () => {
      this.logger.debug('Double-click listener cleanup requested');
    };
  }

  /**
   * Prevent event propagation
   */
  stopPropagation(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /**
   * Get click coordinates
   */
  getClickCoordinates(event) {
    if (!event) return null;

    return {
      x: event.clientX,
      y: event.clientY,
      pageX: event.pageX,
      pageY: event.pageY
    };
  }

  /**
   * Cleanup click manager
   */
  cleanup() {
    this.removeOutsideClickListener();
    this.onOutsideClick = null;
    this.onIconClick = null;
    
    // Call ResourceTracker cleanup for automatic resource management
    super.cleanup();
    
    this.logger.debug('ClickManager cleanup completed');
  }
}