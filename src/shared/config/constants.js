// src/constants.js
// Shared constants for the extension

export const AUTO_DETECT_VALUE = "auto";
export const DEFAULT_TARGET_LANGUAGE = "fa";

export const NOTIFICATION_TIME = {
  REVERT: 1500,
  FAST: 1500,
  SUCCESS: 4000,
  INFO: 4000,
  DEFAULT: 4000,
  WARNING: 5000,
  WARNING_PROVIDER: 3000,
  ERROR: 6000,
  FATAL: 10000,
  LONG: 8000,
  HINT: 3000,
  PERSISTENT: 0
}

// HTML Input Types for text field detection
export const INPUT_TYPES = {
  // Standard text input types
  TEXT_FIELD: ['text', 'email', 'password', 'search', 'url', 'tel', 'number'],

  // Financial and banking input types (should be ignored for translation)
  FINANCIAL: ['cc-name', 'cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month', 'cc-exp-year'],

  // Date and time input types (should be ignored for translation)
  DATETIME: ['date', 'time', 'datetime-local', 'month', 'week'],

  // Control and non-text input types (should be ignored for translation)
  CONTROL: ['range', 'color', 'file', 'hidden', 'submit', 'button', 'reset', 'image'],

  // Technical and specialized input types (should be ignored for translation)
  TECHNICAL: ['code', 'email', 'password', 'search', 'url', 'tel'],

  // All input types that should be detected as text fields (for ignoring)
  ALL_TEXT_FIELDS: [
    'text', 'email', 'password', 'search', 'url', 'tel', 'number',
    'cc-name', 'cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month', 'cc-exp-year',
    'date', 'time', 'datetime-local', 'month', 'week',
    'range', 'color', 'file', 'hidden', 'submit', 'button', 'reset', 'image',
    'code'
  ]
}

// ===== UI HOST CONSTANTS =====
export const UI_HOST_IDS = {
  MAIN: 'translate-it-host-main',
  IFRAME: 'translate-it-host-iframe',
  APP_CONTAINER: 'translate-it-app-container',
  TOOLTIP: 'ti-original-text-tooltip'
};

// ===== TRANSLATION HTML CONSTANTS =====
export const TRANSLATION_HTML = {
  IGNORE_CLASS: 'ti-ignore-translation',
  NO_TRANSLATE_CLASS: 'notranslate',
  NO_TRANSLATE_VALUE: 'no',
  ICON_ID: 'translate-it-icon',
  WINDOW_CLASS: 'translation-window'
};

// ===== TEXT FIELD DETECTION CONSTANTS =====
export const FIELD_DETECTION = {
  // Field types classification
  TYPES: {
    TEXT_INPUT: 'text-input',
    TEXT_AREA: 'text-area',
    CONTENT_EDITABLE: 'content-editable',
    RICH_TEXT_EDITOR: 'rich-text-editor',
    NON_EDITABLE: 'non-editable',
    UNKNOWN: 'unknown'
  },

  // Non-processable field keywords (complete exclusion from translation)
  NON_PROCESSABLE_KEYWORDS: [
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
  ],

  // Rich text editor detection patterns (excluding code editors)
  RICH_EDITOR_PATTERNS: [
    // Modern rich text editors
    '[data-slate-editor]', '.slate-editor',
    '.ql-editor', '.quill-editor',
    '.ProseMirror', '.pm-editor',
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

  // Code editor patterns (should be excluded from rich text detection)
  CODE_EDITOR_PATTERNS: {
    CODEMIRROR: [
      '.CodeMirror',
      '.cm-editor',
      '[data-codemirror]'
    ],
    CLASS_PATTERNS: [
      /codemirror/i,
      /cm-editor/i
    ]
  },

  // Chat and comment detection patterns
  CHAT_DETECTION: {
    KEYWORDS: [
      'chat', 'message', 'comment', 'reply', 'conversation',
      'discussion', 'thread', 'post', 'tweet', 'status',
      'input-message', 'chat-input', 'comment-input',
      'message-box', 'chat-box', 'reply-box',
      'compose', 'new-message', 'send-message'
    ],
    CONTAINER_PATTERNS: [
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
    ]
  },

  // Sensitive field detection patterns (should never show translation icons)
  SENSITIVE_FIELD_PATTERNS: [
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
  ],

  // Search field patterns (should be excluded from translation)
  SEARCH_PATTERNS: [
    'search', 'query', 'find', 'filter', 'lookup'
  ],

  // Single-line contenteditable indicators
  SINGLE_LINE_INDICATORS: [
    'input', 'chat', 'message', 'comment', 'search', 'query',
    'prompt', 'command', 'terminal', 'console'
  ],

  // Single-line contenteditable patterns
  SINGLE_LINE_PATTERNS: [
    '[contenteditable="true"][data-single-line]',
    '[contenteditable="true"].single-line',
    '[contenteditable="true"].chat-input',
    '[contenteditable="true"].message-input'
  ],

  // Input types that should never show translation icons
  EXCLUDED_INPUT_TYPES: [
    'password', 'hidden', 'file', 'image', 'button', 'submit',
    'reset', 'checkbox', 'radio', 'color', 'date', 'datetime-local',
    'email', 'month', 'number', 'range', 'search', 'tel', 'time',
    'url', 'week'
  ]
};

// ===== MOBILE SYSTEM CONSTANTS =====
export const MOBILE_CONSTANTS = {
  VIEWS: {
    DASHBOARD: 'dashboard',
    SELECTION: 'selection',
    INPUT: 'input',
    PAGE_TRANSLATION: 'page_translation',
    HISTORY: 'history'
  },
  SHEET_STATE: {
    PEEK: 'peek',
    FULL: 'full',
    CLOSED: 'closed'
  },
  UI_MODE: {
    AUTO: 'auto',
    MOBILE: 'mobile',
    DESKTOP: 'desktop'
  },
  FAB: {
    SIDE: {
      LEFT: 'left',
      RIGHT: 'right'
    },
    DEFAULT_Y: 120
  }
};

// ===== TRANSLATION STATUS CONSTANTS =====
export const TRANSLATION_STATUS = {
  IDLE: 'idle',
  TRANSLATING: 'translating',
  COMPLETED: 'completed',
  ERROR: 'error'
};

// ===== GLOBAL REPOSITORY URLS =====
export const REPO_URLS = {
  GITHUB_MAIN: 'https://github.com/iSegaro/Translate-It',
  WEBAI_API: 'https://github.com/Amm1rr/WebAI-to-API'
};