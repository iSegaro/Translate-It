/**
 * Modern Field Detector - Uses modular site handlers for field classification
 * Delegates site-specific logic to specialized handlers
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { siteHandlerRegistry } from "../registry/SiteHandlerRegistry.js";
import { 
  FieldTypes, 
  SiteConfig,
  SelectionStrategies,
  SelectionEventStrategies 
} from "./types.js";

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'FieldDetector');

/**
 * Rich text editor detection patterns
 */
const RichEditorPatterns = {
  selectors: [
    // Modern rich text editors
    '[data-slate-editor]', '.slate-editor',
    '.ql-editor', '.quill-editor',
    '.ProseMirror', '.pm-editor',
    '.CodeMirror', '.cm-editor',
    '.mce-content-body', '.tinymce',
    '.cke_editable', '.ck-editor__editable',
    '.DraftEditor-root', '.public-DraftEditor-content',
    '.monaco-editor', '.view-lines',
    
    // Generic rich text indicators
    '[role="textbox"][aria-multiline="true"]',
    '[contenteditable="true"].rich-editor',
    '[contenteditable="true"].editor',
    '.rich-text-editor', '.wysiwyg-editor',
    '.text-editor', '.note-editor', '.editor-content'
  ],
  
  classPatterns: [
    /notion-/i, /editor-/i, /rich-text/i, /wysiwyg/i,
    /draft-js/i, /slate-/i, /quill-/i, /tinymce/i,
    /ckeditor/i, /prosemirror/i, /codemirror/i
  ]
};

/**
 * Authentication field keywords to exclude
 */
const AuthKeywords = [
  'password', 'pwd', 'pass', 'login', 'username', 'email', 'user',
  'auth', 'signin', 'signup', 'register', 'captcha', 'otp', 'token',
  'verification', 'confirm', 'security', 'pin', 'code'
];

/**
 * Cache for field detection results
 */
const detectionCache = new WeakMap();

/**
 * Modern FieldDetector class with site handler integration
 */
export class FieldDetector {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'FieldDetector');
    this._initialized = false;
  }

  /**
   * Initialize field detector
   */
  async initialize() {
    if (this._initialized) return;
    
    try {
      await siteHandlerRegistry.initialize();
      this._initialized = true;
      this.logger.debug('FieldDetector initialized with site handlers');
    } catch (error) {
      this.logger.error('Failed to initialize FieldDetector:', error);
      throw error;
    }
  }

  /**
   * Detect field type and configuration for an element
   * @param {Element} element - Element to detect
   * @returns {Promise<Object>} Detection result
   */
  async detect(element) {
    if (!this._initialized) {
      await this.initialize();
    }

    if (!element) {
      return this._getDefaultDetection();
    }

    // Check cache first
    if (detectionCache.has(element)) {
      return detectionCache.get(element);
    }

    try {
      // Get site handler for current hostname
      const handler = await siteHandlerRegistry.getCurrentHandler();
      const config = handler.getConfig();

      // Classify field type using both site-specific and generic logic
      const fieldType = await this._classifyFieldType(element, config);
      
      // Create detection result
      const shouldShowIcon = this._shouldShowSelectionIcon(fieldType);
      
      const detection = {
        fieldType,
        selectionMethod: this._getSelectionMethod(element, fieldType, config),
        selectionStrategy: this._getSelectionStrategy(element, fieldType, config),
        selectionEventStrategy: this._getSelectionEventStrategy(element, fieldType, config),
        shouldShowSelectionIcon: shouldShowIcon,
        shouldShowTextFieldIcon: this._shouldShowTextFieldIcon(fieldType),
        siteConfig: config,
        isAuthField: this._isAuthField(element),
        isRichEditor: this._isRichTextEditor(element),
        handler: handler
      };
      
      this.logger.debug('Field detected:', {
        tagName: element?.tagName,
        type: fieldType,
        shouldShowIcon,
        siteConfigType: config?.type,
        handler: handler?.constructor.name
      });

      // Cache result
      detectionCache.set(element, detection);
      
      this.logger.debug('Field detected:', {
        tagName: element.tagName,
        type: fieldType,
        siteConfigType: config.type,
        handler: handler.constructor.name
      });

      return detection;

    } catch (error) {
      this.logger.error('Field detection failed:', error);
      return this._getDefaultDetection();
    }
  }

  /**
   * Classify field type based on element and site context
   * @param {Element} element - Element to classify
   * @param {SiteConfig} siteConfig - Site configuration
   * @returns {string} Field type
   */
  async _classifyFieldType(element, siteConfig) {
    if (!element) return FieldTypes.UNKNOWN;

    const tagName = element.tagName.toLowerCase();

    try {
      // Skip authentication fields
      if (this._isAuthField(element)) {
        return FieldTypes.UNKNOWN;
      }
      
      // Site-specific classification first (highest priority)
      if (siteConfig.type === FieldTypes.PROFESSIONAL_EDITOR) {
        // Check if element matches site-specific selectors
        const matchesSiteSelectors = siteConfig.selectors.some(selector => {
          try {
            return element.matches(selector) || element.closest(selector);
          } catch (e) {
            return false;
          }
        });
        
        if (matchesSiteSelectors) {
          return FieldTypes.PROFESSIONAL_EDITOR;
        }
        
        // For known professional sites, still treat as professional even if selectors don't match
        const hostname = window.location.hostname.toLowerCase();
        const isKnownProfessionalSite = await this._isKnownProfessionalSite(hostname);
        
        if (isKnownProfessionalSite) {
          return FieldTypes.PROFESSIONAL_EDITOR;
        }
      }
      
      // Generic rich text editor detection
      if (this._isRichTextEditor(element)) {
        return FieldTypes.RICH_TEXT_EDITOR;
      }
      
      // ContentEditable detection
      if (element.isContentEditable || element.contentEditable === 'true') {
        // Check if it has rich features
        const hasRichFeatures = element.querySelector('div, span, p, br') ||
                              element.closest('[data-editor]') ||
                              element.closest('.editor');
        
        return hasRichFeatures ? 
          FieldTypes.RICH_TEXT_EDITOR : 
          FieldTypes.CONTENT_EDITABLE;
      }
      
      // Regular form fields
      if (tagName === 'textarea') {
        return FieldTypes.REGULAR_INPUT;
      } else if (tagName === 'input') {
        const type = (element.type || '').toLowerCase();
        const textTypes = ['text', 'search', 'email', 'url', 'tel'];
        
        if (textTypes.includes(type) || !type) {
          return FieldTypes.REGULAR_INPUT;
        }
      }
      
    } catch (error) {
      this.logger.warn('Error classifying field type:', error);
    }
    
    return FieldTypes.UNKNOWN;
  }

  /**
   * Check if hostname is a known professional site
   * @param {string} hostname - Hostname to check
   * @returns {boolean} True if known professional site
   */
  async _isKnownProfessionalSite(hostname) {
    try {
      const handler = await siteHandlerRegistry.getHandler(hostname);
      return handler.constructor.name !== 'DefaultSiteHandler';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get selection method for field type
   * @param {Element} element - Element to check
   * @param {string} fieldType - Field type
   * @param {SiteConfig} siteConfig - Site configuration
   * @returns {string} Selection method
   */
  _getSelectionMethod(element, fieldType, siteConfig) {
    // Use site-specific method if available
    if (fieldType === FieldTypes.PROFESSIONAL_EDITOR && siteConfig.selectionMethod) {
      return siteConfig.selectionMethod;
    }
    
    // Default methods based on field type
    switch (fieldType) {
      case FieldTypes.RICH_TEXT_EDITOR:
        return 'content-editable';
      case FieldTypes.CONTENT_EDITABLE:
        return 'content-editable';
      case FieldTypes.REGULAR_INPUT:
        return 'input-selection';
      default:
        return 'standard';
    }
  }

  /**
   * Get selection strategy for field type
   * @param {Element} element - Element to check
   * @param {string} fieldType - Field type
   * @param {SiteConfig} siteConfig - Site configuration
   * @returns {string} Selection strategy
   */
  _getSelectionStrategy(element, fieldType, siteConfig) {
    // For professional editors, use site-specific strategy
    if (fieldType === FieldTypes.PROFESSIONAL_EDITOR && siteConfig.selectionStrategy) {
      return siteConfig.selectionStrategy;
    }
    
    // For rich text editors, require double-click by default
    if (fieldType === FieldTypes.RICH_TEXT_EDITOR) {
      return SelectionStrategies.DOUBLE_CLICK_REQUIRED;
    }
    
    // For all other field types, any selection is acceptable
    return SelectionStrategies.ANY_SELECTION;
  }

  /**
   * Get selection event strategy for field type
   * @param {Element} element - Element to check
   * @param {string} fieldType - Field type
   * @param {SiteConfig} siteConfig - Site configuration
   * @returns {string} Selection event strategy
   */
  _getSelectionEventStrategy(element, fieldType, siteConfig) {
    // For professional and rich text editors, check if element is inside editor
    if (fieldType === FieldTypes.PROFESSIONAL_EDITOR || 
        fieldType === FieldTypes.RICH_TEXT_EDITOR) {
      
      // In iframe contexts, check if element is inside actual editor
      if (siteConfig.selectors && element) {
        const isInsideEditor = siteConfig.selectors.some(selector => {
          try {
            return element.matches && element.matches(selector) || 
                   element.closest && element.closest(selector);
          } catch (e) {
            return false;
          }
        });
        
        // If element is not inside actual editor, use selection-based strategy
        if (!isInsideEditor) {
          return SelectionEventStrategies.SELECTION_BASED;
        }
      }
      
      return siteConfig.selectionEventStrategy || SelectionEventStrategies.MOUSE_BASED;
    }
    
    // For regular webpage content, use clean selection events
    return SelectionEventStrategies.SELECTION_BASED;
  }

  /**
   * Check if element should show selection icon
   * @param {string} fieldType - Field type
   * @returns {boolean} True if should show selection icon
   */
  _shouldShowSelectionIcon(fieldType) {
    return fieldType === FieldTypes.PROFESSIONAL_EDITOR || 
           fieldType === FieldTypes.RICH_TEXT_EDITOR ||
           fieldType === FieldTypes.UNKNOWN;
  }

  /**
   * Check if element should show text field icon
   * @param {string} fieldType - Field type
   * @returns {boolean} True if should show text field icon
   */
  _shouldShowTextFieldIcon(fieldType) {
    return fieldType === FieldTypes.REGULAR_INPUT || 
           fieldType === FieldTypes.CONTENT_EDITABLE;
  }

  /**
   * Detect if element is an authentication-related field
   * @param {Element} element - Element to check
   * @returns {boolean} True if authentication field
   */
  _isAuthField(element) {
    if (!element) return false;
    
    const name = (element.name || '').toLowerCase();
    const placeholder = (element.placeholder || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const autocomplete = (element.autocomplete || '').toLowerCase();
    const type = (element.type || '').toLowerCase();
    
    // Check for password type
    if (type === 'password') return true;
    
    // Check for authentication keywords
    return AuthKeywords.some(keyword => 
      name.includes(keyword) || 
      placeholder.includes(keyword) || 
      id.includes(keyword) ||
      autocomplete.includes(keyword)
    );
  }

  /**
   * Detect rich text editor features in element
   * @param {Element} element - Element to check
   * @returns {boolean} True if rich text editor detected
   */
  _isRichTextEditor(element) {
    if (!element) return false;
    
    // Check if element matches rich editor selectors
    for (const selector of RichEditorPatterns.selectors) {
      try {
        if (element.matches && element.matches(selector)) {
          return true;
        }
        if (element.closest && element.closest(selector)) {
          return true;
        }
      } catch (e) {
        // Invalid selector, continue
      }
    }
    
    // Check class name patterns
    if (element.className && typeof element.className === 'string') {
      for (const pattern of RichEditorPatterns.classPatterns) {
        if (pattern.test(element.className)) {
          return true;
        }
      }
    }
    
    // Check parent elements for rich editor context
    let parent = element.parentElement;
    let depth = 0;
    const maxDepth = 3;
    
    while (parent && depth < maxDepth) {
      if (parent.className && typeof parent.className === 'string') {
        for (const pattern of RichEditorPatterns.classPatterns) {
          if (pattern.test(parent.className)) {
            return true;
          }
        }
      }
      
      parent = parent.parentElement;
      depth++;
    }
    
    return false;
  }

  /**
   * Get default detection result
   * @returns {Object} Default detection
   */
  _getDefaultDetection() {
    return {
      fieldType: FieldTypes.UNKNOWN,
      selectionMethod: 'standard',
      selectionStrategy: SelectionStrategies.ANY_SELECTION,
      selectionEventStrategy: SelectionEventStrategies.SELECTION_BASED,
      shouldShowSelectionIcon: true,
      shouldShowTextFieldIcon: false,
      siteConfig: new SiteConfig(),
      isAuthField: false,
      isRichEditor: false,
      handler: null
    };
  }

  /**
   * Clear detection cache
   */
  clearCache() {
    detectionCache.clear();
    this.logger.debug('Field detection cache cleared');
  }

  /**
   * Get cache statistics for debugging
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      detectionCacheSize: 'N/A (WeakMap)',
      siteHandlerStats: siteHandlerRegistry.getStats()
    };
  }

  /**
   * Check if element is editable (legacy compatibility)
   * @param {Element} element - Element to check
   * @returns {boolean} True if editable
   */
  async isEditableElement(element) {
    const detection = await this.detect(element);
    return detection.fieldType !== FieldTypes.UNKNOWN;
  }

  /**
   * Cleanup field detector
   */
  cleanup() {
    this.clearCache();
    this._initialized = false;
    this.logger.debug('FieldDetector cleaned up');
  }
}

// Export singleton instance
export const fieldDetector = new FieldDetector();

// Register fieldDetector globally for use by other modules
if (typeof window !== 'undefined') {
  window.fieldDetector = fieldDetector;
}

// Re-export types from original location for backward compatibility
export { FieldTypes } from "./types.js";