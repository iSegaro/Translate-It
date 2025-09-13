// ToastElementDetector - Centralized Vue Sonner element detection
import { TOAST_SELECTORS, TOAST_ELEMENT_QUERIES, EXTENSION_SELECTORS } from './constants.js';

export class ToastElementDetector {
  /**
   * Check if element belongs to Vue Sonner toast system
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element is part of toast system
   */
  static isToastElement(element) {
    if (!element || !element.hasAttribute) return false;
    
    // Check data attributes
    if (element.hasAttribute(TOAST_SELECTORS.TOASTER) ||
        element.hasAttribute(TOAST_SELECTORS.TOAST) ||
        element.hasAttribute(TOAST_SELECTORS.BUTTON) ||
        element.hasAttribute(TOAST_SELECTORS.ACTION)) {
      return true;
    }
    
    // Check CSS classes
    if (element.classList && (
        element.classList.contains(TOAST_SELECTORS.TOASTER_CLASS) ||
        element.classList.contains(TOAST_SELECTORS.TOAST_CLASS)
    )) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if element is within any toast notification using DOM traversal
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element is within toast
   */
  static isWithinToast(element) {
    if (!element) return false;
    
    // Check if element itself is a toast
    if (this.isToastElement(element)) {
      return true;
    }
    
    // Check using closest() method
    for (const selector of TOAST_ELEMENT_QUERIES.CONTAINERS) {
      if (element.closest && element.closest(selector)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if element is within any toast using event path
   * @param {Event} event - Event object with composedPath
   * @returns {boolean} Whether click is within toast
   */
  static isEventWithinToast(event) {
    if (!event) return false;
    
    const path = event.composedPath ? event.composedPath() : [event.target];
    
    return path.some(element => {
      if (!element.hasAttribute) return false;
      
      return (
        element.hasAttribute(TOAST_SELECTORS.TOASTER) ||
        element.hasAttribute(TOAST_SELECTORS.TOAST) ||
        (element.classList && (
          element.classList.contains(TOAST_SELECTORS.TOASTER_CLASS) ||
          element.classList.contains(TOAST_SELECTORS.TOAST_CLASS)
        ))
      );
    });
  }
  
  /**
   * Check if element or its path contains cancel action
   * @param {Event} event - Event object
   * @returns {boolean} Whether cancel button is clicked
   * @deprecated This method is deprecated. Use ToastEventHandler.isCancelButtonClickDirect() instead.
   */
  static isCancelButtonClick(event) {
    if (!event) return false;
    
    // Simple fallback - check event properties if they exist
    if (event._isCancelAction) {
      return true;
    }
    
    // Basic text-based fallback for backward compatibility
    const path = event.composedPath ? event.composedPath() : [event.target];
    return path.some(element => {
      if (element.textContent) {
        const text = element.textContent.trim();
        return text.includes('Cancel') || text.includes('کنسل');
      }
      return false;
    });
  }
  
  /**
   * Check if element belongs to our extension (should be excluded from highlighting)
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element should be excluded
   */
  static isExtensionElement(element) {
    if (!element || typeof element.hasAttribute !== 'function') return false;
    
    // Check if element has our internal classes
    if (element.classList && (
      element.classList.contains(EXTENSION_SELECTORS.HIGHLIGHTED_CLASS) ||
      element.classList.contains(EXTENSION_SELECTORS.CONTAINER_CLASS)
    )) {
      return true;
    }
    
    // Check if element has our data attributes
    if (element.hasAttribute('data-translate-it-highlighted') ||
        element.hasAttribute('data-translate-id') ||
        element.hasAttribute('data-translate-highlighted')) {
      return true;
    }
    
    // Check if element is inside our Shadow DOM
    let currentElement = element;
    while (currentElement) {
      if (currentElement.classList && 
          currentElement.classList.contains(EXTENSION_SELECTORS.CONTAINER_CLASS)) {
        return true;
      }
      
      // Check if we've reached the shadow root host
      if (currentElement.host) {
        if (currentElement.host.id && currentElement.host.id.includes('translate-it')) {
          return true;
        }
      }
      
      // Move up to parent, but handle Shadow DOM boundary
      currentElement = currentElement.parentElement || currentElement.parentNode?.host;
    }
    
    return false;
  }
  
  /**
   * Comprehensive check - is element part of toast system OR extension elements
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element should be excluded from selection
   */
  static shouldExcludeFromSelection(element) {
    try {
      return this.isWithinToast(element) || this.isExtensionElement(element);
    } catch (error) {
      // If any error occurs during element checking, exclude the element to be safe
      return true;
    }
  }
}