// DOM Helpers Utilities - Reusable DOM manipulation utilities

/**
 * Check if element is still connected to the DOM
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} Whether element is connected
 */
export function isElementConnected(element) {
  try {
    return element && element.isConnected && document.contains(element);
  } catch (error) {
    return false;
  }
}

/**
 * Find the closest parent element matching a selector
 * @param {HTMLElement} element - Starting element
 * @param {string} selector - CSS selector to match
 * @returns {HTMLElement|null} Closest matching parent or null
 */
export function closestParent(element, selector) {
  if (!element || !selector) return null;
  
  let current = element.parentElement;
  while (current) {
    if (current.matches(selector)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Get all text nodes within an element
 * @param {HTMLElement} element - Element to search within
 * @returns {Node[]} Array of text nodes
 */
export function getTextNodes(element) {
  if (!element) return [];
  
  const textNodes = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }
  
  return textNodes;
}

/**
 * Check if element is visible in viewport
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} Whether element is visible
 */
export function isElementVisible(element) {
  if (!element) return false;
  
  try {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  } catch (error) {
    return false;
  }
}

/**
 * Scroll element into view smoothly
 * @param {HTMLElement} element - Element to scroll to
 * @param {Object} options - Scroll options
 */
export function scrollToElement(element, options = {}) {
  if (!element) return;
  
  const {
    behavior = 'smooth',
    block = 'center',
    inline = 'center'
  } = options;
  
  element.scrollIntoView({ behavior, block, inline });
}

/**
 * Add CSS class to element with optional condition
 * @param {HTMLElement} element - Element to modify
 * @param {string} className - CSS class to add
 * @param {boolean} condition - Whether to add the class
 */
export function addClassConditionally(element, className, condition = true) {
  if (!element) return;
  
  if (condition) {
    element.classList.add(className);
  } else {
    element.classList.remove(className);
  }
}

/**
 * Remove CSS class from element
 * @param {HTMLElement} element - Element to modify
 * @param {string} className - CSS class to remove
 */
export function removeClass(element, className) {
  if (!element) return;
  element.classList.remove(className);
}

/**
 * Toggle CSS class on element
 * @param {HTMLElement} element - Element to modify
 * @param {string} className - CSS class to toggle
 * @param {boolean} force - Whether to force add or remove
 */
export function toggleClass(element, className, force) {
  if (!element) return;
  element.classList.toggle(className, force);
}

/**
 * Get computed style value for element
 * @param {HTMLElement} element - Element to get style from
 * @param {string} property - CSS property name
 * @returns {string} Computed style value
 */
export function getComputedStyleValue(element, property) {
  if (!element || !property) return '';
  
  try {
    const style = window.getComputedStyle(element);
    return style.getPropertyValue(property);
  } catch (error) {
    return '';
  }
}

/**
 * Set multiple CSS styles on element
 * @param {HTMLElement} element - Element to style
 * @param {Object} styles - Object of CSS properties and values
 */
export function setStyles(element, styles) {
  if (!element || !styles) return;
  
  Object.entries(styles).forEach(([property, value]) => {
    if (value !== null && value !== undefined) {
      element.style[property] = value;
    }
  });
}

/**
 * Get element's position relative to document
 * @param {HTMLElement} element - Element to get position of
 * @returns {Object} Position object with top, left, width, height
 */
export function getElementPosition(element) {
  if (!element) return { top: 0, left: 0, width: 0, height: 0 };
  
  try {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top + window.pageYOffset,
      left: rect.left + window.pageXOffset,
      width: rect.width,
      height: rect.height
    };
  } catch (error) {
    return { top: 0, left: 0, width: 0, height: 0 };
  }
}

/**
 * Check if element has specified CSS class
 * @param {HTMLElement} element - Element to check
 * @param {string} className - CSS class to check for
 * @returns {boolean} Whether element has the class
 */
export function hasClass(element, className) {
  if (!element) return false;
  return element.classList.contains(className);
}

/**
 * Wait for element to be available in DOM
 * @param {string} selector - CSS selector to wait for
 * @param {number} timeout - Maximum time to wait in ms
 * @returns {Promise<HTMLElement>} Promise that resolves to element
 */
export function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

/**
 * Create a unique ID for an element
 * @param {HTMLElement} element - Element to generate ID for
 * @returns {string} Unique element ID
 */
export function generateElementId(element) {
  if (!element) return 'invalid';
  
  try {
    // Use a combination of properties for a unique-ish ID
    const id = element.id ? `id_${element.id}` : '';
    const className = element.className ? `class_${element.className}` : '';
    const tag = element.tagName ? `tag_${element.tagName}` : '';
    const position = element.getBoundingClientRect
      ? `pos_${Math.round(element.getBoundingClientRect().top)}_${Math.round(element.getBoundingClientRect().left)}`
      : '';
    
    return `${id}_${className}_${tag}_${position}_${Math.random().toString(36).substr(2, 9)}`;
  } catch (error) {
    // Fallback to simple ID
    return `element_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Check if element is focusable
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} Whether element is focusable
 */
export function isFocusable(element) {
  if (!element) return false;
  
  const focusableSelectors = [
    'a[href]',
    'area[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button:not([disabled])',
    'iframe',
    'object',
    'embed',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable]'
  ];
  
  return element.matches(focusableSelectors.join(', '));
}

/**
 * Focus element safely with error handling
 * @param {HTMLElement} element - Element to focus
 */
export function safeFocus(element) {
  if (!element) return;
  
  try {
    if (isFocusable(element)) {
      element.focus();
    }
  } catch (error) {
    // Silently fail focus operations
  }
}

/**
 * Blur element safely with error handling
 * @param {HTMLElement} element - Element to blur
 */
export function safeBlur(element) {
  if (!element) return;
  
  try {
    element.blur();
  } catch (error) {
    // Silently fail blur operations
  }
}
