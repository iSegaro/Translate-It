/**
 * Simplified Field Detector for Text Field Interaction
 * Provides basic field detection without external dependencies
 */

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
];

/**
 * Simplified field detector for text field interaction
 */
export class TextFieldDetector {
  constructor() {
    // Simple logger using console
    this.logger = {
      debug: (...args) => console.debug('[TextFieldDetector]', ...args),
      error: (...args) => console.error('[TextFieldDetector]', ...args)
    };
  }

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

      this.logger.debug('Field detected:', {
        tagName: element.tagName,
        fieldType,
        shouldShowTextFieldIcon: detection.shouldShowTextFieldIcon
      });

      return detection;

    } catch (error) {
      this.logger.error('Field detection failed:', error);
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
    // Only show for editable field types
    const editableTypes = [
      FieldTypes.TEXT_INPUT,
      FieldTypes.TEXT_AREA,
      FieldTypes.CONTENT_EDITABLE,
      FieldTypes.RICH_TEXT_EDITOR
    ];

    if (!editableTypes.includes(fieldType)) {
      return false;
    }

    // Additional checks for input fields
    if (fieldType === FieldTypes.TEXT_INPUT) {
      // Check for authentication keywords
      const name = (element.name || '').toLowerCase();
      const placeholder = (element.placeholder || '').toLowerCase();
      const id = (element.id || '').toLowerCase();
      const autocomplete = (element.autocomplete || '').toLowerCase();

      const hasAuthKeyword = NonProcessableKeywords.some(keyword =>
        name.includes(keyword) ||
        placeholder.includes(keyword) ||
        id.includes(keyword) ||
        autocomplete.includes(keyword)
      );

      if (hasAuthKeyword) {
        return false;
      }
    }

    return true;
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
      /ckeditor/i, /prosemirror/i, /codemirror/i
    ];

    return classPatterns.some(pattern => pattern.test(className));
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