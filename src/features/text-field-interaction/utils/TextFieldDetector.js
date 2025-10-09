/**
 * Simplified Field Detector for Text Field Interaction
 * Provides basic field detection without external dependencies
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'TextFieldDetector');

// Field type constants
export const FieldTypes = {
  TEXT_INPUT: 'text-input',
  TEXT_AREA: 'text-area',
  CONTENT_EDITABLE: 'content-editable',
  RICH_TEXT_EDITOR: 'rich-text-editor',
  NON_EDITABLE: 'non-editable',
  UNKNOWN: 'unknown'
};

/**
 * Non-processable field keywords
 * These fields should be completely ignored
 */
const NonProcessableKeywords = [
  // Authentication fields
  'password', 'pwd', 'pass', 'login', 'username', 'email', 'user',
  'auth', 'signin', 'signup', 'register', 'captcha', 'otp', 'token',
  'verification', 'confirm', 'security', 'pin', 'code',
  // Phone and contact fields
  'phone', 'mobile', 'tel', 'telephone', 'fax',
  // Sensitive data
  'ssn', 'social', 'credit', 'card', 'cvv', 'expiry',
  // Numeric and data fields
  'number', 'amount', 'quantity', 'price', 'cost', 'total', 'sum',
  'count', 'age', 'year', 'month', 'day', 'date', 'time',
  'percent', 'percentage', 'rate', 'ratio',
  'zip', 'postal', 'code', 'id', 'identifier',
  // Other non-processable fields
  'zipcode', 'postal'
];

/**
 * Rich text editor detection patterns
 */
const RichEditorPatterns = [
  // Modern rich text editors
  '[data-slate-editor]', '.slate-editor',
  '.ql-editor', '.quill-editor',
  '.ProseMirror', '.pm-editor',
  // '.CodeMirror', '.cm-editor', // Removed - CodeMirror should be treated as code editor, not rich text
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
];

/**
 * Simplified field detector for text field interaction
 */
export class TextFieldDetector {

  /**
   * Detect if element should show text field icon
   * @param {Element} element - Element to check
   * @returns {Promise<Object>} Detection result
   */
  async detect(element) {
    if (!element) {
      return this._getDefaultDetection();
    }

    try {
      // Classify field type
      const fieldType = this._classifyFieldType(element);

      // Create detection result
      const detection = {
        fieldType,
        shouldShowTextFieldIcon: this._shouldShowTextFieldIcon(element, fieldType),
        isAuthField: this._isAuthField(element),
        isRichEditor: this._isRichTextEditor(element)
      };

      // Field detection details - logged at TRACE level for detailed debugging
      // logger.trace('Field detected:', {
      //   tagName: element.tagName,
      //   fieldType,
      //   shouldShowTextFieldIcon: detection.shouldShowTextFieldIcon
      // });

      return detection;

    } catch (error) {
      logger.error('Field detection failed:', error);
      return this._getDefaultDetection();
    }
  }

  /**
   * Classify field type
   * @param {Element} element - Element to classify
   * @returns {string} Field type
   */
  _classifyFieldType(element) {
    if (!element) return FieldTypes.UNKNOWN;

    const tagName = element.tagName.toLowerCase();

    // ContentEditable detection
    if (element.isContentEditable || element.contentEditable === 'true') {
      // Check if it has rich features
      const hasRichFeatures = element.querySelector('div, span, p, br') ||
                            element.closest('[data-editor]') ||
                            element.closest('.editor');

      return hasRichFeatures ? FieldTypes.RICH_TEXT_EDITOR : FieldTypes.CONTENT_EDITABLE;
    }

    // Non-processable fields
    if (this._isNonProcessableField(element)) {
      return FieldTypes.NON_EDITABLE;
    }

    // Textarea
    if (tagName === 'textarea') {
      return FieldTypes.TEXT_AREA;
    }

    // Input elements
    if (tagName === 'input') {
      const inputType = (element.type || '').toLowerCase();

      // Text-based input types
      const textInputTypes = ['text', 'search'];

      if (textInputTypes.includes(inputType) || !inputType) {
        return FieldTypes.TEXT_INPUT;
      }
    }

    return FieldTypes.NON_EDITABLE;
  }

  /**
   * Check if field should show text field icon
   * @param {Element} element - Element to check
   * @param {string} fieldType - Detected field type
   * @returns {boolean} Whether to show icon
   */
  _shouldShowTextFieldIcon(element, fieldType) {
    // First, check if this is a field we should never show icon for
    if (this._shouldNeverShowIcon(element, fieldType)) {
      return false;
    }

    // Check if this field is in a chat/comment context
    const isChatContext = this._isChatOrCommentContext(element);

    // For chat/comment contexts, show for all editable field types
    if (isChatContext) {
      const editableTypes = [
        FieldTypes.TEXT_INPUT,
        FieldTypes.TEXT_AREA,
        FieldTypes.CONTENT_EDITABLE,
        FieldTypes.RICH_TEXT_EDITOR
      ];

      return editableTypes.includes(fieldType);
    } else {
      // On other sites, only show for multiline or advanced editors
      const allowedTypes = [
        FieldTypes.TEXT_AREA,           // Multiline textarea
        FieldTypes.CONTENT_EDITABLE,     // Content editable elements
        FieldTypes.RICH_TEXT_EDITOR      // Advanced rich text editors
      ];

      // Don't show for single-line text inputs on non-chat sites
      if (!allowedTypes.includes(fieldType)) {
        return false;
      }

      // For content editable elements on non-chat sites, ensure they're not simple single-line inputs
      if (fieldType === FieldTypes.CONTENT_EDITABLE) {
        const isSingleLine = this._isLikelySingleLineContentEditable(element);
        if (isSingleLine) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check if we should never show icon for this field
   * @param {Element} element - Element to check
   * @param {string} fieldType - Field type
   * @returns {boolean} Whether to never show icon
   */
  _shouldNeverShowIcon(element, fieldType) {
    if (!element) return false;

    // Check if this is a CodeMirror editor (should be treated as code editor)
    if (this._isCodeMirrorEditor(element)) {
      return true;
    }

    // Check input type first
    if (element.tagName === 'INPUT') {
      const inputType = (element.type || '').toLowerCase();

      // Never show for these input types
      const neverShowTypes = [
        'password', 'hidden', 'file', 'image', 'button', 'submit',
        'reset', 'checkbox', 'radio', 'color', 'date', 'datetime-local',
        'email', 'month', 'number', 'range', 'search', 'tel', 'time',
        'url', 'week', 'email'
      ];

      if (neverShowTypes.includes(inputType)) {
        return true;
      }
    }

    // Check for search fields
    if (this._isSearchField(element)) {
      return true;
    }

    // Check for authentication and sensitive fields
    if (this._isAuthOrSensitiveField(element)) {
      return true;
    }

    // Check for single-line inputs that are not in chat context
    if (fieldType === FieldTypes.TEXT_INPUT && !this._isChatOrCommentContext(element)) {
      // For single-line inputs, be more restrictive
      const name = (element.name || '').toLowerCase();
      const id = (element.id || '').toLowerCase();
      const className = (element.className || '').toLowerCase();
      const placeholder = (element.placeholder || '').toLowerCase();
      const autocomplete = (element.autocomplete || '').toLowerCase();

      const combined = name + ' ' + id + ' ' + className + ' ' + placeholder + ' ' + autocomplete;

      // Additional single-line input patterns to exclude
      const excludePatterns = [
        /^user/i, /^name/i, /^login/i, /^signin/i, /^email/i,
        /^fname/i, /^lname/i, /^first/i, /^last/i,
        /^search/i, /^query/i, /^find/i, /^filter/i,
        /^\d+$/, // Pure numeric IDs
        /.*input.*/, // Generic input IDs
        /.*field.*/, // Generic field IDs
      ];

      if (excludePatterns.some(pattern => pattern.test(combined))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if element is a search field
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element is a search field
   */
  _isSearchField(element) {
    if (!element) return false;

    const attributes = [
      element.name || '',
      element.id || '',
      element.className || '',
      element.getAttribute('type') || '',
      element.getAttribute('placeholder') || '',
      element.getAttribute('aria-label') || '',
      element.getAttribute('role') || ''
    ].join(' ').toLowerCase();

    const searchPatterns = [
      'search', 'query', 'find', 'filter', 'lookup'
    ];

    return searchPatterns.some(pattern => attributes.includes(pattern));
  }

  /**
   * Check if element is an authentication or sensitive field
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element is auth/sensitive
   */
  _isAuthOrSensitiveField(element) {
    if (!element) return false;

    // Get all text attributes
    const attributes = [
      element.name || '',
      element.id || '',
      element.className || '',
      element.getAttribute('placeholder') || '',
      element.getAttribute('aria-label') || '',
      element.getAttribute('autocomplete') || '',
      element.getAttribute('data-testid') || ''
    ].join(' ').toLowerCase();

    // Extended auth and sensitive field patterns
    const sensitivePatterns = [
      // Authentication
      'user', 'username', 'login', 'signin', 'email', 'password', 'pwd',
      'pass', 'auth', 'verification', 'confirm', 'security', 'pin', 'code',
      'token', 'captcha', 'otp', 'secret', 'credential',

      // Personal information
      'fname', 'lname', 'firstname', 'lastname', 'fullname', 'name',
      'phone', 'mobile', 'telephone', 'zipcode', 'postal', 'address',
      'ssn', 'social', 'birth', 'age', 'gender', 'id',

      // Financial
      'credit', 'card', 'cvv', 'expiry', 'bank', 'account', 'payment',
      'billing', 'transaction', 'amount', 'price', 'cost',

      // Other sensitive
      'secret', 'private', 'confidential', 'secure'
    ];

    return sensitivePatterns.some(pattern => {
      // Check for whole word matches to avoid false positives
      const regex = new RegExp(`\\b${pattern}\\b`);
      return regex.test(attributes);
    });
  }

  /**
   * Check if content editable element is likely a single-line input
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element is likely single-line
   */
  _isLikelySingleLineContentEditable(element) {
    // Check for single-line indicators
    const singleLineIndicators = [
      'input', 'chat', 'message', 'comment', 'search', 'query',
      'prompt', 'command', 'terminal', 'console'
    ];

    // Check element attributes and classes
    const id = (element.id || '').toLowerCase();
    const className = (element.className || '').toLowerCase();
    const placeholder = (element.getAttribute('placeholder') || '').toLowerCase();
    const dataAttr = (element.getAttribute('data-placeholder') || '').toLowerCase();

    const combinedText = id + ' ' + className + ' ' + placeholder + ' ' + dataAttr;

    // Check for single-line keywords
    const hasSingleLineKeyword = singleLineIndicators.some(keyword =>
      combinedText.includes(keyword)
    );

    // Check if it's a simple div without block elements
    const hasBlockElements = element.querySelector('p, div, br, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, li');
    const textContent = element.textContent || '';
    const hasMultipleLines = textContent.includes('\n') || element.clientHeight > 50;

    // If it has single-line keywords and no block elements, it's likely a chat input
    if (hasSingleLineKeyword && !hasBlockElements && !hasMultipleLines) {
      return true;
    }

    // Check for common single-line contenteditable patterns
    const singleLinePatterns = [
      '[contenteditable="true"][data-single-line]',
      '[contenteditable="true"].single-line',
      '[contenteditable="true"].chat-input',
      '[contenteditable="true"].message-input'
    ];

    return singleLinePatterns.some(pattern => element.matches(pattern));
  }

  /**
   * Check if element is in a chat or comment context
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element is in chat/comment context
   */
  _isChatOrCommentContext(element) {
    if (!element) return false;

    // Check element itself for chat/comment patterns
    const elementCheck = this._checkElementForChatPatterns(element);
    if (elementCheck) return true;

    // Check parent elements up the DOM tree
    let parent = element.parentElement;
    let depth = 0;
    const maxDepth = 10; // Limit how far we look up

    while (parent && depth < maxDepth) {
      const parentCheck = this._checkElementForChatPatterns(parent);
      if (parentCheck) return true;

      // Also check for common chat container patterns
      if (this._isChatContainer(parent)) return true;

      parent = parent.parentElement;
      depth++;
    }

    // Check page-level indicators
    return this._hasPageLevelChatIndicators();
  }

  /**
   * Check if element matches chat/comment patterns
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element has chat patterns
   */
  _checkElementForChatPatterns(element) {
    if (!element) return false;

    const attributes = [
      element.id || '',
      element.className || '',
      element.getAttribute('data-testid') || '',
      element.getAttribute('data-role') || '',
      element.getAttribute('aria-label') || '',
      element.getAttribute('placeholder') || '',
      element.getAttribute('name') || ''
    ].join(' ').toLowerCase();

    // Chat/comment keywords
    const chatKeywords = [
      'chat', 'message', 'comment', 'reply', 'conversation',
      'discussion', 'thread', 'post', 'tweet', 'status',
      'input-message', 'chat-input', 'comment-input',
      'message-box', 'chat-box', 'reply-box',
      'compose', 'new-message', 'send-message'
    ];

    // Check if any keyword matches
    return chatKeywords.some(keyword => attributes.includes(keyword));
  }

  /**
   * Check if element is a chat container
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element is a chat container
   */
  _isChatContainer(element) {
    if (!element) return false;

    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();

    // Common chat container patterns
    const containerPatterns = [
      // Class patterns
      /chat-?container/i,
      /chat-?list/i,
      /message-?list/i,
      /conversation-?list/i,
      /comments?/i,
      /replies?/i,
      /thread/i,
      /discussion/i,

      // ID patterns
      /chat-?container/i,
      /message-?container/i,
      /comment-?section/i
    ];

    return containerPatterns.some(pattern =>
      pattern.test(className) || pattern.test(id)
    );
  }

  /**
   * Check if page has chat indicators
   * @returns {boolean} Whether page has chat indicators
   */
  _hasPageLevelChatIndicators() {
    if (typeof document === 'undefined') return false;

    // Look for multiple chat-like elements on the page
    const chatElements = document.querySelectorAll(
      '[contenteditable="true"], ' +
      'textarea, ' +
      'input[type="text"], ' +
      'input[type="search"]'
    );

    // Count elements with chat-like attributes
    let chatLikeCount = 0;
    chatElements.forEach(el => {
      if (this._checkElementForChatPatterns(el)) {
        chatLikeCount++;
      }
    });

    // If we have multiple chat-like elements, it's likely a chat page
    return chatLikeCount >= 2;
  }

  /**
   * Check if element is a non-processable field
   * @param {Element} element - Element to check
   * @returns {boolean} Whether field is non-processable
   */
  _isNonProcessableField(element) {
    if (!element) return false;

    // Check input type
    if (element.tagName === 'INPUT') {
      const inputType = (element.type || '').toLowerCase();

      // Non-text input types
      const nonTextTypes = [
        'password', 'hidden', 'file', 'image', 'button', 'submit',
        'reset', 'checkbox', 'radio', 'color', 'date', 'datetime-local',
        'email', 'month', 'number', 'range', 'search', 'tel', 'time',
        'url', 'week'
      ];

      if (nonTextTypes.includes(inputType)) {
        return true;
      }

      // Check for authentication keywords in text inputs
      const name = (element.name || '').toLowerCase();
      const placeholder = (element.placeholder || '').toLowerCase();
      const id = (element.id || '').toLowerCase();
      const className = (element.className || '').toLowerCase();

      const combinedText = name + ' ' + placeholder + ' ' + id + ' ' + className;

      return NonProcessableKeywords.some(keyword =>
        combinedText.includes(keyword)
      );
    }

    return false;
  }

  /**
   * Check if element is an authentication field
   * @param {Element} element - Element to check
   * @returns {boolean} Whether field is for authentication
   */
  _isAuthField(element) {
    if (!element) return false;

    const authKeywords = [
      'password', 'pwd', 'pass', 'login', 'username', 'email', 'user',
      'auth', 'signin', 'signup', 'register', 'captcha', 'otp', 'token'
    ];

    const name = (element.name || '').toLowerCase();
    const placeholder = (element.placeholder || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const className = (element.className || '').toLowerCase();

    const combinedText = name + ' ' + placeholder + ' ' + id + ' ' + className;

    return authKeywords.some(keyword =>
      combinedText.includes(keyword)
    );
  }

  /**
   * Check if element is a rich text editor
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element is a rich editor
   */
  _isRichTextEditor(element) {
    if (!element) return false;

    // Check against patterns
    for (const pattern of RichEditorPatterns) {
      if (element.matches(pattern)) {
        return true;
      }
    }

    // Check class names
    const className = (element.className || '').toLowerCase();
    const classPatterns = [
      /notion-/i, /editor-/i, /rich-text/i, /wysiwyg/i,
      /draft-js/i, /slate-/i, /quill-/i, /tinymce/i,
      /ckeditor/i, /prosemirror/i
      // /codemirror/i // Removed - CodeMirror should not be treated as rich text editor
    ];

    return classPatterns.some(pattern => pattern.test(className));
  }

  /**
   * Check if element is a CodeMirror editor
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element is a CodeMirror editor
   */
  _isCodeMirrorEditor(element) {
    if (!element) return false;

    // Check direct CodeMirror patterns
    const codeMirrorPatterns = [
      '.CodeMirror',
      '.cm-editor',
      '[data-codemirror]'
    ];

    // Check if element matches any CodeMirror pattern
    for (const pattern of codeMirrorPatterns) {
      if (element.matches(pattern)) {
        return true;
      }
    }

    // Check class names for CodeMirror
    const className = (element.className || '').toLowerCase();
    const codeMirrorClassPatterns = [
      /codemirror/i,
      /cm-editor/i
    ];

    if (codeMirrorClassPatterns.some(pattern => pattern.test(className))) {
      return true;
    }

    // Check if element is inside a CodeMirror container
    const codeMirrorContainer = element.closest('.CodeMirror, .cm-editor, [data-codemirror]');
    if (codeMirrorContainer) {
      return true;
    }

    // Check for CodeMirror-specific attributes
    if (element.getAttribute('data-codemirror') !== null) {
      return true;
    }

    return false;
  }

  /**
   * Get default detection result
   * @returns {Object} Default detection result
   */
  _getDefaultDetection() {
    return {
      fieldType: FieldTypes.UNKNOWN,
      shouldShowTextFieldIcon: false,
      isAuthField: false,
      isRichEditor: false
    };
  }
}

// Export singleton instance
export const textFieldDetector = new TextFieldDetector();

// Register globally for compatibility
if (typeof window !== 'undefined') {
  window.textFieldDetector = textFieldDetector;
}