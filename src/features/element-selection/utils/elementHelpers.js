// elementHelpers - Text extraction and element validation utilities
// Simplified helper functions for the new Select Element architecture

/**
 * Extract meaningful text from an element
 * @param {HTMLElement} element - Element to extract text from
 * @returns {string} Extracted text
 */
export function extractTextFromElement(element) {
  if (!element) return '';

  // Handle input elements
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    return element.value?.trim() || '';
  }

  // Use textContent for most elements
  return element.textContent?.trim() || '';
}

/**
 * Check if element has meaningful text content
 * @param {HTMLElement} element - Element to check
 * @param {Object} options - Validation options
 * @returns {boolean} Whether element has valid text
 */
export function hasValidTextContent(element, options = {}) {
  const {
    minTextLength = 1,
    minWordCount = 1,
  } = options;

  const text = extractTextFromElement(element);

  // Check minimum length
  if (text.length < minTextLength) return false;

  // Check minimum word count
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length < minWordCount) return false;

  // Skip pure numbers, symbols, or whitespace
  const onlyNumbersSymbols = /^[\d\s\p{P}\p{S}]+$/u;
  if (onlyNumbersSymbols.test(text)) return false;

  // Skip if the entire text is a URL or email address
  // Improved pattern to only match if it looks like a standalone URL or email
  const standaloneUrlPattern = /^(https?:\/\/|www\.)\S+$/i;
  const standaloneEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (standaloneUrlPattern.test(text) || standaloneEmailPattern.test(text)) {
    return false;
  }

  return true;
}

/**
 * Check if element is valid for translation
 * @param {HTMLElement} element - Element to validate
 * @returns {boolean} Whether element is valid
 */
export function isValidTextElement(element) {
  if (!element) return false;

  // Skip invalid tags
  const invalidTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'IFRAME'];
  if (invalidTags.includes(element.tagName)) {
    return false;
  }

  // Skip invisible elements
  try {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
  } catch {
    // If getComputedStyle fails, consider it invalid
    return false;
  }

  // Check for text content
  return hasValidTextContent(element);
}

/**
 * Find the best container element for translation
 * @param {HTMLElement} startElement - Starting element
 * @param {Object} options - Search options
 * @returns {HTMLElement|null} Best container element
 */
export function findBestContainer(startElement, options = {}) {
  const {
    maxAncestors = 5,
    maxArea = 50000,
    minTextLength = 20,
  } = options;

  let element = startElement;
  let bestCandidate = null;
  let ancestors = 0;

  while (element && element !== document.body && ancestors < maxAncestors) {
    const text = extractTextFromElement(element);

    // Check if element has sufficient text
    if (text.length >= minTextLength) {
      const area = element.offsetWidth * element.offsetHeight;

      // Check if element size is reasonable
      if (area <= maxArea) {
        bestCandidate = element;
      }

      // Stop if we found a good container
      break;
    }

    element = element.parentElement;
    ancestors++;
  }

  return bestCandidate || startElement;
}

/**
 * Check if text is a common UI word that should be skipped
 * @param {string} text - Text to check
 * @returns {boolean} Whether text is a UI word
 */
export function isCommonUIWord(text) {
  if (!text || typeof text !== 'string') return false;

  const words = text.trim().toLowerCase();
  const commonUIWords = [
    'ok', 'cancel', 'yes', 'no', 'submit', 'reset', 'login', 'logout',
    'menu', 'home', 'back', 'next', 'prev', 'previous', 'continue',
    'skip', 'done', 'finish', 'close', 'open', 'save', 'edit', 'delete',
    'search', 'filter', 'sort', 'view', 'hide', 'show', 'toggle',
  ];

  return commonUIWords.includes(words);
}

/**
 * Get immediate text content of element (excluding children)
 * @param {HTMLElement} element - Element to get text from
 * @returns {string} Immediate text content
 */
export function getImmediateTextContent(element) {
  if (!element) return '';

  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    }
  }
  return text.trim();
}

/**
 * Detect if text is RTL (right-to-left)
 * @param {string} text - Text to analyze
 * @returns {boolean} Whether text appears to be RTL
 */
export function isRTLText(text) {
  if (!text || typeof text !== 'string') return false;

  // Check for RTL characters (Arabic, Hebrew, Persian, etc.)
  const rtlPattern = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  return rtlPattern.test(text);
}

/**
 * Get language direction from language code
 * @param {string} langCode - Language code (e.g., 'fa', 'en-US')
 * @returns {string} 'rtl', 'ltr', or 'auto'
 */
export function getDirectionFromLanguage(langCode) {
  if (!langCode || typeof langCode !== 'string') return 'auto';

  // Use the shared RTL_LANGUAGES set logic if possible, or simple list
  const rtlLanguages = ['ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ckb', 'dv', 'ug'];
  const baseLang = langCode.toLowerCase().split('-')[0];

  return rtlLanguages.includes(baseLang) ? 'rtl' : 'ltr';
}

/**
 * Check if element is interactive (clickable)
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} Whether element is interactive
 */
export function isInteractiveElement(element) {
  if (!element) return false;

  const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
  return (
    interactiveTags.includes(element.tagName) ||
    element.getAttribute('role') === 'button' ||
    element.getAttribute('role') === 'link' ||
    element.onclick !== null ||
    element.getAttribute('tabindex') === '0'
  );
}

/**
 * Create a debounced function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Sanitize HTML content (basic XSS protection)
 * @param {string} html - HTML string to sanitize
 * @returns {string} Sanitized HTML
 */
export function sanitizeHTML(html) {
  if (!html || typeof html !== 'string') return '';

  // Basic sanitization - remove script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * Generate a unique element ID
 * @returns {string} Unique ID
 */
export function generateElementId() {
  return `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if element is in viewport
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} Whether element is in viewport
 */
export function isInViewport(element) {
  if (!element) return false;

  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Scroll element into view smoothly
 * @param {HTMLElement} element - Element to scroll to
 * @param {Object} options - Scroll options
 */
export function scrollIntoView(element, options = {}) {
  if (!element) return;

  const defaultOptions = {
    behavior: 'smooth',
    block: 'nearest',
    inline: 'nearest',
  };

  element.scrollIntoView({ ...defaultOptions, ...options });
}

// Export all helpers as an object for convenience
export default {
  extractTextFromElement,
  hasValidTextContent,
  isValidTextElement,
  findBestContainer,
  isCommonUIWord,
  getImmediateTextContent,
  isRTLText,
  getDirectionFromLanguage,
  isInteractiveElement,
  debounce,
  sanitizeHTML,
  generateElementId,
  isInViewport,
  scrollIntoView,
};
