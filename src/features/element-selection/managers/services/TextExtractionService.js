// TextExtractionService - Handles text extraction and validation from DOM elements

import { getScopedLogger } from "../../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../../utils/core/logConstants.js";
import { CONFIG, CACHE_CONFIG } from "../constants/selectElementConstants.js";

export class TextExtractionService {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TextExtractionService');
    this.config = { ...CONFIG };
    this.elementValidationCache = CACHE_CONFIG.ELEMENT_VALIDATION;
    this.textContentCache = CACHE_CONFIG.TEXT_CONTENT;
  }

  /**
   * Initialize the text extraction service
   */
  async initialize() {
    this.logger.debug('TextExtractionService initialized');
  }

  /**
   * Update configuration for text validation
   * @param {Object} newConfig - Configuration object
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Clear caches when config changes
    this.elementValidationCache = new WeakMap();
    this.textContentCache = new WeakMap();
    
    this.logger.debug('Configuration updated:', this.config);
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Extract text from selected element
   * @param {HTMLElement} element - Element to extract text from
   * @returns {string} Extracted text
   */
  extractTextFromElement(element) {
    this.logger.debug(`[extractTextFromElement] Starting extraction:`, {
      tagName: element.tagName,
      className: element.className,
      id: element.id,
      mode: this.config.mode
    });

    // Handle input elements
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      const value = element.value || "";
      this.logger.debug("[extractTextFromElement] Input element, value:", value);
      return value;
    }

    let extractedText = "";
    
    if (this.config.mode === "simple") {
      // Simple mode - like OLD system
      extractedText = this.extractTextFromElement_Simple(element);
    } else {
      // Smart mode - multiple extraction methods
      extractedText = this.extractTextFromElement_Smart(element);
    }

    this.logger.debug("[extractTextFromElement] Final extracted text:", {
      length: extractedText.length,
      text: extractedText.substring(0, 100) + (extractedText.length > 100 ? '...' : '')
    });

    return extractedText;
  }

  /**
   * Simple text extraction like OLD system
   * @param {HTMLElement} element - Element to extract text from
   * @returns {string} Extracted text
   */
  extractTextFromElement_Simple(element) {
    // Just use textContent.trim() like OLD system
    const text = (element.textContent || "").trim();
    this.logger.debug("[extractTextFromElement_Simple] Extracted:", text);
    return text;
  }

  /**
   * Smart text extraction with multiple methods
   * @param {HTMLElement} element - Element to extract text from
   * @returns {string} Extracted text
   */
  extractTextFromElement_Smart(element) {
    let extractedText = "";
    
    // Method 1: Try immediate text content first (for leaf elements)
    const immediateText = this.getImmediateTextContent(element);
    if (immediateText && this.isValidTextContent(immediateText)) {
      extractedText = immediateText;
      this.logger.debug("[extractTextFromElement_Smart] Using immediate text:", extractedText);
    }
    
    // Method 2: If no immediate text, try simple textContent
    if (!extractedText) {
      const simpleText = (element.textContent || "").trim();
      if (simpleText && this.isValidTextContent(simpleText)) {
        extractedText = simpleText;
        this.logger.debug("[extractTextFromElement_Smart] Using simple textContent:", extractedText);
      }
    }
    
    // Method 3: If still no text, try innerText (respects visibility)
    if (!extractedText && element.innerText) {
      const innerText = element.innerText.trim();
      if (innerText && this.isValidTextContent(innerText)) {
        extractedText = innerText;
        this.logger.debug("[extractTextFromElement_Smart] Using innerText:", extractedText);
      }
    }
    
    // Method 4: Use tree walker as last resort with relaxed filtering
    if (!extractedText) {
      extractedText = this.extractTextWithTreeWalker(element);
      this.logger.debug("[extractTextFromElement_Smart] Using tree walker:", extractedText);
    }
    
    // Final fallback: just get any text content without validation
    if (!extractedText) {
      const fallbackText = (element.textContent || "").trim();
      if (fallbackText.length > 0) {
        extractedText = fallbackText;
        this.logger.debug("[extractTextFromElement_Smart] Using fallback text:", extractedText);
      }
    }

    return extractedText;
  }

  /**
   * Extract text using tree walker with relaxed filtering
   * @param {HTMLElement} element - Element to extract text from
   * @returns {string} Extracted text
   */
  extractTextWithTreeWalker(element) {
    let text = "";

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Skip text in hidden elements
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        try {
          const style = window.getComputedStyle(parent);
          if (style.display === "none" || style.visibility === "hidden") {
            return NodeFilter.FILTER_REJECT;
          }
        } catch {
          // If getComputedStyle fails, accept the node
        }

        // Skip empty text nodes
        const textContent = node.textContent.trim();
        if (!textContent) return NodeFilter.FILTER_REJECT;

        // Skip text from script or style tags
        if (parent.closest('script, style, noscript')) {
            return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      const nodeText = node.textContent.trim();
      if (nodeText) {
        text += nodeText + " ";
      }
    }

    return text.trim();
  }

  /**
   * Get immediate text content of element (excluding children)
   * @param {HTMLElement} element - Element to get text from
   * @returns {string} Immediate text content
   */
  getImmediateTextContent(element) {
    let text = "";
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    return text.trim();
  }

  /**
   * Check if element is valid for text extraction
   * @param {HTMLElement} element - Element to validate
   * @returns {boolean} Whether element is valid
   */
  isValidTextElement(element) {
    // Check cache first
    if (this.elementValidationCache.has(element)) {
      return this.elementValidationCache.get(element);
    }
    
    let isValid = false;
    
    try {
      if (this.config.mode === "simple") {
        // Simple mode - like OLD system: just check basic validity
        isValid = this.isValidTextElement_Simple(element);
      } else if (this.config.mode === "smart") {
        // Smart mode - enhanced validation
        isValid = this.isValidTextElement_Smart(element);
      } else {
        // Fallback to simple mode for unknown modes
        this.logger.warn(`Unknown validation mode: ${this.config.mode}, falling back to simple`);
        isValid = this.isValidTextElement_Simple(element);
      }
    } catch (error) {
      // If any error occurs during validation, assume invalid
      this.logger.debug("Error validating element:", error);
      isValid = false;
    }
    
    // Cache the result
    this.elementValidationCache.set(element, isValid);
    return isValid;
  }

  /**
   * Simple validation like OLD system - minimal checks
   * @param {HTMLElement} element - Element to validate
   * @returns {boolean} Whether element is valid
   */
  isValidTextElement_Simple(element) {
    // Skip script, style, and other non-text elements
    const invalidTags = ["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "LINK"];
    if (invalidTags.includes(element.tagName)) return false;

    // Skip invisible elements
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.opacity === "0") return false;

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
  isValidTextElement_Smart(element) {
    // Skip script, style, and other non-text elements
    const invalidTags = ["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "LINK"];
    if (invalidTags.includes(element.tagName)) return false;

    // Skip invisible elements
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }

    // Handle input elements separately
    const isTextInput = element.tagName === "INPUT" && (element.type === "text" || element.type === "textarea");
    const isTextArea = element.tagName === "TEXTAREA";
    
    if (isTextInput || isTextArea) {
      const value = element.value || "";
      return this.isValidTextContent(value.trim());
    }

    // For regular elements, check if they contain meaningful text
    return this.hasValidTextContent(element);
  }

  /**
   * Check if text content is meaningful and worth translating
   * @param {string} text - Text to validate
   * @returns {boolean} Whether text is valid
   */
  isValidTextContent(text) {
    if (!text || text.length === 0) return false;
    
    // Minimum length requirement (configurable)
    if (text.length < this.config.minTextLength) return false;

    // Skip pure numbers, symbols, or whitespace
    const onlyNumbersSymbols = /^[\d\s\p{P}\p{S}]+$/u.test(text);
    if (onlyNumbersSymbols) return false;

    // Skip URLs and email addresses
    const urlPattern = /^https?:\/\/|www\.|@.*\./;
    if (urlPattern.test(text)) return false;

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
      if (commonUIWords.includes(word)) return false;
    }

    // Check for minimum word count for meaningful content
    if (words.length < this.config.minWordCount) return false;

    return true;
  }

  /**
   * Check if element has valid text content using smart detection
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element has valid text content
   */
  hasValidTextContent(element) {
    // Get immediate text content (not from children)
    const immediateText = this.getImmediateTextContent(element);
    
    // If element has meaningful immediate text, it's valid
    if (this.isValidTextContent(immediateText)) {
      return true;
    }

    // Check if it's a leaf element with valid text
    if (this.isLeafTextElement(element)) {
      const leafText = element.textContent?.trim() || "";
      return this.isValidTextContent(leafText);
    }

    // For container elements, be more selective
    return this.isValidContainerElement(element);
  }

  /**
   * Check if element is a leaf element with text
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element is a leaf text element
   */
  isLeafTextElement(element) {
    // Consider elements with no child elements (only text nodes) as leaf elements
    const hasChildElements = Array.from(element.children).length > 0;
    if (hasChildElements) return false;

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
  isValidContainerElement(element) {
    // Skip common navigation and UI containers
    const skipContainers = ['NAV', 'HEADER', 'FOOTER', 'ASIDE', 'MENU'];
    if (skipContainers.includes(element.tagName)) return false;

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
    if (!this.isValidTextContent(totalText)) return false;

    // Check text density - avoid containers that are mostly whitespace/structure
    const textLength = totalText.length;
    const elementArea = element.offsetWidth * element.offsetHeight;
    
    // Skip very large containers with little text (likely layout containers)
    if (elementArea > this.config.maxElementArea && textLength < 100) return false;

    // Check if most of the text comes from a single child (prefer the child instead)
    const children = Array.from(element.children);
    if (children.length === 1) {
      const childText = children[0].textContent?.trim() || "";
      const textRatio = childText.length / textLength;
      
      // If child contains most of the text, prefer the child
      if (textRatio > 0.8) return false;
    }

    return true;
  }

  /**
   * Debug method to analyze why an element is or isn't valid
   * @param {HTMLElement} element - Element to analyze
   * @returns {Object} Analysis result
   */
  analyzeElement(element) {
    const analysis = {
      element: element,
      tagName: element.tagName,
      isValid: false,
      reasons: [],
      textContent: element.textContent?.trim() || '',
      textLength: (element.textContent?.trim() || '').length,
      hasChildren: element.children.length > 0,
      area: element.offsetWidth * element.offsetHeight,
      mode: this.config.mode
    };

    // Test both modes for comparison
    const simpleValid = this.isValidTextElement_Simple(element);
    const smartValid = this.isValidTextElement_Smart(element);
    
    analysis.simpleMode = { isValid: simpleValid };
    analysis.smartMode = { isValid: smartValid };
    analysis.currentMode = { isValid: this.isValidTextElement(element) };
    

    // Check each validation step for current mode
    const invalidTags = ["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "LINK"];
    if (invalidTags.includes(element.tagName)) {
      analysis.reasons.push('Invalid tag type');
      return analysis;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      analysis.reasons.push('Element not visible');
      return analysis;
    }

    const isTextInput = element.tagName === "INPUT" && (element.type === "text" || element.type === "textarea");
    const isTextArea = element.tagName === "TEXTAREA";
    
    if (isTextInput || isTextArea) {
      const value = element.value || "";
      analysis.textContent = value;
      analysis.textLength = value.length;
      
      if (this.config.mode === "simple" || this.isValidTextContent(value.trim())) {
        analysis.isValid = true;
        analysis.reasons.push('Valid input element');
      } else {
        analysis.reasons.push('Input value not valid for translation');
      }
    } else {
      if (this.config.mode === "simple" || this.hasValidTextContent(element)) {
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

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.elementValidationCache = new WeakMap();
    this.textContentCache = new WeakMap();
    this.logger.debug('TextExtractionService cleanup completed');
  }

  /**
   * Get debugging information
   * @returns {Object} Debug info
   */
  getDebugInfo() {
    return {
      config: this.config,
      cacheSizes: {
        elementValidation: 'WeakMap (size not available)',
        textContent: 'WeakMap (size not available)'
      }
    };
  }
}
