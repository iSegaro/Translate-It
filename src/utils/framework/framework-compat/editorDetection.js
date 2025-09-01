// src/utils/framework-compat/editorDetection.js

import { getScopedLogger } from '@/shared/logging/logger.js';

// Scoped cached logger
const logger = getScopedLogger("Background", 'editorDetection');


/**
 * تشخیص ویرایشگرهای پیچیده که نیاز به copy-only دارند
 * @param {HTMLElement} element - المان هدف
 * @returns {boolean} آیا این ویرایشگر پیچیده است
 */
export function isComplexEditor(element) {
  if (!element) return false;

  try {
    // بررسی ویرایشگرهای شناخته شده
    const isKnownEditor = checkKnownEditors(element);
    if (isKnownEditor) {
  logger.debug('Known editor detected:', isKnownEditor);
      return true;
    }

    // بررسی URL سایت - فقط Office suites که واقعاً پیچیده هستند
    const hostname = window.location.hostname.toLowerCase();
    const trueComplexSites = [
      'docs.google.com',
      'office.live.com',
      'sharepoint.com',
      'onedrive.live.com',
      'office365.com',
      'outlook.live.com',
      'outlook.office.com',
      'teams.microsoft.com'
    ];

    const isComplexSite = trueComplexSites.some(site => hostname.includes(site));
    if (isComplexSite) {
  logger.debug('Complex office site detected:', hostname);
      return true;
    }

    // AI چت پلتفرم‌ها را از complex sites حذف کردیم
    // چون سیستم جدید universalTextInsertion می‌تواند با آن‌ها کار کند

    // بررسی ساختار DOM پیچیده
    const hasDangerousStructure = checkDangerousStructure(element);
    if (hasDangerousStructure) {
  logger.debug('Dangerous DOM structure detected');
      return true;
    }

    return false;
  } catch (error) {
  logger.error('Error:', error);
    return false;
  }
}

/**
 * بررسی ویرایشگرهای شناخته شده
 */
function checkKnownEditors(element) {
  // بررسی CKEditor (هم نسخه قدیمی هم جدید)
  if (element.classList?.contains('cke_editable') || 
      element.classList?.contains('ck-editor__editable') ||
      element.closest?.('.cke_contents, .cke_inner, .cke_wysiwyg_frame, .ck-editor, .ck-content')) {
    return 'CKEditor';
  }

  // بررسی TinyMCE (نسخه‌های مختلف)
  if (element.classList?.contains('mce-content-body') ||
      element.classList?.contains('tox-edit-area__iframe') ||
      element.classList?.contains('tox-editor-container') ||
      element.closest?.('.mce-edit-area, .tox-edit-area, .tox-editor, .tox-tinymce, .mce-tinymce')) {
    return 'TinyMCE';
  }

  // بررسی Quill
  if (element.classList?.contains('ql-editor') ||
      element.closest?.('.ql-container, .ql-toolbar')) {
    return 'Quill';
  }

  // بررسی Draft.js
  if (element.classList?.contains('DraftEditor-root') ||
      element.closest?.('.DraftEditor-editorContainer')) {
    return 'Draft.js';
  }

  // بررسی Lexical (Meta's editor framework)
  // فقط اگر structure پیچیده داشته باشد آن را complex در نظر بگیریم
  if (element.classList?.contains('lexical-editor') ||
      element.hasAttribute?.('data-lexical-editor') ||
      element.closest?.('[data-lexical-editor], .lexical-editor')) {
    // بررسی اینکه آیا Lexical پیچیده است یا ساده
    const hasComplexLexicalStructure = element.querySelectorAll?.('[data-lexical-decorator], [data-lexical-text]').length > 5;
    return hasComplexLexicalStructure ? 'Lexical' : null;
  }

  // بررسی Slate
  if (element.hasAttribute?.('data-slate-editor') ||
      element.closest?.('[data-slate-editor], [data-slate-node="element"]')) {
    return 'Slate';
  }

  // بررسی ProseMirror (TipTap base)
  if (element.classList?.contains('ProseMirror') ||
      element.closest?.('.ProseMirror')) {
    return 'ProseMirror';
  }

  // بررسی Medium Editor
  if (element.classList?.contains('medium-editor-element') ||
      element.hasAttribute?.('data-medium-element')) {
    return 'Medium Editor';
  }

  // بررسی Monaco Editor (VSCode)
  if (element.classList?.contains('monaco-editor') ||
      element.closest?.('.monaco-editor-background')) {
    return 'Monaco Editor';
  }

  // بررسی CodeMirror
  if (element.classList?.contains('CodeMirror') ||
      element.closest?.('.CodeMirror-wrap, .CodeMirror-scroll')) {
    return 'CodeMirror';
  }

  // بررسی Google Docs
  if (element.closest?.('.kix-paginateddocumentplugin, .docs-texteventtarget-iframe')) {
    return 'Google Docs';
  }

  // بررسی AI Chat Editors - شامل Kimi.com
  // AI Chat editors معمولاً ساده هستند و نباید complex تشخیص داده شوند
  if (element.closest?.('[data-testid*="chat-input"], [data-testid*="message-input"], [class*="chat-input"], [class*="message-input"]') ||
      element.classList?.contains('chat-input-editor')) {
    return null; // به عمد null برمی‌گردانیم تا complex تشخیص داده نشود
  }

  return null;
}

/**
 * بررسی ساختار DOM خطرناک
 */
function checkDangerousStructure(element) {
  try {
    // بررسی تعداد المان‌های فرزند
    const childElementCount = element.querySelectorAll?.('*').length || 0;
    if (childElementCount > 20) {
  logger.debug('Too many child elements:', childElementCount);
      return true;
    }

    // بررسی iframe ها
    if (element.querySelector?.('iframe')) {
  logger.debug('Contains iframe');
      return true;
    }

    // بررسی script tags
    if (element.querySelector?.('script')) {
  logger.debug('Contains script tags');
      return true;
    }

    // بررسی Shadow DOM
    if (element.shadowRoot) {
  logger.debug('Has shadow root');
      return true;
    }

    // بررسی data attributes مشکوک
    const suspiciousAttributes = ['data-reactroot', 'data-slate-editor', 'data-lexical'];
    const hasSuspiciousAttrs = suspiciousAttributes.some(attr => 
      element.hasAttribute?.(attr) || element.closest?.(`[${attr}]`)
    );

    if (hasSuspiciousAttrs) {
  logger.debug('Has suspicious data attributes');
      return true;
    }

    // بررسی کلاس‌های ویرایشگرهای پیچیده
    const editorClasses = Array.from(element.classList || []);
    const hasEditorClasses = editorClasses.some(cls => 
      cls.startsWith('ck-') || cls.startsWith('ck ') ||  // CKEditor
      cls.startsWith('mce-') || cls.startsWith('tox-') || // TinyMCE
      cls.startsWith('ql-') ||  // Quill
      cls.includes('editor')    // Generic editor classes
    );
    
    if (hasEditorClasses) {
  logger.debug('Has editor classes:', editorClasses.filter(cls => 
        cls.startsWith('ck') || cls.startsWith('mce-') || cls.startsWith('tox-') || cls.startsWith('ql-') || cls.includes('editor')
      ));
      return true;
    }

    return false;
  } catch (error) {
  logger.error('Error:', error);
    return false;
  }
}