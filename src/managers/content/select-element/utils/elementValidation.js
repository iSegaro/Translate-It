// Element Validation Utilities - Reusable validation logic for DOM elements

import { CONFIG } from "../constants/selectElementConstants.js";

/**
 * Check if element is valid for text extraction
 * @param {HTMLElement} element - Element to validate
 * @param {string} mode - Validation mode ('simple' or 'smart')
 * @returns {boolean} Whether element is valid
 */
export function isValidTextElement(element, mode = 'smart') {
  if (!element || typeof element.tagName !== 'string') {
    return false;
  }

  // Skip script, style, and other non-text elements
  const invalidTags = ["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "LINK"];
  if (invalidTags.includes(element.tagName)) {
    return false;
  }

  // Skip invisible elements
  try {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
  } catch {
    return false;
  }

  // Handle input elements separately
  const isTextInput = element.tagName === "INPUT" && (element.type === "text" || element.type === "textarea");
  const isTextArea = element.tagName === "TEXTAREA";
  
  if (isTextInput || isTextArea) {
    const value = element.value || "";
    return isValidTextContent(value.trim(), mode);
  }

  // For regular elements, use mode-specific validation
  if (mode === 'simple') {
    return isValidTextElement_Simple(element);
  } else {
    return isValidTextElement_Smart(element);
  }
}

/**
 * Simple validation like OLD system - minimal checks
 * @param {HTMLElement} element - Element to validate
 * @returns {boolean} Whether element is valid
 */
export function isValidTextElement_Simple(element) {
  // Must have text content or be a text input
  const hasText = element.textContent && element.textContent.trim().length > 0;
  const isTextInput = element.tagName === "INPUT" && element.type === "text";
  const isTextArea = element.tagName === "TEXTAREA";

  return hasText || isTextInput || isTextArea;
}

/**
 * Smart validation with enhanced checks
 * @param {HTMLElement} element - Element to validate
 * @returns {boolean} Whether element is valid
 */
export function isValidTextElement_Smart(element) {
  // Check if element has valid text content using smart detection
  return hasValidTextContent(element);
}

/**
 * Check if element has valid text content using smart detection
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} Whether element has valid text content
 */
export function hasValidTextContent(element) {
  // Get immediate text content (not from children)
  const immediateText = getImmediateTextContent(element);
  
  // If element has meaningful immediate text, it's valid
  if (isValidTextContent(immediateText)) {
    return true;
  }

  // Check if it's a leaf element with valid text
  if (isLeafTextElement(element)) {
    const leafText = element.textContent?.trim() || "";
    return isValidTextContent(leafText);
  }

  // For container elements, be more selective
  return isValidContainerElement(element);
}

/**
 * Check if text content is meaningful and worth translating
 * @param {string} text - Text to validate
 * @param {string} mode - Validation mode
 * @returns {boolean} Whether text is valid
 */
export function isValidTextContent(text, mode = 'smart') {
  if (!text || text.length === 0) {
    return false;
  }
  
  // Minimum length requirement
  const minLength = mode === 'simple' ? 1 : CONFIG.MIN_TEXT_LENGTH;
  if (text.length < minLength) {
    return false;
  }

  // Skip pure numbers, symbols, or whitespace
  const onlyNumbersSymbols = /^[\d\s\p{P}\p{S}]+$/u.test(text);
  if (onlyNumbersSymbols) {
    return false;
  }

  // Skip URLs and email addresses
  const urlPattern = /^https?:\/\/|www\.|@.*\./;
  if (urlPattern.test(text)) {
    return false;
  }

  // Skip single words that are likely UI elements
  const words = text.trim().split(/\s+/);
  if (words.length === 1) {
    const word = words[0].toLowerCase();
    const commonUIWords = [
      'ok', 'cancel', 'yes', 'no', 'submit', 'reset', 'login', 'logout',
      'menu', 'home', 'back', 'next', 'prev', 'previous', 'continue',
      'skip', 'done', 'finish', 'close', 'open', 'save', 'edit', 'delete',
      'search', 'filter', 'sort', 'view', 'hide', 'show', 'toggle'
    ];
    if (commonUIWords.includes(word)) {
      return false;
    }
  }

  // Check for minimum word count for meaningful content
  const minWordCount = mode === 'simple' ? 1 : CONFIG.MIN_WORD_COUNT;
  if (words.length < minWordCount) {
    return false;
  }

  return true;
}

/**
 * Check if element is a leaf element with text
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} Whether element is a leaf text element
 */
export function isLeafTextElement(element) {
  // Consider elements with no child elements (only text nodes) as leaf elements
  const hasChildElements = Array.from(element.children).length > 0;
  if (hasChildElements) {
    return false;
  }

  // Check common leaf text elements
  const leafTags = ['P', 'SPAN', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 
                   'LI', 'TD', 'TH', 'LABEL', 'A', 'STRONG', 'EM', 'B', 'I'];
  
  return leafTags.includes(element.tagName);
}

/**
 * Check if container element is valid for translation
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} Whether container element is valid
 */
export function isValidContainerElement(element) {
  // Skip common navigation and UI containers
  const skipContainers = ['NAV', 'HEADER', 'FOOTER', 'ASIDE', 'MENU'];
  if (skipContainers.includes(element.tagName)) {
    return false;
  }

  // Skip elements with common UI class names
  const className = element.className || "";
  const uiClassPatterns = [
    /nav/i, /menu/i, /header/i, /footer/i, /sidebar/i, /toolbar/i,
    /btn/i, /button/i, /icon/i, /logo/i, /badge/i, /tag/i,
    /pagination/i, /breadcrumb/i, /dropdown/i, /modal/i
  ];
  
  if (uiClassPatterns.some(pattern => pattern.test(className))) {
    return false;
  }

  // Check if container has a reasonable amount of meaningful text
  const totalText = element.textContent?.trim() || "";
  if (!isValidTextContent(totalText)) {
    return false;
  }

  // Check text density - avoid containers that are mostly whitespace/structure
  const textLength = totalText.length;
  const elementArea = element.offsetWidth * element.offsetHeight;
  
  // Skip very large containers with little text (likely layout containers)
  if (elementArea > CONFIG.MAX_ELEMENT_AREA && textLength < 100) {
    return false;
  }

  // Check if most of the text comes from a single child (prefer the child instead)
  const children = Array.from(element.children);
  if (children.length === 1) {
    const childText = children[0].textContent?.trim() || "";
    const textRatio = childText.length / textLength;
    
    // If child contains most of the text, prefer the child
    if (textRatio > 0.8) {
      return false;
    }
  }

  return true;
}

/**
 * Get immediate text content of element (excluding children)
 * @param {HTMLElement} element - Element to get text from
 * @returns {string} Immediate text content
 */
export function getImmediateTextContent(element) {
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    }
  }
  return text.trim();
}

/**
 * Debug method to analyze why an element is or isn't valid
 * @param {HTMLElement} element - Element to analyze
 * @param {string} mode - Validation mode
 * @returns {Object} Analysis result
 */
export function analyzeElement(element, mode = 'smart') {
  const analysis = {
    element: element,
    tagName: element.tagName,
    isValid: false,
    reasons: [],
    textContent: element.textContent?.trim() || '',
    textLength: (element.textContent?.trim() || '').length,
    hasChildren: element.children.length > 0,
    area: element.offsetWidth * element.offsetHeight,
    mode: mode
  };

  // Test both modes for comparison
  const simpleValid = isValidTextElement_Simple(element);
  const smartValid = isValidTextElement_Smart(element);
  
  analysis.simpleMode = { isValid: simpleValid };
  analysis.smartMode = { isValid: smartValid };
  analysis.currentMode = { isValid: isValidTextElement(element, mode) };

  // Check each validation step for current mode
  const invalidTags = ["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "LINK"];
  if (invalidTags.includes(element.tagName)) {
    analysis.reasons.push('Invalid tag type');
    return analysis;
  }

  try {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      analysis.reasons.push('Element not visible');
      return analysis;
    }
  } catch {
    analysis.reasons.push('Cannot compute style');
    return analysis;
  }

  const isTextInput = element.tagName === "INPUT" && (element.type === "text" || element.type === "textarea");
  const isTextArea = element.tagName === "TEXTAREA";
  
  if (isTextInput || isTextArea) {
    const value = element.value || "";
    analysis.textContent = value;
    analysis.textLength = value.length;
    
    if (mode === "simple" || isValidTextContent(value.trim(), mode)) {
      analysis.isValid = true;
      analysis.reasons.push('Valid input element');
    } else {
      analysis.reasons.push('Input value not valid for translation');
    }
  } else {
    if (mode === "simple" || hasValidTextContent(element)) {
      analysis.isValid = true;
      analysis.reasons.push('Valid text element');
    } else {
      analysis.reasons.push('No valid text content found');
    }
  }

  // Additional analysis for container elements
  if (element.children.length > 0) {
    analysis.childCount = element.children.length;
    analysis.isContainer = true;
  }

  return analysis;
}
