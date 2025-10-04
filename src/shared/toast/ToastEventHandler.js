// ToastEventHandler - Event interception and handling for toast integration
import { ToastElementDetector } from './ToastElementDetector.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

export class ToastEventHandler {
  constructor(eventBus = null) {
    this.eventBus = eventBus;
    this.logger = getScopedLogger(LOG_COMPONENTS.NOTIFICATIONS, 'ToastEventHandler');
    this.isEnabled = false;
    this.clickHandler = null;
    this.isProcessingClick = false;
  }
  
  /**
   * Enable toast event interception
   * @param {Object} options - Configuration options
   * @param {Function} options.onCancelClick - Callback for cancel button clicks
   * @param {Function} options.onToastClick - Callback for any toast click
   */
  enable(options = {}) {
    if (this.isEnabled) {
      this.logger.debug('[ToastHandler] Already enabled');
      return;
    }
    
    this.onCancelClick = options.onCancelClick;
    this.onToastClick = options.onToastClick;
    
    this.clickHandler = (event) => this.handleClick(event);
    
    // Use capture phase to intercept before other handlers
    document.addEventListener('click', this.clickHandler, { capture: true });
    
    this.isEnabled = true;
    this.logger.info('[ToastHandler] Event handler enabled');
    this.logger.debug('Handler configuration', {
      hasCancelCallback: !!options.onCancelClick,
      hasToastCallback: !!options.onToastClick
    });
  }
  
  /**
   * Disable toast event interception
   */
  disable() {
    if (!this.isEnabled) {
      return;
    }
    
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler, { capture: true });
      this.clickHandler = null;
    }
    
    this.isEnabled = false;
    this.logger.info('[ToastHandler] Event handler disabled');
  }
  
  /**
   * Handle click events - intercept toast clicks
   * @param {Event} event - Click event
   */
  handleClick(event) {
    // Prevent duplicate processing
    if (this.isProcessingClick) {
      return false;
    }
    
    const target = event.target;
    const path = event.composedPath ? event.composedPath() : [target];
    
    // Check if click is within toast
    const isInToast = ToastElementDetector.isEventWithinToast(event);
    
    if (!isInToast) {
      // Not a toast click, let it pass through
      return;
    }
    
    this.isProcessingClick = true;
    
    this.logger.debug('[ToastHandler] Click detected:', {
      targetTag: target.tagName,
      targetClass: target.className,
      targetText: target.textContent?.slice(0, 20),
      hasHighlightClass: target.classList?.contains('translate-it-element-highlighted'),
      pathLength: path.length
    });
    
    // Prevent the click from reaching other handlers
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    // Check if it's a cancel button click using direct detection
    const isCancelButton = this.isCancelButtonClickDirect(event);
    
    if (isCancelButton) {
      this.logger.info('[ToastHandler] Cancel button clicked');
      
      if (this.onCancelClick) {
        this.onCancelClick(event);
      }
      
      // Note: Don't emit cancel-select-element-mode event here to avoid duplicates
      // The event will be emitted by the onCancelClick callback in ContentApp
    } else {
      this.logger.debug('[ToastHandler] General toast click (non-cancel)');
      
      if (this.onToastClick) {
        this.onToastClick(event);
      }
    }
    
    // Reset processing flag after a short delay
    setTimeout(() => {
      this.isProcessingClick = false;
    }, 100);
    
    return false;
  }
  
  /**
   * Check if a specific event should be intercepted
   * @param {Event} event - Event to check
   * @returns {boolean} Whether event should be intercepted
   */
  shouldInterceptEvent(event) {
    return ToastElementDetector.isEventWithinToast(event);
  }
  
  /**
   * Direct cancel button detection without relying on external detectors
   * @param {Event} event - Click event
   * @returns {boolean} Whether this is a cancel button click
   */
  isCancelButtonClickDirect(event) {
    const path = event.composedPath ? event.composedPath() : [event.target];
    
    this.logger.debug('[ToastHandler] Checking for cancel button:', {
      pathLength: path.length,
      firstElement: path[0] ? {
        tagName: path[0].tagName,
        className: path[0].className,
        hasHighlightClass: path[0].classList?.contains('translate-it-element-highlighted')
      } : null
    });
    
    return path.some(element => {
      // Skip non-element nodes
      if (!element || !element.hasAttribute) {
        return false;
      }
      
      // Check if element is a Vue Sonner action button
      if (element.hasAttribute('data-button') && 
          element.hasAttribute('data-action')) {
        
        this.logger.debug('[ToastHandler] Found action button:', {
          tagName: element.tagName,
          textContent: element.textContent?.trim(),
          isFirstChild: element.parentElement?.children[0] === element
        });
        
        // Check if this is the first/only action button (which is usually cancel)
        const toastContainer = element.closest('[data-sonner-toast]');
        if (toastContainer) {
          const actionButtons = toastContainer.querySelectorAll('[data-button][data-action]');
          if (actionButtons.length > 0 && actionButtons[0] === element) {
            this.logger.debug('[ToastHandler] Cancel button detected via first action');
            return true;
          }
        }
        
        // Alternative: check if this is a button with typical cancel behavior
        if (element.tagName === 'BUTTON' || element.tagName === 'A') {
          // Check button role or typical cancel attributes
          if (element.getAttribute('role') === 'button' || 
              element.textContent?.trim().toLowerCase().includes('cancel') ||
              element.textContent?.trim().includes('کنسل')) {
            this.logger.debug('[ToastHandler] Cancel button via characteristics');
            return true;
          }
        }
        
        // Fallback: check if the button has cancel-like text content
        if (element.textContent) {
          const text = element.textContent.trim();
          if (text.includes('Cancel') || text.includes('کنسل')) {
            this.logger.debug('[ToastHandler] Cancel button via text fallback');
            return true;
          }
        }
      }
      
      // Also check for button elements that might not have the data attributes yet
      if (element.tagName === 'BUTTON' || element.tagName === 'A') {
        const text = element.textContent?.trim() || '';
        if (text.includes('Cancel') || text.includes('کنسل')) {
          // Verify this button is within a toast context
          const parentToast = element.closest('[data-sonner-toast], .sonner-toast, [data-testid="toaster"]');
          if (parentToast) {
            this.logger.debug('[ToastHandler] Cancel button via tag and text');
            return true;
          }
        }
      }
      
      return false;
    });
  }
  
  /**
   * Get current state
   * @returns {Object} Current state information
   */
  getState() {
    return {
      isEnabled: this.isEnabled,
      hasClickHandler: !!this.clickHandler,
      hasEventBus: !!this.eventBus,
      hasCancelCallback: !!this.onCancelClick,
      hasToastCallback: !!this.onToastClick
    };
  }
}