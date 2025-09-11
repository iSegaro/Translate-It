/**
 * Unified Field Detector - Comprehensive text field classification and detection
 * Replaces hard-coded domain checks with intelligent field type classification
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'FieldDetector');

/**
 * Field type classifications
 */
export const FieldTypes = {
  REGULAR_INPUT: 'regular-input',           // Basic HTML input/textarea
  PROFESSIONAL_EDITOR: 'professional-editor',  // Rich text editors like Google Docs, WPS
  CONTENT_EDITABLE: 'content-editable',     // Simple contentEditable elements
  RICH_TEXT_EDITOR: 'rich-text-editor',     // Advanced WYSIWYG editors
  UNKNOWN: 'unknown'                        // Unclassified field
};

/**
 * Editor type configurations for different sites and patterns
 */
const EditorConfigs = {
  // Google products
  'docs.google.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'iframe-based',
    selectors: ['[contenteditable="true"]', '.kix-page', '.kix-page-paginated', '[role="document"]'],
    features: ['rich-formatting', 'collaboration'],
    selectionStrategy: 'double-click-required', // Google Docs only works with double-click due to iframe limitations
    selectionEventStrategy: 'mouse-based' // Use mouseup events for complex editor
  },
  
  'slides.google.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'iframe-based',
    selectors: ['[contenteditable="true"]'],
    features: ['presentations']
  },
  
  'sites.google.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'iframe-based',
    selectors: ['[contenteditable="true"]'],
    features: ['web-building']
  },
  
  // Microsoft products
  'office.live.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'iframe-based',
    selectors: ['[contenteditable="true"]'],
    features: ['office-suite', 'cloud-sync']
  },
  
  'onedrive.live.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'iframe-based',
    selectors: ['[contenteditable="true"]'],
    features: ['office-suite', 'cloud-sync']
  },
  
  'word.cloud.microsoft': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'iframe-based',
    selectors: ['[contenteditable="true"]', '.NormalTextRun'],
    features: ['office-suite', 'cloud-sync']
  },
  
  'word-edit.officeapps.live.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['.NormalTextRun', '[contenteditable="true"]', 'span[class*="SCXW"]'],
    features: ['office-suite', 'cloud-sync'],
    selectionEventStrategy: 'mouse-based' // Use mouseup events for complex editor
  },
  
  'officeapps.live.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['.NormalTextRun', '[contenteditable="true"]', 'span[class*="SCXW"]'],
    features: ['office-suite', 'cloud-sync'],
    selectionEventStrategy: 'mouse-based' // Use mouseup events for complex editor
  },
  
  'office.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'iframe-based',
    selectors: ['[contenteditable="true"]'],
    features: ['office-suite', 'cloud-sync']
  },
  
  'outlook.live.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['email-editor']
  },
  
  'outlook.office.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['email-editor']
  },
  
  // WPS Office
  'wps.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'input-based',
    selectors: ['input[type="text"]', '[contenteditable="true"]'],
    features: ['office-suite', 'cloud-sync']
  },
  
  // Productivity tools
  'notion.so': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]', '.notion-text-block'],
    features: ['block-based', 'markdown']
  },
  
  'www.notion.so': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]', '.notion-text-block'],
    features: ['block-based', 'markdown']
  },
  
  'coda.io': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['documents', 'collaboration']
  },
  
  'airtable.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['database', 'tables']
  },
  
  'roamresearch.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['knowledge-graph', 'notes']
  },
  
  'obsidian.md': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['markdown', 'notes']
  },
  
  // Document/Note services
  'paper.dropbox.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['documents', 'collaboration']
  },
  
  'dropbox.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['documents', 'cloud-storage']
  },
  
  'evernote.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['notes', 'rich-text']
  },
  
  'simplenote.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'textarea-based',
    selectors: ['textarea', '[contenteditable="true"]'],
    features: ['notes', 'markdown']
  },
  
  // Collaboration platforms
  'atlassian.net': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['confluence', 'wiki']
  },
  
  'confluence.atlassian.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['confluence', 'wiki']
  },
  
  'miro.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['whiteboard', 'collaboration']
  },
  
  'figma.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['design', 'collaboration']
  },
  
  // Development/Code editors
  'github.com': {
    type: FieldTypes.RICH_TEXT_EDITOR,
    selectionMethod: 'textarea-based',
    selectors: ['textarea', '[contenteditable="true"]'],
    features: ['markdown', 'code']
  },
  
  'gitlab.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'textarea-based',
    selectors: ['textarea', '[contenteditable="true"]'],
    features: ['markdown', 'code']
  },
  
  'codepen.io': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['.CodeMirror', '[contenteditable="true"]'],
    features: ['code-editor', 'web-dev']
  },
  
  'codesandbox.io': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['.monaco-editor', '[contenteditable="true"]'],
    features: ['code-editor', 'web-dev']
  },
  
  'replit.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['.monaco-editor', '[contenteditable="true"]'],
    features: ['code-editor', 'collaboration']
  },
  
  'overleaf.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['latex', 'academic']
  },
  
  'stackedit.io': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['markdown', 'documents']
  },
  
  // Publishing platforms
  'medium.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['publishing', 'rich-text']
  },
  
  'substack.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['newsletter', 'publishing']
  },
  
  'wordpress.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['blogging', 'cms']
  },
  
  'blogger.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['blogging', 'google']
  },
  
  // Communication platforms
  'trello.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'textarea-based',
    selectors: ['textarea', '[contenteditable="true"]'],
    features: ['project-management', 'cards']
  },
  
  'slack.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['messaging', 'rich-text']
  },
  
  'discord.com': {
    type: FieldTypes.PROFESSIONAL_EDITOR,
    selectionMethod: 'content-editable',
    selectors: ['[contenteditable="true"]'],
    features: ['messaging', 'rich-text']
  },
  
  // Default fallback configuration
  default: {
    type: FieldTypes.REGULAR_INPUT,
    selectionMethod: 'standard',
    selectors: ['input', 'textarea', '[contenteditable="true"]'],
    features: ['basic-text'],
    selectionStrategy: 'double-click-required', // Default: require double-click for professional editors
    selectionEventStrategy: 'selection-based' // Default: use clean selectionchange events
  }
};

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
  ],
  
  attributePatterns: [
    'data-editor', 'data-text-editor', 'data-wysiwyg',
    'aria-label*=editor', 'aria-label*=text'
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
const domainCache = new Map();

/**
 * Get site configuration based on current hostname
 * @returns {Object} Site configuration
 */
function getSiteConfig() {
  const hostname = window.location.hostname.toLowerCase();
  
  // Check cache first
  if (domainCache.has(hostname)) {
    return domainCache.get(hostname);
  }
  
  // Find matching configuration
  let config = EditorConfigs.default;
  
  for (const [domain, domainConfig] of Object.entries(EditorConfigs)) {
    if (domain === 'default') continue;
    
    if (hostname === domain || 
        hostname.endsWith('.' + domain) || 
        hostname.includes(domain)) {
      config = domainConfig;
      break;
    }
  }
  
  // Cache result
  domainCache.set(hostname, config);
  
  logger.debug('Site config determined:', {
    hostname,
    type: config.type,
    selectionMethod: config.selectionMethod
  });
  
  return config;
}

/**
 * Detect if element is an authentication-related field
 * @param {Element} element - Element to check
 * @returns {boolean} True if authentication field
 */
function isAuthField(element) {
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
function isRichTextEditor(element) {
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
 * Classify field type based on element and context
 * @param {Element} element - Element to classify
 * @returns {string} Field type from FieldTypes enum
 */
export function classifyFieldType(element) {
  if (!element) return FieldTypes.UNKNOWN;
  
  // Check cache first
  if (detectionCache.has(element)) {
    return detectionCache.get(element);
  }
  
  let fieldType = FieldTypes.UNKNOWN;
  const tagName = element.tagName.toLowerCase();
  const siteConfig = getSiteConfig();
  
  try {
    // Skip authentication fields
    if (isAuthField(element)) {
      fieldType = FieldTypes.UNKNOWN;
      detectionCache.set(element, fieldType);
      return fieldType;
    }
    
    // Site-specific classification first
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
        fieldType = FieldTypes.PROFESSIONAL_EDITOR;
      } else {
        // Fallback: If it's a known professional editor site but element doesn't match selectors,
        // still treat as professional editor for better compatibility
        const hostname = window.location.hostname.toLowerCase();
        const isKnownProfessionalSite = Object.keys(EditorConfigs).some(domain => {
          if (domain === 'default') return false;
          return hostname === domain || hostname.endsWith('.' + domain) || hostname.includes(domain);
        });
        
        if (isKnownProfessionalSite) {
          fieldType = FieldTypes.PROFESSIONAL_EDITOR;
        }
      }
    }
    
    // Rich text editor detection
    if (fieldType === FieldTypes.UNKNOWN && isRichTextEditor(element)) {
      fieldType = FieldTypes.RICH_TEXT_EDITOR;
    }
    
    // ContentEditable detection
    if (fieldType === FieldTypes.UNKNOWN && 
        (element.isContentEditable || element.contentEditable === 'true')) {
      
      // Check if it has rich features
      const hasRichFeatures = element.querySelector('div, span, p, br') ||
                            element.closest('[data-editor]') ||
                            element.closest('.editor');
      
      fieldType = hasRichFeatures ? 
        FieldTypes.RICH_TEXT_EDITOR : 
        FieldTypes.CONTENT_EDITABLE;
    }
    
    // Regular form fields
    if (fieldType === FieldTypes.UNKNOWN) {
      if (tagName === 'textarea') {
        fieldType = FieldTypes.REGULAR_INPUT;
      } else if (tagName === 'input') {
        const type = (element.type || '').toLowerCase();
        const textTypes = ['text', 'search', 'email', 'url', 'tel'];
        
        if (textTypes.includes(type) || !type) {
          fieldType = FieldTypes.REGULAR_INPUT;
        }
      }
    }
    
  } catch (error) {
    logger.warn('Error classifying field type:', error);
    fieldType = FieldTypes.UNKNOWN;
  }
  
  // Cache result
  detectionCache.set(element, fieldType);
  
  logger.debug('Field classified:', {
    tagName,
    type: fieldType,
    siteConfigType: siteConfig.type,
    className: element.className?.toString().substring(0, 50)
  });
  
  return fieldType;
}

/**
 * Check if element should show selection icon
 * @param {Element} element - Element to check
 * @returns {boolean} True if should show selection icon
 */
export function shouldShowSelectionIcon(element) {
  const fieldType = classifyFieldType(element);
  
  // Show selection icon for:
  // 1. Professional editors and rich text editors (but logic should be checked in handler)
  // 2. Regular webpage content (UNKNOWN type) - for normal text selection
  // Don't show for regular form inputs (they have their own text field icon)
  return fieldType === FieldTypes.PROFESSIONAL_EDITOR || 
         fieldType === FieldTypes.RICH_TEXT_EDITOR ||
         fieldType === FieldTypes.UNKNOWN;
}

/**
 * Check if element should show text field icon
 * @param {Element} element - Element to check
 * @returns {boolean} True if should show text field icon
 */
export function shouldShowTextFieldIcon(element) {
  const fieldType = classifyFieldType(element);
  
  // Show for regular inputs and simple contentEditable
  return fieldType === FieldTypes.REGULAR_INPUT || 
         fieldType === FieldTypes.CONTENT_EDITABLE;
}

/**
 * Get selection method for field type
 * @param {Element} element - Element to check
 * @returns {string} Selection method
 */
export function getSelectionMethod(element) {
  const fieldType = classifyFieldType(element);
  const siteConfig = getSiteConfig();
  
  // Use site-specific method if available
  if (fieldType === FieldTypes.PROFESSIONAL_EDITOR) {
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
 * @returns {string} Selection strategy ('any-selection' or 'double-click-required')
 */
export function getSelectionStrategy(element) {
  const fieldType = classifyFieldType(element);
  const siteConfig = getSiteConfig();
  
  // For professional editors, use site-specific strategy
  if (fieldType === FieldTypes.PROFESSIONAL_EDITOR) {
    return siteConfig.selectionStrategy || 'double-click-required';
  }
  
  // For rich text editors, require double-click by default
  if (fieldType === FieldTypes.RICH_TEXT_EDITOR) {
    return siteConfig.selectionStrategy || 'double-click-required';
  }
  
  // For all other field types (UNKNOWN, REGULAR_INPUT, CONTENT_EDITABLE), any selection is acceptable
  return 'any-selection';
}

/**
 * Get selection event strategy for field type
 * @param {Element} element - Element to check
 * @returns {string} Selection event strategy ('mouse-based' or 'selection-based')
 */
export function getSelectionEventStrategy(element) {
  const fieldType = classifyFieldType(element);
  const siteConfig = getSiteConfig();
  
  // For professional and rich text editors, check if element is actually inside editor
  if (fieldType === FieldTypes.PROFESSIONAL_EDITOR || 
      fieldType === FieldTypes.RICH_TEXT_EDITOR) {
    
    // In iframe contexts (Google Docs, Word Online), check if element is inside actual editor
    // If not, treat as regular content for better selection handling
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
        return 'selection-based';
      }
    }
    
    return siteConfig.selectionEventStrategy || 'mouse-based';
  }
  
  // For regular webpage content, use clean selection events
  return 'selection-based';
}

/**
 * Clear detection cache (useful for testing)
 */
export function clearCache() {
  detectionCache.clear();
  domainCache.clear();
  logger.debug('Field detection cache cleared');
}

/**
 * Get cache statistics for debugging
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
  return {
    domainCacheSize: domainCache.size,
    detectionCacheSize: detectionCache.size || 'N/A (WeakMap)'
  };
}

/**
 * Main field detector class
 */
export class FieldDetector {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'FieldDetector');
  }
  
  /**
   * Detect and classify a field
   * @param {Element} element - Element to detect
   * @returns {Object} Detection result
   */
  detect(element) {
    const fieldType = classifyFieldType(element);
    const selectionMethod = getSelectionMethod(element);
    const selectionStrategy = getSelectionStrategy(element);
    const selectionEventStrategy = getSelectionEventStrategy(element);
    const siteConfig = getSiteConfig();
    
    return {
      fieldType,
      selectionMethod,
      selectionStrategy,
      selectionEventStrategy,
      shouldShowSelectionIcon: shouldShowSelectionIcon(element),
      shouldShowTextFieldIcon: shouldShowTextFieldIcon(element),
      siteConfig,
      isAuthField: isAuthField(element),
      isRichEditor: isRichTextEditor(element)
    };
  }
  
  /**
   * Check if element is editable (legacy compatibility)
   * @param {Element} element - Element to check
   * @returns {boolean} True if editable
   */
  isEditableElement(element) {
    const fieldType = classifyFieldType(element);
    return fieldType !== FieldTypes.UNKNOWN;
  }
}

// Export singleton instance
export const fieldDetector = new FieldDetector();

// Register fieldDetector globally for use by other modules
if (typeof window !== 'undefined') {
  window.fieldDetector = fieldDetector;
}