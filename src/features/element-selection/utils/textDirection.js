// Text Direction Utilities for Element Selection
// Dedicated text direction detection and styling for Select Element feature
// Independent from shared utilities

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'textDirection');

/**
 * Regular expressions for RTL text detection
 */
const RTL_PATTERNS = {
  // Arabic and Hebrew script ranges
  ARABIC_HEBREW: /[\u0590-\u083F]|[\u08A0-\u08FF]|[\uFB1D-\uFDFF]|[\uFE70-\uFEFF]/,

  // More comprehensive RTL detection including Persian, Urdu, etc.
  COMPREHENSIVE: /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/,

  // Specific language patterns
  ARABIC: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/,
  HEBREW: /[\u0590-\u05FF\uFB1D-\uFB4F]/,
  PERSIAN: /[\u0600-\u06FF]/,  // Complete Persian/Arabic Unicode range
};

/**
 * Detect if text contains RTL characters
 * @param {string} text - Text to analyze
 * @param {Object} options - Detection options
 * @returns {boolean} Whether text contains RTL characters
 */
export function isRTLText(text, options = {}) {
  const {
    comprehensive = true,
    threshold = 0.1, // Minimum ratio of RTL characters to consider text as RTL (reduced from 0.3)
    targetLanguage = null, // Optional: target language for better detection
    simpleDetection = false // If true, any RTL character makes it RTL
  } = options;

  if (!text || typeof text !== 'string') {
    return false;
  }

  // For Persian/Arabic target languages, use more sensitive detection
  if (targetLanguage && ['fa', 'ar', 'ur', 'he'].includes(targetLanguage)) {
    // Use simple detection for RTL target languages - any RTL character makes it RTL
    const rtlPattern = comprehensive ? RTL_PATTERNS.COMPREHENSIVE : RTL_PATTERNS.ARABIC_HEBREW;
    if (rtlPattern.test(text)) {
      logger.debug(`RTL detected by target language (${targetLanguage}): using simple detection`);
      return true;
    }
  }

  const pattern = comprehensive ? RTL_PATTERNS.COMPREHENSIVE : RTL_PATTERNS.ARABIC_HEBREW;

  if (threshold <= 0 || simpleDetection) {
    // Simple detection - any RTL character makes it RTL
    return pattern.test(text);
  }

  // Threshold-based detection
  const rtlMatches = text.match(pattern);
  if (!rtlMatches) return false;

  const rtlCharCount = rtlMatches.length;
  const totalChars = text.replace(/\s/g, '').length; // Exclude whitespace

  if (totalChars === 0) return false;

  const rtlRatio = rtlCharCount / totalChars;
  const isRTL = rtlRatio >= threshold;

  logger.debug(`RTL detection: ${rtlCharCount}/${totalChars} (${(rtlRatio * 100).toFixed(1)}%) - ${isRTL ? 'RTL' : 'LTR'}`);

  return isRTL;
}

/**
 * Get the appropriate text direction for given text
 * @param {string} text - Text to analyze
 * @param {Object} options - Detection options
 * @returns {string} 'rtl' or 'ltr'
 */
export function getTextDirection(text, options = {}) {
  return isRTLText(text, options) ? 'rtl' : 'ltr';
}

/**
 * Apply correct text direction to an element
 * @param {HTMLElement} element - Element to style
 * @param {string} text - Text content for direction detection
 * @param {Object} options - Styling options
 */
export function correctTextDirection(element, text, options = {}) {
  const {
    setTextAlign = true,
    addClasses = true,
    preserveExisting = false,
    detectOptions = {},
    useWrapperElement = true  // New option to use wrapper elements instead of direct styling
  } = options;

  if (!element || !text) {
    logger.warn('correctTextDirection: Invalid element or text provided');
    return;
  }

  // Store original styles if preserving
  if (preserveExisting && !element.dataset.aiwcOriginalDirection) {
    storeOriginalElementStyles(element);
  }

  const direction = getTextDirection(text, detectOptions);
  const isRTL = direction === 'rtl';

  // If using wrapper element approach, create a wrapper and apply styles to it
  if (useWrapperElement && element.parentNode) {
    // Check if element is already wrapped
    if (!element.parentNode.classList.contains('aiwc-translation-wrapper')) {
      const wrapper = document.createElement('span');
      wrapper.className = 'aiwc-translation-wrapper';
      wrapper.dataset.aiwcDirection = direction;

      // Move the element inside the wrapper
      element.parentNode.insertBefore(wrapper, element);
      wrapper.appendChild(element);

      // Apply direction classes to wrapper instead of element
      if (addClasses) {
        wrapper.classList.add(isRTL ? 'aiwc-rtl-text' : 'aiwc-ltr-text');
      }
    } else {
      // Update existing wrapper
      const wrapper = element.parentNode;
      wrapper.dataset.aiwcDirection = direction;
      if (addClasses) {
        wrapper.classList.remove('aiwc-rtl-text', 'aiwc-ltr-text');
        wrapper.classList.add(isRTL ? 'aiwc-rtl-text' : 'aiwc-ltr-text');
      }
    }
  } else {
    // Legacy approach: apply styles directly to element
    // Apply direction only if it doesn't conflict with existing styles
    const currentStyle = window.getComputedStyle(element);
    if (!currentStyle.direction || currentStyle.direction === 'ltr' || !preserveExisting) {
      element.style.direction = direction;
    }

    // Apply text alignment only if needed
    if (setTextAlign) {
      if (!currentStyle.textAlign || currentStyle.textAlign === 'start' || !preserveExisting) {
        element.style.textAlign = isRTL ? 'right' : 'left';
      }
    }

    // Add CSS classes for styling
    if (addClasses) {
      element.classList.remove('aiwc-rtl-text', 'aiwc-ltr-text');
      element.classList.add(isRTL ? 'aiwc-rtl-text' : 'aiwc-ltr-text');
    }
  }

  logger.debug(`Applied ${direction} direction to element:`, {
    tagName: element.tagName,
    className: element.className,
    textLength: text.length,
    textPreview: text.substring(0, 30) + (text.length > 30 ? '...' : ''),
    useWrapper: useWrapperElement
  });
}

/**
 * Store original element styles for later restoration
 * @param {HTMLElement} element - Element to store styles for
 */
export function storeOriginalElementStyles(element) {
  if (!element) return;

  // Store direction
  if (!element.dataset.aiwcOriginalDirection) {
    element.dataset.aiwcOriginalDirection = element.style.direction || '';
  }

  // Store text-align
  if (!element.dataset.aiwcOriginalTextAlign) {
    element.dataset.aiwcOriginalTextAlign = element.style.textAlign || '';
  }

  // Store classes
  if (!element.dataset.aiwcOriginalClasses) {
    element.dataset.aiwcOriginalClasses = element.className || '';
  }
}

/**
 * Restore original element styles
 * @param {HTMLElement} element - Element to restore styles for
 */
export function restoreOriginalElementStyles(element) {
  if (!element) return;

  // Check if element is wrapped
  const wrapper = element.parentNode;
  if (wrapper && wrapper.classList.contains('aiwc-translation-wrapper')) {
    // Move element out of wrapper and remove wrapper
    const parent = wrapper.parentNode;
    if (parent) {
      parent.insertBefore(element, wrapper);
      wrapper.remove();
    }
  }

  // Restore direction
  if (element.dataset.aiwcOriginalDirection !== undefined) {
    element.style.direction = element.dataset.aiwcOriginalDirection;
    delete element.dataset.aiwcOriginalDirection;
  }

  // Restore text-align
  if (element.dataset.aiwcOriginalTextAlign !== undefined) {
    element.style.textAlign = element.dataset.aiwcOriginalTextAlign;
    delete element.dataset.aiwcOriginalTextAlign;
  }

  // Remove direction classes
  element.classList.remove('aiwc-rtl-text', 'aiwc-ltr-text', 'aiwc-translated-text');

  // Optionally restore original classes (usually not needed for direction)
  if (element.dataset.aiwcOriginalClasses !== undefined) {
    delete element.dataset.aiwcOriginalClasses;
  }
}

/**
 * Apply text direction styling to parent element
 * @param {HTMLElement} parentElement - Parent element to style
 * @param {string} text - Text content for direction detection
 * @param {Object} options - Styling options
 */
export function applyTextDirectionToParent(parentElement, text, options = {}) {
  const { preserveOriginal = true } = options;

  if (!parentElement || !text) {
    return;
  }

  if (preserveOriginal) {
    storeOriginalParentStyles(parentElement);
  }

  correctTextDirection(parentElement, text, {
    ...options,
    preserveExisting: false // Already handled above
  });
}

/**
 * Store original parent styles (legacy compatibility)
 * @param {HTMLElement} parentElement - Parent element
 */
export function storeOriginalParentStyles(parentElement) {
  storeOriginalElementStyles(parentElement);
}

/**
 * Restore original parent styles (legacy compatibility)
 * @param {HTMLElement} parentElement - Parent element
 */
export function restoreOriginalParentStyles(parentElement) {
  restoreOriginalElementStyles(parentElement);
}

/**
 * Detect text direction for multiple texts and return most common
 * @param {string[]} texts - Array of texts to analyze
 * @param {Object} options - Detection options
 * @returns {string} Most common direction ('rtl' or 'ltr')
 */
export function detectBulkTextDirection(texts, options = {}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return 'ltr';
  }

  let rtlCount = 0;
  let ltrCount = 0;

  texts.forEach(text => {
    if (isRTLText(text, options)) {
      rtlCount++;
    } else {
      ltrCount++;
    }
  });

  const direction = rtlCount > ltrCount ? 'rtl' : 'ltr';

  logger.debug(`Bulk direction detection: ${rtlCount} RTL, ${ltrCount} LTR → ${direction}`);

  return direction;
}

/**
 * Create direction-aware container element
 * @param {string} text - Text content for direction detection
 * @param {Object} options - Container options
 * @returns {HTMLElement} Container element with proper direction
 */
export function createDirectionAwareContainer(text, options = {}) {
  const {
    tagName = 'span',
    className = '',
    id = '',
    detectOptions = {}
  } = options;

  const container = document.createElement(tagName);

  if (className) {
    container.className = className;
  }

  if (id) {
    container.id = id;
  }

  // Apply direction
  correctTextDirection(container, text, {
    setTextAlign: true,
    addClasses: true,
    preserveExisting: false,
    detectOptions
  });

  return container;
}

/**
 * Check if element has RTL direction applied
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} Whether element has RTL direction
 */
export function hasRTLDirection(element) {
  if (!element) return false;

  return element.style.direction === 'rtl' ||
         element.classList.contains('aiwc-rtl-text') ||
         getComputedStyle(element).direction === 'rtl';
}

/**
 * Utility object with commonly used direction functions
 */
export const ElementDirectionUtils = {
  isRTL: isRTLText,
  getDirection: getTextDirection,
  apply: correctTextDirection,
  store: storeOriginalElementStyles,
  restore: restoreOriginalElementStyles,
  detectBulk: detectBulkTextDirection,
  createContainer: createDirectionAwareContainer,
  hasRTL: hasRTLDirection
};

// Export patterns for advanced usage
export { RTL_PATTERNS };